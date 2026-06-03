import { randomUUID } from 'node:crypto';
import type {
  AdvisorSession, ConversationTurn, CapturedFact,
  IntakeSubmission, CustomerGuidanceDocument,
  RecommendationOutput, SimilarProjectResult,
  IAdvisorAgent, AdvisorContext, AdvisorStage, QuestionEnvelope,
  IConversationStore, IGuidanceStore, IProjectSearchService,
} from '@advisor/shared';
import { evaluateReadiness } from './readinessGates.js';
import { log } from '../logger.js';

export interface OrchestratorDeps {
  conversationStore: IConversationStore;
  guidanceStore: IGuidanceStore;
  projectSearch: IProjectSearchService;
  /** The content "brain" — DeterministicAdvisorAgent (mock) or CopilotAdvisorAgent (copilot). */
  advisorAgent: IAdvisorAgent;
}

/**
 * AgentOrchestrator owns the deterministic conversation STATE MACHINE: phase
 * progression, readiness gates, persistence, evidence/intake/guidance loading.
 * It delegates the CONTENT of each turn (questions, summaries, recommendation)
 * to the injected IAdvisorAgent. No recommendation or question text is hardcoded
 * here — that lives behind the agent seam (deterministic mock or Copilot SDK).
 */
export class AgentOrchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  async processIntake(
    session: AdvisorSession,
    intake: IntakeSubmission,
  ): Promise<ConversationTurn> {
    log.info(
      { sessionId: session.sessionId, requestType: 'processIntake', agent: this.deps.advisorAgent.name },
      'Processing intake submission',
    );

    const guidance = await this.deps.guidanceStore.loadActiveGuidance(session.customerOrganizationId);

    const systemTurn: ConversationTurn = {
      turnId: `turn-${randomUUID()}`,
      role: 'system',
      messageType: 'summary',
      phase: 'phase1.businessImpactAssessment',
      content: `Intake submitted: ${intake.formTitle}. ${Object.keys(intake.answers).length} answers received.`,
      timestamp: new Date().toISOString(),
    };
    await this.deps.conversationStore.appendTurn(session.sessionId, systemTurn);
    await this.deps.conversationStore.updateReadinessState(session.sessionId, 'phase1InProgress');

    const env = await this.deps.advisorAgent.generateQuestion(
      this.buildContext(session, intake, guidance, 'phase1'),
    );
    const firstQuestion = this.toAgentTurn(env);
    await this.deps.conversationStore.appendTurn(session.sessionId, firstQuestion);

    log.info({ sessionId: session.sessionId, turnId: firstQuestion.turnId }, 'Phase 1 question generated');
    return firstQuestion;
  }

  async processMessage(
    session: AdvisorSession,
    userContent: string,
  ): Promise<{ agentTurn: ConversationTurn; readinessState: string }> {
    const correlationId = randomUUID();
    log.info(
      { correlationId, sessionId: session.sessionId, requestType: 'processMessage', agent: this.deps.advisorAgent.name },
      'Processing user message',
    );

    const userTurn: ConversationTurn = {
      turnId: `turn-${randomUUID()}`,
      role: 'user',
      messageType: 'answer',
      content: userContent,
      timestamp: new Date().toISOString(),
    };
    await this.deps.conversationStore.appendTurn(session.sessionId, userTurn);

    const updatedSession = await this.deps.conversationStore.loadSession(session.sessionId);
    if (!updatedSession) throw new Error(`Session lost: ${session.sessionId}`);

    const turns = updatedSession.conversationCapture.turns;
    const lastAgentTurn = [...turns].reverse().find((t) => t.role === 'agent');
    const currentPhase = lastAgentTurn?.phase ?? 'phase1.businessImpactAssessment';

    userTurn.phase = currentPhase;
    const lastUserTurnIdx = updatedSession.conversationCapture.turns.findIndex((t) => t.turnId === userTurn.turnId);
    if (lastUserTurnIdx >= 0 && updatedSession.conversationCapture.turns[lastUserTurnIdx]) {
      (updatedSession.conversationCapture.turns[lastUserTurnIdx] as ConversationTurn).phase = currentPhase;
    }

    const fact: CapturedFact = {
      factId: `fact-${randomUUID()}`,
      sourceTurnId: userTurn.turnId,
      text: userContent,
      usedFor: [currentPhase],
      evidenceSource: 'conversation',
    };
    await this.deps.conversationStore.appendFact(session.sessionId, fact);

    const guidance = await this.deps.guidanceStore.loadActiveGuidance(session.customerOrganizationId);
    const intake = this.extractIntakeFromSession(updatedSession);

    const readiness = evaluateReadiness(updatedSession);
    let agentTurn: ConversationTurn;

    if (currentPhase === 'phase1.businessImpactAssessment') {
      const env = await this.deps.advisorAgent.generateQuestion(
        this.buildContext(updatedSession, intake, guidance, 'phase2'),
      );
      agentTurn = this.toAgentTurn(env);
      await this.deps.conversationStore.updateReadinessState(session.sessionId, 'phase2InProgress');
    } else if (currentPhase === 'phase2.technologyGroupings') {
      if (this.isPhase2Complete(updatedSession)) {
        const env = await this.deps.advisorAgent.generateQuestion(
          this.buildContext(updatedSession, intake, guidance, 'phase3Summary'),
        );
        agentTurn = this.toAgentTurn(env);
        await this.deps.conversationStore.updateReadinessState(session.sessionId, 'readyForRecommendation');
      } else {
        const env = await this.deps.advisorAgent.generateQuestion(
          this.buildContext(updatedSession, intake, guidance, 'phase2FollowUp'),
        );
        agentTurn = this.toAgentTurn(env);
      }
    } else {
      agentTurn = await this.generateRecommendationTurn(updatedSession, intake, guidance);
      await this.deps.conversationStore.updateReadinessState(session.sessionId, 'recommendationDelivered');
    }

    await this.deps.conversationStore.appendTurn(session.sessionId, agentTurn);

    const finalSession = await this.deps.conversationStore.loadSession(session.sessionId);
    const finalReadiness = finalSession ? evaluateReadiness(finalSession) : readiness;

    log.info({ correlationId, sessionId: session.sessionId, readinessState: finalReadiness.state }, 'Message processed');
    return { agentTurn, readinessState: finalReadiness.state };
  }

  async buildRecommendation(session: AdvisorSession): Promise<RecommendationOutput> {
    const guidance = await this.deps.guidanceStore.loadActiveGuidance(session.customerOrganizationId);
    const intake = this.extractIntakeFromSession(session);
    const recommendationTurn = session.conversationCapture.turns.find((t) => t.messageType === 'recommendation');

    if (recommendationTurn?.content) {
      try {
        return JSON.parse(recommendationTurn.content) as RecommendationOutput;
      } catch {
        // Fall through to regenerate.
      }
    }

    return this.deps.advisorAgent.generateRecommendation(
      this.buildContext(session, intake, guidance, 'phase3Summary'),
    );
  }

  async searchSimilarProjects(session: AdvisorSession): Promise<SimilarProjectResult> {
    const intake = this.extractIntakeFromSession(session);
    const query = intake
      ? `${Object.values(intake.answers).flat().join(' ')}`
      : `${session.customerOrganizationId} AI advisor project`;

    return this.deps.projectSearch.similarProjects({
      query: query.slice(0, 500),
      indexName: 'advisor-project-knowledge',
      topK: 3,
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers (state machine only — no content)
  // -------------------------------------------------------------------------

  private buildContext(
    session: AdvisorSession,
    intake: IntakeSubmission | null,
    guidance: CustomerGuidanceDocument | null,
    stage: AdvisorStage,
  ): AdvisorContext {
    return { session, intake, guidance, stage };
  }

  private toAgentTurn(env: QuestionEnvelope): ConversationTurn {
    const turn: ConversationTurn = {
      turnId: `turn-${randomUUID()}`,
      role: 'agent',
      messageType: env.messageType,
      phase: env.phase,
      content: env.content,
      timestamp: new Date().toISOString(),
    };
    if (env.reasonAsked) turn.reasonAsked = env.reasonAsked;
    if (env.customInstructionAnswersUsed && env.customInstructionAnswersUsed.length > 0) {
      turn.customInstructionAnswersUsed = env.customInstructionAnswersUsed;
    }
    return turn;
  }

  private async generateRecommendationTurn(
    session: AdvisorSession,
    intake: IntakeSubmission | null,
    guidance: CustomerGuidanceDocument | null,
  ): Promise<ConversationTurn> {
    const recommendation = await this.deps.advisorAgent.generateRecommendation(
      this.buildContext(session, intake, guidance, 'phase3Summary'),
    );
    return {
      turnId: `turn-${randomUUID()}`,
      role: 'agent',
      messageType: 'recommendation',
      phase: 'phase3.scenarioSpecificSelection',
      content: JSON.stringify(recommendation, null, 2),
      timestamp: new Date().toISOString(),
    };
  }

  private extractIntakeFromSession(session: AdvisorSession): IntakeSubmission | null {
    const extSession = session as AdvisorSession & { _intake?: IntakeSubmission };
    return extSession._intake ?? null;
  }

  private isPhase2Complete(session: AdvisorSession): boolean {
    const phase2Turns = session.conversationCapture.turns.filter(
      (t) => t.phase === 'phase2.technologyGroupings' && t.role === 'user',
    );
    return phase2Turns.length >= 1;
  }
}
