import { randomUUID } from 'node:crypto';
import type {
  AdvisorSession, ConversationTurn, CapturedFact,
  IntakeSubmission, CustomerGuidanceDocument,
  RecommendationOutput, RationaleEntry, CustomInstructionEffect,
  TradeOffEntry, SimilarProjectHighlight, EvidenceSource,
  SimilarProjectResult,
  CriticalQuestionAnswer, CriticalQuestionId,
  Phase1Evidence, Phase2Evidence, Phase3Evidence, DecisionFrameworkEvidence,
  BxtDimension,
} from '@advisor/shared';
import { isNoMatchFound } from '@advisor/shared';
import type { IConversationStore, IGuidanceStore, IProjectSearchService, IFrameworkRetrievalService } from '@advisor/shared';
import type { ICopilotSessionService } from '@advisor/shared';
import { assembleSystemPrompt } from './instructions.js';
import { evaluateReadiness } from './readinessGates.js';
import { createFrameworkRetrievalTool } from '../tools/frameworkRetrievalTool.js';
import { createSimilarProjectLookupTool } from '../tools/similarProjectLookupTool.js';
import { log } from '../logger.js';

export interface OrchestratorDeps {
  conversationStore: IConversationStore;
  guidanceStore: IGuidanceStore;
  projectSearch: IProjectSearchService;
  frameworkRetrieval: IFrameworkRetrievalService;
  copilotService: ICopilotSessionService;
  skillPath: string;
}

export class AgentOrchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  async processIntake(
    session: AdvisorSession,
    intake: IntakeSubmission,
  ): Promise<ConversationTurn> {
    log.info({ sessionId: session.sessionId, requestType: 'processIntake' }, 'Processing intake submission');

    const guidance = await this.deps.guidanceStore.loadActiveGuidance(session.customerOrganizationId);

    // Record intake as system turn
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

    // Generate the first agent clarifying question for Phase 1
    const firstQuestion = this.generatePhase1Question(intake, guidance);
    await this.deps.conversationStore.appendTurn(session.sessionId, firstQuestion);

    log.info({ sessionId: session.sessionId, turnId: firstQuestion.turnId }, 'Phase 1 question generated');
    return firstQuestion;
  }

  async processMessage(
    session: AdvisorSession,
    userContent: string,
  ): Promise<{ agentTurn: ConversationTurn; readinessState: string }> {
    const correlationId = randomUUID();
    log.info({ correlationId, sessionId: session.sessionId, requestType: 'processMessage' }, 'Processing user message');

    // Record user turn
    const userTurn: ConversationTurn = {
      turnId: `turn-${randomUUID()}`,
      role: 'user',
      messageType: 'answer',
      content: userContent,
      timestamp: new Date().toISOString(),
    };
    await this.deps.conversationStore.appendTurn(session.sessionId, userTurn);

    // Reload session to get updated turns
    const updatedSession = await this.deps.conversationStore.loadSession(session.sessionId);
    if (!updatedSession) throw new Error(`Session lost: ${session.sessionId}`);

    // Infer phase from current readiness
    const turns = updatedSession.conversationCapture.turns;
    const lastAgentTurn = [...turns].reverse().find((t) => t.role === 'agent');
    const currentPhase = lastAgentTurn?.phase ?? 'phase1.businessImpactAssessment';

    // Assign phase to user turn
    userTurn.phase = currentPhase;
    // Update the turn in store (re-append won't work; we re-save session)
    const lastUserTurnIdx = updatedSession.conversationCapture.turns.findIndex((t) => t.turnId === userTurn.turnId);
    if (lastUserTurnIdx >= 0 && updatedSession.conversationCapture.turns[lastUserTurnIdx]) {
      (updatedSession.conversationCapture.turns[lastUserTurnIdx] as ConversationTurn).phase = currentPhase;
    }

    // Extract a captured fact
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

    // Determine next phase question or move forward
    const readiness = evaluateReadiness(updatedSession);
    let agentTurn: ConversationTurn;

    if (currentPhase === 'phase1.businessImpactAssessment') {
      // Phase 1 answered → move to Phase 2
      agentTurn = this.generatePhase2Question(intake, guidance, updatedSession);
      await this.deps.conversationStore.updateReadinessState(session.sessionId, 'phase2InProgress');
    } else if (currentPhase === 'phase2.technologyGroupings') {
      // Phase 2 answered → check if we have enough for Phase 3
      const phase2Complete = this.isPhase2Complete(updatedSession);
      if (phase2Complete) {
        agentTurn = this.generatePhase3Summary(intake, guidance, updatedSession);
        await this.deps.conversationStore.updateReadinessState(session.sessionId, 'readyForRecommendation');
      } else {
        agentTurn = this.generatePhase2FollowUp(intake, guidance, updatedSession);
      }
    } else {
      // Phase 3 / ready — generate recommendation
      agentTurn = await this.generateRecommendation(updatedSession, intake, guidance);
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
      // Try to parse cached recommendation from turn content
      try {
        const parsed = JSON.parse(recommendationTurn.content) as RecommendationOutput;
        return parsed;
      } catch {
        // Fall through to build fresh
      }
    }

    return this.buildRecommendationOutput(session, intake, guidance);
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
  // Private helpers
  // -------------------------------------------------------------------------

  private extractIntakeFromSession(session: AdvisorSession): IntakeSubmission | null {
    // The intake is stored in the session's first system turn content or
    // as a property. We use a convention: store it on session directly.
    const extSession = session as AdvisorSession & { _intake?: IntakeSubmission };
    return extSession._intake ?? null;
  }

  private generatePhase1Question(
    intake: IntakeSubmission,
    guidance: CustomerGuidanceDocument | null,
  ): ConversationTurn {
    const constraints = guidance?.organizationContext.operatingConstraints ?? [];
    const sensitiveInfo = intake.answers['sensitive_information'];
    const hasSensitiveData = Array.isArray(sensitiveInfo) && sensitiveInfo.length > 0;

    // Check if tech feasibility is already answered by intake
    const infoLocation = intake.answers['information_location'];
    const hasPermissions = infoLocation && String(infoLocation).toLowerCase().includes('sharepoint');

    const question = hasSensitiveData
      ? `To assess technology feasibility (Phase 1 BXT), I need to understand the data access model. The intake mentions sensitive information including: ${Array.isArray(sensitiveInfo) ? sensitiveInfo.join(', ') : String(sensitiveInfo)}. ${constraints.length > 0 ? `Your organization also requires: ${constraints[0]}.` : ''}\n\nDo the policy documents and guidance sources already have access controls (e.g. SharePoint permissions, role-based access) that an AI assistant should respect?\n\n**Suggested answers:**\n- Yes — SharePoint and/or system permissions are already in place\n- Partially — some content is controlled, some is not\n- Not yet — permissions would need to be set up`
      : `To complete Phase 1 Business Impact Assessment, can you confirm: is there a measurable operational problem that this AI should solve, and do you have a rough sense of how many people are affected?\n\n**Suggested answers:**\n- Yes — clear problem with measurable impact on ${intake.answers['main_users'] ?? 'named user group'}\n- Partially — the problem is clear but impact is hard to measure yet\n- Not sure yet`;

    const instructionsUsed = hasPermissions ? ['grounded-answers-only'] : [];

    const turn: ConversationTurn = {
      turnId: `turn-${randomUUID()}`,
      role: 'agent',
      messageType: 'clarifyingQuestion',
      phase: 'phase1.businessImpactAssessment',
      content: question,
      reasonAsked: 'Technology feasibility requires confirming data access controls before Phase 2.',
      timestamp: new Date().toISOString(),
    };
    
    if (instructionsUsed.length > 0) {
      turn.customInstructionAnswersUsed = instructionsUsed;
    }

    return turn;
  }

  private generatePhase2Question(
    intake: IntakeSubmission | null,
    guidance: CustomerGuidanceDocument | null,
    session: AdvisorSession,
  ): ConversationTurn {
    void session;
    const instructions = guidance?.instructions ?? [];
    const customInstructionAnswersUsed: string[] = [];
    const answeredByInstructions: string[] = [];

    // Check which Phase 2 questions are answered by custom instructions
    for (const instr of instructions) {
      if (instr.appliesToFrameworkQuestions.some((q) => q.startsWith('phase2.'))) {
        customInstructionAnswersUsed.push(instr.id);
        answeredByInstructions.push(`[${instr.id}]: ${instr.text}`);
      }
    }

    const agentShouldInterrupt = intake?.answers['agent_should_interrupt'] ?? 'not specified';
    const preferredPlace = intake?.answers['preferred_place_to_use_agent'];
    const hasTeams = Array.isArray(preferredPlace) && preferredPlace.some((p: string) => p.toLowerCase().includes('teams'));

    const preAnswered = customInstructionAnswersUsed.length > 0
      ? `\n\n**Pre-answered from your organization's custom instructions (not asking again):**\n${answeredByInstructions.map((a) => `- ${a}`).join('\n')}`
      : '';

    const teamsNote = hasTeams ? 'Your intake confirms Teams as a preferred channel. ' : '';

    const question = `Moving to Phase 2: Technology Groupings.${preAnswered}

**Question remaining:** ${teamsNote}For the POC phase, should the assistant be able to take actions in connected systems (e.g. update records, send messages), or should it only draft and recommend actions for human approval?

**Suggested answers:**
- Draft and recommend only — no system write-back in the POC
- Read-only plus draft — can read from systems, draft responses, but no writes
- Full write-back — can create records, send messages, update claim status`;

    const turn: ConversationTurn = {
      turnId: `turn-${randomUUID()}`,
      role: 'agent',
      messageType: 'clarifyingQuestion',
      phase: 'phase2.technologyGroupings',
      content: question,
      reasonAsked: 'Action safety boundary for Phase 2 Q7 (action_safety) was not fully answered by intake or instructions.',
      timestamp: new Date().toISOString(),
    };
    
    if (customInstructionAnswersUsed.length > 0) {
      turn.customInstructionAnswersUsed = customInstructionAnswersUsed;
    }

    return turn;
  }

  private isPhase2Complete(session: AdvisorSession): boolean {
    const phase2Turns = session.conversationCapture.turns.filter(
      (t) => t.phase === 'phase2.technologyGroupings' && t.role === 'user',
    );
    return phase2Turns.length >= 1;
  }

  private generatePhase2FollowUp(
    intake: IntakeSubmission | null,
    guidance: CustomerGuidanceDocument | null,
    session: AdvisorSession,
  ): ConversationTurn {
    void session;
    const buildStyle = intake?.answers['user_experience_level'] ?? 'mixed';
    return {
      turnId: `turn-${randomUUID()}`,
      role: 'agent',
      messageType: 'clarifyingQuestion',
      phase: 'phase2.technologyGroupings',
      content: `One more Phase 2 question: what is the technical build capability on the team? This affects whether a low-code tool like Copilot Studio or a pro-code approach with Azure Foundry/M365 Agents SDK is more suitable.\n\nCurrent context: users described as "${buildStyle}".\n\n**Suggested answers:**\n- Low-code/maker team — prefer Copilot Studio or Power Platform\n- Mixed team — some developers, some makers\n- Pro-code/engineering team — comfortable with Azure, TypeScript, APIs`,
      reasonAsked: 'Q8 (team_skills) missing from intake and not covered by custom instructions.',
      timestamp: new Date().toISOString(),
    };
  }

  private generatePhase3Summary(
    intake: IntakeSubmission | null,
    guidance: CustomerGuidanceDocument | null,
    session: AdvisorSession,
  ): ConversationTurn {
    void session;
    const orgName = guidance?.organizationContext.companySummary.split(' ').slice(0, 3).join(' ') ?? 'your organization';
    const preferredChannels = guidance?.organizationContext.preferredChannels.join(' and ') ?? 'preferred channels';
    const intakeSummary = intake
      ? `grounded in ${Array.isArray(intake.answers['business_knowledge']) ? (intake.answers['business_knowledge'] as string[]).slice(0, 3).join(', ') : 'policy documents'}`
      : 'grounded in your knowledge sources';

    return {
      turnId: `turn-${randomUUID()}`,
      role: 'agent',
      messageType: 'summary',
      phase: 'phase3.scenarioSpecificSelection',
      content: `I now have enough evidence to finalize the recommendation for ${orgName}.\n\nPhase 3 summary:\n- **Interaction pattern:** Assistive conversational agent in ${preferredChannels}\n- **Data strategy:** RAG-grounded retrieval ${intakeSummary}\n- **Action safety:** Human-approval required for all decisions and commitments\n- **Orchestration:** Moderate — retrieve guidance, summarize, draft, flag escalation\n\nGenerating your recommendation now... (Type anything to receive it, or just say "proceed")`,
      timestamp: new Date().toISOString(),
    };
  }

  private async generateRecommendation(
    session: AdvisorSession,
    intake: IntakeSubmission | null,
    guidance: CustomerGuidanceDocument | null,
  ): Promise<ConversationTurn> {
    const recommendation = await this.buildRecommendationOutput(session, intake, guidance);

    return {
      turnId: `turn-${randomUUID()}`,
      role: 'agent',
      messageType: 'recommendation',
      phase: 'phase3.scenarioSpecificSelection',
      content: JSON.stringify(recommendation, null, 2),
      timestamp: new Date().toISOString(),
    };
  }

  private async buildRecommendationOutput(
    session: AdvisorSession,
    intake: IntakeSubmission | null,
    guidance: CustomerGuidanceDocument | null,
  ): Promise<RecommendationOutput> {
    // Similar project lookup
    const searchQuery = intake
      ? Object.values(intake.answers).flat().join(' ').slice(0, 400)
      : `${session.customerOrganizationId} AI assistant`;

    const similarResult = await this.deps.projectSearch.similarProjects({
      query: searchQuery,
      indexName: 'advisor-project-knowledge',
      topK: 3,
    });

    const similarHighlights: SimilarProjectHighlight[] = isNoMatchFound(similarResult)
      ? []
      : similarResult.slice(0, 2).map((m) => ({
          projectId: m.projectId,
          title: m.title,
          whyItMatters: m.matchRationale,
        }));

    // Framework retrieval for grounding
    const frameworkResults = await this.deps.frameworkRetrieval.retrieve({
      query: 'claims guidance assistant Teams human approval grounded retrieval',
      phase: 'phase3.scenarioSpecificSelection',
      topK: 2,
    });
    log.info({ sessionId: session.sessionId, frameworkSources: frameworkResults.map((r) => r.source) }, 'Framework guidance retrieved for recommendation');

    const instructions = guidance?.instructions ?? [];
    const customEffects: CustomInstructionEffect[] = instructions.map((i) => ({
      instructionId: i.id,
      effect: this.describeInstructionEffect(i.id),
    }));

    const decisionEvidenceSources: EvidenceSource[] = ['intake', 'customInstructions', 'conversation', 'frameworkDocs'];
    if (!isNoMatchFound(similarResult) && similarResult.length > 0) {
      decisionEvidenceSources.push('projectSearch');
    }

    const phase1: Phase1Evidence = {
      businessViability: { assessment: 'Strong', evidence: ['Clear operational pain around claims guidance search', 'Measurable outcomes identified in intake'] },
      experienceDesirability: { assessment: 'Strong', evidence: ['Users already work in Teams and guidance repositories', 'Mixed experience levels benefit from assistive AI'] },
      technologyFeasibility: { assessment: 'Medium', evidence: ['Knowledge sources exist but freshness varies', 'Permission model confirmed in conversation'] },
    };

    const criticalQuestions = this.buildCriticalQuestions(session, intake, guidance);
    const phase2: Phase2Evidence = {
      preQuestionDoYouNeedAnAgent: { answer: 'Yes — assistive rather than autonomous for the POC', source: 'intake' },
      criticalQuestionAnswers: criticalQuestions,
      candidateTechnologyGroupings: ['grouping2.extensibilityIntoExistingCopilots', 'grouping3.buildAiAppsAndAgents', 'grouping4.aiServicesAndBuildingBlocks'],
    };

    const phase3: Phase3Evidence = {
      selectedScenarioPattern: 'Human-in-the-loop guidance assistant — Teams-first, grounded retrieval, no autonomous decisions',
      selectionInputsCoveredByCustomInstructions: instructions.map((i) => i.id),
      remainingOpenQuestions: ['Production skill set and ownership model', 'Approved source repositories and document lifecycle'],
    };

    const evidence: DecisionFrameworkEvidence = {
      phase1BusinessImpactAssessment: phase1,
      phase2TechnologyGroupings: phase2,
      phase3ScenarioSpecificSelection: phase3,
    };

    void evidence; // stored on session in real persistence

    return {
      generatedAt: new Date().toISOString(),
      status: 'recommendationReady',
      confidence: 'Medium-High',
      recommendedApproach: {
        summary: 'Start with a Teams-first human-in-the-loop guidance assistant using Copilot Studio for conversational orchestration, Azure AI Search for grounded retrieval over policy and guidance content, and Azure OpenAI or Microsoft Foundry model endpoints for summarization and drafting.',
        primaryTechnologies: [
          { name: 'Microsoft Copilot Studio', role: 'Conversational agent experience and low-code orchestration for a Teams-first POC.' },
          { name: 'Azure AI Search', role: 'Grounded retrieval over policy documents, claims guidance, procedures, and approved case examples.' },
          { name: 'Azure OpenAI / Microsoft Foundry', role: 'Language model capability for summarization, drafting, reasoning over retrieved guidance, and uncertainty-aware explanations.' },
        ],
        supportingTechnologies: [
          { name: 'Microsoft Graph connectors', role: 'Permission-aware access to Microsoft 365 content if source repositories are in SharePoint.' },
          { name: 'Application Insights', role: 'Operational telemetry, recommendation traceability, and error visibility.' },
        ],
      },
      rationale: this.buildRationale(intake, guidance),
      customInstructionInfluence: customEffects,
      tradeOffs: this.buildTradeOffs(),
      assumptions: [
        'Guidance and policy documents can be indexed or retrieved with appropriate permissions.',
        'Teams is an acceptable first-channel experience.',
        'The POC does not need to commit updates into connected systems.',
      ],
      followUpQuestions: [
        'Who owns production maintenance of prompts, source content, and escalation rules?',
        'What is the approved source-of-truth repository for policy wording?',
        'What volume of users and interactions should the production design support?',
      ],
      similarProjectHighlights: similarHighlights,
      decisionEvidenceSources,
    };
  }

  private buildCriticalQuestions(
    session: AdvisorSession,
    intake: IntakeSubmission | null,
    guidance: CustomerGuidanceDocument | null,
  ): CriticalQuestionAnswer[] {
    const conversationFacts = session.conversationCapture.capturedFacts;
    const actionFact = conversationFacts.find((f) => f.text.toLowerCase().includes('draft') || f.text.toLowerCase().includes('write-back'));

    const q1: CriticalQuestionAnswer = {
      questionId: 'user_interaction_pattern' as CriticalQuestionId,
      answer: 'Assistive conversational experience in Teams first, with later claims-system embedding.',
      source: 'intake',
      askedUser: false,
    };
    if (guidance) {
      q1.additionalSources = ['customInstructions'] as EvidenceSource[];
      q1.customInstructionAnswersUsed = ['preferred-user-experience'];
    }

    const q3: CriticalQuestionAnswer = {
      questionId: 'data_strategy' as CriticalQuestionId,
      answer: 'Ground answers in SharePoint guidance, policy PDFs, claim procedures, and selected case examples. Retrieval must respect permissions and cite sources.',
      source: 'intake',
      additionalSources: guidance ? (['customInstructions', 'conversation'] as EvidenceSource[]) : (['conversation'] as EvidenceSource[]),
      askedUser: true,
    };
    if (guidance) {
      q3.customInstructionAnswersUsed = ['grounded-answers-only'];
    }

    const q7: CriticalQuestionAnswer = {
      questionId: 'action_safety' as CriticalQuestionId,
      answer: actionFact ? actionFact.text : 'Draft and recommend only — no system write-back in the POC.',
      source: actionFact ? 'conversation' : 'customInstructions',
      askedUser: !!actionFact,
    };
    if (guidance) {
      q7.additionalSources = ['customInstructions'] as EvidenceSource[];
      q7.customInstructionAnswersUsed = ['human-approval-required'];
    }

    const questions: CriticalQuestionAnswer[] = [
      q1,
      {
        questionId: 'build_style_control_level' as CriticalQuestionId,
        answer: 'Low-code/managed orchestration acceptable for POC, with pro-code APIs where claims-system integration becomes necessary.',
        source: 'agentInference',
        askedUser: false,
      },
      q3,
      {
        questionId: 'orchestration_complexity' as CriticalQuestionId,
        answer: 'Moderate: summarize context, retrieve guidance, draft responses, flag escalation. No autonomous write-back in the POC.',
        source: 'intake',
        additionalSources: ['conversation'] as EvidenceSource[],
        askedUser: true,
      },
      {
        questionId: 'compliance_governance' as CriticalQuestionId,
        answer: 'High: personal, financial, and potentially medical data require auditability, permission trimming, human review, and uncertainty handling.',
        source: 'intake',
        askedUser: false,
      },
      {
        questionId: 'scale_cost' as CriticalQuestionId,
        answer: 'Initial POC scale: claims handlers and team leaders. Production scale remains an open follow-up.',
        source: 'intake',
        askedUser: false,
      },
      q7,
      {
        questionId: 'team_skills' as CriticalQuestionId,
        answer: 'Unknown — should be confirmed before production architecture selection.',
        source: 'missingEvidence',
        askedUser: false,
        followUpNeeded: true,
      },
      {
        questionId: 'proactive_vs_reactive' as CriticalQuestionId,
        answer: 'Both: reactive support on demand plus proactive alerts when evidence is missing or risk is high.',
        source: 'intake',
        askedUser: false,
      },
    ];

    return questions;
  }

  private buildRationale(intake: IntakeSubmission | null, guidance: CustomerGuidanceDocument | null): RationaleEntry[] {
    const rationale: RationaleEntry[] = [
      {
        reason: 'The business problem is guidance retrieval and summarization inside a workflow — not generic chat.',
        evidence: [
          intake?.answers['problem_plain_english'] ? `Intake: "${String(intake.answers['problem_plain_english']).slice(0, 100)}"` : 'Confirmed by intake',
          intake?.answers['must_not_happen'] ? `Boundary: "${String(intake.answers['must_not_happen']).slice(0, 80)}"` : 'Human ownership boundary confirmed',
        ],
      },
      {
        reason: "A Teams-first assistant matches the user's preferred place to work while leaving room for claims-system embedding.",
        evidence: [
          'Intake selected Teams and claims-system as preferred channels.',
          guidance ? 'Active custom instructions prioritize Teams-first delivery.' : 'Channel preference from intake.',
        ],
      },
      {
        reason: 'Azure AI Search is needed because critical knowledge lives across documents, guidance notes, procedures, and prior cases.',
        evidence: [
          intake?.answers['information_location'] ? `Knowledge location: "${String(intake.answers['information_location']).slice(0, 100)}"` : 'Multiple knowledge sources identified in intake',
        ],
      },
      {
        reason: 'Human-in-the-loop controls are mandatory because poor advice could create customer, regulatory, and financial risk.',
        evidence: [
          intake?.answers['sensitive_information'] ? `Sensitive data: ${(intake.answers['sensitive_information'] as string[]).slice(0, 3).join(', ')}` : 'Sensitive data confirmed in intake',
          guidance ? 'Custom instructions mandate human ownership of all claim decisions.' : 'Human approval boundary from intake.',
        ],
      },
    ];
    return rationale;
  }

  private buildTradeOffs(): TradeOffEntry[] {
    return [
      { tradeOff: 'Copilot Studio accelerates the Teams-first POC but may need pro-code extension for deeper system integration.', acceptedForPoc: true },
      { tradeOff: 'Grounding through Azure AI Search improves answer quality, but document freshness, permissions, and ingestion governance become critical dependencies.', acceptedForPoc: true },
      { tradeOff: 'No autonomous write-back reduces risk, but limits measurable automation benefits in the first POC.', acceptedForPoc: true },
    ];
  }

  private describeInstructionEffect(instructionId: string): string {
    const effects: Record<string, string> = {
      'human-approval-required': 'Ruled out autonomous claim approval, payment, or system write-back for the POC.',
      'preferred-user-experience': 'Prioritized Teams-first delivery and kept system integration as a later extension.',
      'grounded-answers-only': 'Required source citations, uncertainty flags, and a grounded retrieval architecture.',
    };
    return effects[instructionId] ?? `Instruction ${instructionId} applied.`;
  }
}
