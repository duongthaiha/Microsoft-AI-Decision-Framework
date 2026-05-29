import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import type { AppDependencies } from './composition.js';
import { log } from './logger.js';

export function createApp(deps: AppDependencies): express.Application {
  const app = express();
  app.use(express.json());

  // Correlation ID middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { correlationId: string }).correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
    next();
  });

  // Health endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: '@advisor/api', ts: new Date().toISOString() });
  });

  // Sessions router
  app.use('/sessions', buildSessionsRouter(deps));

  // Global error handler
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const correlationId = (req as Request & { correlationId?: string }).correlationId ?? 'unknown';
    log.error({ correlationId, errorCategory: 'UNHANDLED' }, String(err));
    res.status(500).json({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        correlationId,
      },
    });
  });

  return app;
}

function buildSessionsRouter(deps: AppDependencies): express.Router {
  const router = express.Router();
  const { conversationStore, orchestrator } = deps;

  type ReqWithCorr = Request & { correlationId: string };

  // POST /sessions — create session
  router.post('/', async (req: Request, res: Response) => {
    const correlationId = (req as ReqWithCorr).correlationId;
    try {
      const { customerOrganizationId, userId } = req.body as { customerOrganizationId?: string; userId?: string };
      if (!customerOrganizationId) {
        res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'customerOrganizationId is required', correlationId } });
        return;
      }
      const sessionId = `session-${randomUUID()}`;
      const now = new Date().toISOString();
      const session: import('@advisor/shared').AdvisorSession = {
        sessionId,
        customerOrganizationId,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
        conversationCapture: {
          sessionId,
          startedAt: now,
          turns: [],
          capturedFacts: [],
          readinessState: 'awaitingIntake' as const,
        },
      };
      if (userId) {
        session.userId = userId;
      }
      await conversationStore.createSession(session);

      // Load guidance to surface activeInstructionSetId
      const guidance = await deps.guidanceStore.loadActiveGuidance(customerOrganizationId);
      if (guidance) {
        session.activeInstructionSetId = guidance.instructionSetId;
        await conversationStore.updateSession(session);
      }

      log.info({ correlationId, sessionId, requestType: 'createSession' }, 'Session created');
      res.status(201).json({
        ok: true,
        data: { sessionId, createdAt: now, activeInstructionSetId: guidance?.instructionSetId },
      });
    } catch (err) {
      log.error({ correlationId, errorCategory: 'SESSION_CREATE' }, String(err));
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create session', correlationId } });
    }
  });

  // POST /sessions/:id/intake
  router.post('/:id/intake', async (req: Request, res: Response) => {
    const correlationId = (req as ReqWithCorr).correlationId;
    const sessionId = req.params['id'] as string;
    try {
      const session = await conversationStore.loadSession(sessionId);
      if (!session) {
        res.status(404).json({ ok: false, error: { code: 'INVALID_SESSION', message: `Session not found: ${sessionId}`, correlationId } });
        return;
      }
      const readiness = session.conversationCapture.readinessState;
      if (readiness !== 'awaitingIntake') {
        const alreadySubmitted = true;
        if (alreadySubmitted && readiness !== 'phase1InProgress') {
          res.status(409).json({ ok: false, error: { code: 'INTAKE_ALREADY_SUBMITTED', message: 'Intake already submitted for this session', correlationId } });
          return;
        }
      }
      const { intake } = req.body as { intake?: unknown };
      if (!intake) {
        res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'intake is required', correlationId } });
        return;
      }

      const intakeSubmission = intake as import('@advisor/shared').IntakeSubmission;
      // Store intake on session via convention field
      const sessionWithIntake = { ...session, _intake: intakeSubmission } as typeof session & { _intake: import('@advisor/shared').IntakeSubmission };
      await conversationStore.updateSession(sessionWithIntake);

      const firstAgentTurn = await orchestrator.processIntake(sessionWithIntake, intakeSubmission);
      const now = new Date().toISOString();
      log.info({ correlationId, sessionId, requestType: 'submitIntake' }, 'Intake submitted');
      res.json({ ok: true, data: { sessionId, submittedAt: now, firstAgentTurn } });
    } catch (err) {
      log.error({ correlationId, sessionId, errorCategory: 'INTAKE_SUBMIT' }, String(err));
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to process intake', correlationId } });
    }
  });

  // POST /sessions/:id/messages
  router.post('/:id/messages', async (req: Request, res: Response) => {
    const correlationId = (req as ReqWithCorr).correlationId;
    const sessionId = req.params['id'] as string;
    try {
      const session = await conversationStore.loadSession(sessionId);
      if (!session) {
        res.status(404).json({ ok: false, error: { code: 'INVALID_SESSION', message: `Session not found: ${sessionId}`, correlationId } });
        return;
      }
      const { content } = req.body as { content?: string };
      if (!content) {
        res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'content is required', correlationId } });
        return;
      }

      const { agentTurn, readinessState } = await orchestrator.processMessage(session, content);
      const userTurnId = `turn-user-${randomUUID()}`;
      log.info({ correlationId, sessionId, requestType: 'sendMessage', readinessState }, 'Message processed');
      res.json({ ok: true, data: { sessionId, userTurnId, agentTurn, readinessState } });
    } catch (err) {
      log.error({ correlationId, sessionId, errorCategory: 'SEND_MESSAGE' }, String(err));
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to process message', correlationId } });
    }
  });

  // GET /sessions/:id/messages/latest
  router.get('/:id/messages/latest', async (req: Request, res: Response) => {
    const correlationId = (req as ReqWithCorr).correlationId;
    const sessionId = req.params['id'] as string;
    try {
      const session = await conversationStore.loadSession(sessionId);
      if (!session) {
        res.status(404).json({ ok: false, error: { code: 'INVALID_SESSION', message: `Session not found: ${sessionId}`, correlationId } });
        return;
      }
      const latestAgentTurn = [...session.conversationCapture.turns].reverse().find((t) => t.role === 'agent');
      if (!latestAgentTurn) {
        res.status(404).json({ ok: false, error: { code: 'MISSING_CONTEXT', message: 'No agent turns yet', correlationId } });
        return;
      }
      res.json({ ok: true, data: { sessionId, latestAgentTurn, readinessState: session.conversationCapture.readinessState ?? 'awaitingIntake' } });
    } catch (err) {
      log.error({ correlationId, sessionId, errorCategory: 'GET_LATEST' }, String(err));
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get latest response', correlationId } });
    }
  });

  // GET /sessions/:id/recommendation
  router.get('/:id/recommendation', async (req: Request, res: Response) => {
    const correlationId = (req as ReqWithCorr).correlationId;
    const sessionId = req.params['id'] as string;
    try {
      const session = await conversationStore.loadSession(sessionId);
      if (!session) {
        res.status(404).json({ ok: false, error: { code: 'INVALID_SESSION', message: `Session not found: ${sessionId}`, correlationId } });
        return;
      }
      const readiness = session.conversationCapture.readinessState;
      if (readiness !== 'recommendationDelivered' && readiness !== 'readyForRecommendation') {
        res.status(422).json({ ok: false, error: { code: 'RECOMMENDATION_NOT_READY', message: `Recommendation not ready. Current state: ${readiness ?? 'unknown'}`, correlationId } });
        return;
      }
      const recommendation = await orchestrator.buildRecommendation(session);
      res.json({ ok: true, data: { sessionId, recommendation } });
    } catch (err) {
      log.error({ correlationId, sessionId, errorCategory: 'GET_RECOMMENDATION' }, String(err));
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve recommendation', correlationId } });
    }
  });

  // GET /sessions/:id/similar-projects
  router.get('/:id/similar-projects', async (req: Request, res: Response) => {
    const correlationId = (req as ReqWithCorr).correlationId;
    const sessionId = req.params['id'] as string;
    try {
      const session = await conversationStore.loadSession(sessionId);
      if (!session) {
        res.status(404).json({ ok: false, error: { code: 'INVALID_SESSION', message: `Session not found: ${sessionId}`, correlationId } });
        return;
      }
      const matches = await orchestrator.searchSimilarProjects(session);
      const searchResult = {
        query: { query: 'similar projects', indexName: 'advisor-project-knowledge', topK: 3 },
        matches,
        searchedAt: new Date().toISOString(),
      };
      res.json({ ok: true, data: { sessionId, searchResult } });
    } catch (err) {
      log.error({ correlationId, sessionId, errorCategory: 'SIMILAR_PROJECTS' }, String(err));
      res.status(500).json({ ok: false, error: { code: 'SEARCH_FAILURE', message: 'Failed to retrieve similar projects', correlationId } });
    }
  });

  // DELETE /sessions/:id
  router.delete('/:id', async (req: Request, res: Response) => {
    const correlationId = (req as ReqWithCorr).correlationId;
    const sessionId = req.params['id'] as string;
    try {
      const session = await conversationStore.loadSession(sessionId);
      if (!session) {
        res.status(404).json({ ok: false, error: { code: 'INVALID_SESSION', message: `Session not found: ${sessionId}`, correlationId } });
        return;
      }
      const endedAt = new Date().toISOString();
      await conversationStore.endSession(sessionId, endedAt);
      log.info({ correlationId, sessionId, requestType: 'endSession' }, 'Session ended');
      res.json({ ok: true, data: { sessionId, endedAt } });
    } catch (err) {
      log.error({ correlationId, sessionId, errorCategory: 'END_SESSION' }, String(err));
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to end session', correlationId } });
    }
  });

  return router;
}
