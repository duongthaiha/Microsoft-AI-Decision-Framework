import cors from 'cors';
import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import type { AppDependencies } from './composition.js';
import { log } from './logger.js';
import type { CustomerGuidanceDocument } from '@advisor/shared';

export function createApp(deps: AppDependencies): express.Application {
  const app = express();
  app.use(express.json());
  app.use(cors());

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

  // Admin guidance router
  app.use('/admin/guidance', buildAdminGuidanceRouter(deps));

  // Admin seed router (only active when ENABLE_ADMIN_SEED=true)
  app.use('/admin/seed', buildAdminSeedRouter());

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

  // POST /sessions/:id/feedback
  router.post('/:id/feedback', async (req: Request, res: Response) => {
    const correlationId = (req as ReqWithCorr).correlationId;
    const sessionId = req.params['id'] as string;
    try {
      const { rating, comment } = req.body as { rating?: number; comment?: string };
      if (typeof rating !== 'number' || rating < 1 || rating > 5) {
        res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'rating must be a number from 1 to 5', correlationId } });
        return;
      }
      await conversationStore.submitFeedback(sessionId, {
        userRating: rating,
        userComment: comment ?? null,
        reviewStatus: 'pendingStakeholderReview',
      });
      const recordedAt = new Date().toISOString();
      log.info({ correlationId, sessionId, requestType: 'submitFeedback' }, 'Feedback submitted');
      res.json({ ok: true, data: { sessionId, recordedAt } });
    } catch (err) {
      log.error({ correlationId, sessionId, errorCategory: 'SUBMIT_FEEDBACK' }, String(err));
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to submit feedback', correlationId } });
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

function buildAdminGuidanceRouter(deps: AppDependencies): express.Router {
  const router = express.Router();
  const { guidanceStore } = deps;

  type ReqWithCorr = Request & { correlationId: string };

  router.get('/:orgId', async (req: Request, res: Response) => {
    const correlationId = (req as ReqWithCorr).correlationId;
    const orgId = req.params['orgId'] as string;
    try {
      const docs = await guidanceStore.loadAllGuidance(orgId);
      res.json({ ok: true, data: docs });
    } catch (err) {
      log.error({ correlationId, orgId, errorCategory: 'GUIDANCE_LIST' }, String(err));
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load guidance', correlationId } });
    }
  });

  router.post('/:orgId', async (req: Request, res: Response) => {
    const correlationId = (req as ReqWithCorr).correlationId;
    const orgId = req.params['orgId'] as string;
    try {
      const doc = { ...(req.body as CustomerGuidanceDocument), customerOrganizationId: orgId };
      await guidanceStore.saveGuidance(doc);
      res.status(201).json({ ok: true, data: doc });
    } catch (err) {
      log.error({ correlationId, orgId, errorCategory: 'GUIDANCE_CREATE' }, String(err));
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to save guidance', correlationId } });
    }
  });

  router.put('/:orgId/:instructionSetId', async (req: Request, res: Response) => {
    const correlationId = (req as ReqWithCorr).correlationId;
    const orgId = req.params['orgId'] as string;
    const instructionSetId = req.params['instructionSetId'] as string;
    try {
      const doc = { ...(req.body as CustomerGuidanceDocument), customerOrganizationId: orgId, instructionSetId };
      await guidanceStore.saveGuidance(doc);
      res.json({ ok: true, data: doc });
    } catch (err) {
      log.error({ correlationId, orgId, instructionSetId, errorCategory: 'GUIDANCE_UPDATE' }, String(err));
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update guidance', correlationId } });
    }
  });

  router.post('/:orgId/:instructionSetId/activate', async (req: Request, res: Response) => {
    const correlationId = (req as ReqWithCorr).correlationId;
    const orgId = req.params['orgId'] as string;
    const instructionSetId = req.params['instructionSetId'] as string;
    try {
      await guidanceStore.activateGuidance(orgId, instructionSetId);
      res.json({ ok: true, data: { activated: true } });
    } catch (err) {
      log.error({ correlationId, orgId, instructionSetId, errorCategory: 'GUIDANCE_ACTIVATE' }, String(err));
      res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to activate guidance', correlationId } });
    }
  });

  return router;
}

/**
 * Admin seed router — idempotent project-knowledge index creation + document upload.
 *
 * Only active when ENABLE_ADMIN_SEED=true is set on the container.
 * The container is VNet-integrated and reaches AI Search via private endpoint,
 * so this is the production-correct seeding path when public network access is disabled.
 *
 * POST /admin/seed/project-knowledge
 *   → ensureIndex() + uploadDocuments() using SEARCH_ENDPOINT + SEARCH_INDEX env vars.
 */
function buildAdminSeedRouter(): express.Router {
  const router = express.Router();

  type ReqWithCorr = Request & { correlationId: string };

  // Guard: disabled unless ENABLE_ADMIN_SEED=true
  router.use((_req: Request, res: Response, next: NextFunction) => {
    if (process.env['ENABLE_ADMIN_SEED'] !== 'true') {
      res.status(403).json({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Admin seed endpoint is not enabled on this deployment.' },
      });
      return;
    }
    next();
  });

  router.post('/project-knowledge', async (req: Request, res: Response) => {
    const correlationId = (req as ReqWithCorr).correlationId;
    const searchEndpoint = process.env['SEARCH_ENDPOINT'];
    const indexName = process.env['SEARCH_INDEX'] ?? 'advisor-project-knowledge';

    if (!searchEndpoint) {
      res.status(500).json({
        ok: false,
        error: { code: 'CONFIG_ERROR', message: 'SEARCH_ENDPOINT is not configured.', correlationId },
      });
      return;
    }

    try {
      log.info({ correlationId, indexName, requestType: 'adminSeed' }, 'Admin seed: ensuring index and uploading documents');

      // Dynamically import to keep Azure SDK out of the in-memory bundle.
      const { AzureAiSearchProjectSearch, SEED_PROJECT_KNOWLEDGE_DOCUMENTS } =
        await import('@advisor/data').catch(() => {
          throw new Error('Failed to load @advisor/data. Ensure the data workspace is built.');
        }) as typeof import('@advisor/data');

      const projectSearch = new AzureAiSearchProjectSearch({ endpoint: searchEndpoint, indexName });

      await projectSearch.ensureIndex();
      log.info({ correlationId, indexName }, 'Admin seed: index ensured');

      const docs = SEED_PROJECT_KNOWLEDGE_DOCUMENTS.map(AzureAiSearchProjectSearch.toSearchDocument);
      await projectSearch.uploadDocuments(docs);

      log.info({ correlationId, indexName, count: docs.length }, 'Admin seed: documents uploaded');
      res.json({ ok: true, data: { indexName, documentsSeeded: docs.length, idempotent: true } });
    } catch (err) {
      log.error({ correlationId, errorCategory: 'ADMIN_SEED' }, String(err));
      res.status(500).json({
        ok: false,
        error: { code: 'SEED_FAILED', message: String(err), correlationId },
      });
    }
  });

  return router;
}
