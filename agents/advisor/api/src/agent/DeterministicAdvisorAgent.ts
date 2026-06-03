/**
 * DeterministicAdvisorAgent — the scripted, offline, deterministic agent.
 *
 * Selected when ADVISOR_AGENT_MODE=mock (the default). It produces stable
 * output with no LLM call, which is what the test suite, eval cases, and the
 * deployed default rely on. This is intentionally NOT framework-reasoned
 * intelligence: it is a fixed script. The real, framework-driven agent is
 * CopilotAdvisorAgent.
 *
 * All of the previously-hardcoded phase-question + recommendation logic that
 * used to live inside AgentOrchestrator now lives here, behind the IAdvisorAgent
 * seam, so the orchestrator's production path is free of hardcoded claims text.
 */

import type {
  AdvisorContext,
  AdvisorSession,
  CriticalQuestionAnswer,
  CriticalQuestionId,
  CustomInstructionEffect,
  CustomerGuidanceDocument,
  DecisionFrameworkEvidence,
  EvidenceSource,
  IAdvisorAgent,
  IFrameworkRetrievalService,
  IntakeSubmission,
  IProjectSearchService,
  Phase1Evidence,
  Phase2Evidence,
  Phase3Evidence,
  QuestionEnvelope,
  RationaleEntry,
  RecommendationOutput,
  SimilarProjectHighlight,
  SimilarProjectResult,
  TradeOffEntry,
} from '@advisor/shared';
import { isNoMatchFound } from '@advisor/shared';
import { log } from '../logger.js';

export interface DeterministicAdvisorAgentDeps {
  projectSearch: IProjectSearchService;
  frameworkRetrieval: IFrameworkRetrievalService;
}

export class DeterministicAdvisorAgent implements IAdvisorAgent {
  readonly name = 'deterministic';

  constructor(private readonly deps: DeterministicAdvisorAgentDeps) {}

  async generateQuestion(ctx: AdvisorContext): Promise<QuestionEnvelope> {
    switch (ctx.stage) {
      case 'phase1':
        return this.generatePhase1Question(ctx.intake, ctx.guidance);
      case 'phase2':
        return this.generatePhase2Question(ctx.intake, ctx.guidance);
      case 'phase2FollowUp':
        return this.generatePhase2FollowUp(ctx.intake);
      case 'phase3Summary':
        return this.generatePhase3Summary(ctx.intake, ctx.guidance);
      default: {
        const exhaustive: never = ctx.stage;
        throw new Error(`Unknown advisor stage: ${String(exhaustive)}`);
      }
    }
  }

  async generateRecommendation(ctx: AdvisorContext): Promise<RecommendationOutput> {
    return this.buildRecommendationOutput(ctx.session, ctx.intake, ctx.guidance);
  }

  // -------------------------------------------------------------------------
  // Phase question generators (relocated from AgentOrchestrator)
  // -------------------------------------------------------------------------

  private generatePhase1Question(
    intake: IntakeSubmission | null,
    guidance: CustomerGuidanceDocument | null,
  ): QuestionEnvelope {
    const constraints = guidance?.organizationContext.operatingConstraints ?? [];
    const sensitiveInfo = intake?.answers['sensitive_information'];
    const hasSensitiveData = Array.isArray(sensitiveInfo) && sensitiveInfo.length > 0;

    const infoLocation = intake?.answers['information_location'];
    const hasPermissions = infoLocation && String(infoLocation).toLowerCase().includes('sharepoint');

    const question = hasSensitiveData
      ? `To assess technology feasibility (Phase 1 BXT), I need to understand the data access model. The intake mentions sensitive information including: ${Array.isArray(sensitiveInfo) ? sensitiveInfo.join(', ') : String(sensitiveInfo)}. ${constraints.length > 0 ? `Your organization also requires: ${constraints[0]}.` : ''}\n\nDo the policy documents and guidance sources already have access controls (e.g. SharePoint permissions, role-based access) that an AI assistant should respect?\n\n**Suggested answers:**\n- Yes — SharePoint and/or system permissions are already in place\n- Partially — some content is controlled, some is not\n- Not yet — permissions would need to be set up`
      : `To complete Phase 1 Business Impact Assessment, can you confirm: is there a measurable operational problem that this AI should solve, and do you have a rough sense of how many people are affected?\n\n**Suggested answers:**\n- Yes — clear problem with measurable impact on ${intake?.answers['main_users'] ?? 'named user group'}\n- Partially — the problem is clear but impact is hard to measure yet\n- Not sure yet`;

    const instructionsUsed = hasPermissions ? ['grounded-answers-only'] : [];

    const env: QuestionEnvelope = {
      messageType: 'clarifyingQuestion',
      phase: 'phase1.businessImpactAssessment',
      content: question,
      reasonAsked: 'Technology feasibility requires confirming data access controls before Phase 2.',
    };
    if (instructionsUsed.length > 0) {
      env.customInstructionAnswersUsed = instructionsUsed;
    }
    return env;
  }

  private generatePhase2Question(
    intake: IntakeSubmission | null,
    guidance: CustomerGuidanceDocument | null,
  ): QuestionEnvelope {
    const instructions = guidance?.instructions ?? [];
    const customInstructionAnswersUsed: string[] = [];
    const answeredByInstructions: string[] = [];

    for (const instr of instructions) {
      if (instr.appliesToFrameworkQuestions.some((q) => q.startsWith('phase2.'))) {
        customInstructionAnswersUsed.push(instr.id);
        answeredByInstructions.push(`[${instr.id}]: ${instr.text}`);
      }
    }

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

    const env: QuestionEnvelope = {
      messageType: 'clarifyingQuestion',
      phase: 'phase2.technologyGroupings',
      content: question,
      reasonAsked: 'Action safety boundary for Phase 2 Q7 (action_safety) was not fully answered by intake or instructions.',
    };
    if (customInstructionAnswersUsed.length > 0) {
      env.customInstructionAnswersUsed = customInstructionAnswersUsed;
    }
    return env;
  }

  private generatePhase2FollowUp(intake: IntakeSubmission | null): QuestionEnvelope {
    const buildStyle = intake?.answers['user_experience_level'] ?? 'mixed';
    return {
      messageType: 'clarifyingQuestion',
      phase: 'phase2.technologyGroupings',
      content: `One more Phase 2 question: what is the technical build capability on the team? This affects whether a low-code tool like Copilot Studio or a pro-code approach with Azure Foundry/M365 Agents SDK is more suitable.\n\nCurrent context: users described as "${buildStyle}".\n\n**Suggested answers:**\n- Low-code/maker team — prefer Copilot Studio or Power Platform\n- Mixed team — some developers, some makers\n- Pro-code/engineering team — comfortable with Azure, TypeScript, APIs`,
      reasonAsked: 'Q8 (team_skills) missing from intake and not covered by custom instructions.',
    };
  }

  private generatePhase3Summary(
    intake: IntakeSubmission | null,
    guidance: CustomerGuidanceDocument | null,
  ): QuestionEnvelope {
    const orgName = guidance?.organizationContext.companySummary.split(' ').slice(0, 3).join(' ') ?? 'your organization';
    const preferredChannels = guidance?.organizationContext.preferredChannels.join(' and ') ?? 'preferred channels';
    const intakeSummary = intake
      ? `grounded in ${Array.isArray(intake.answers['business_knowledge']) ? (intake.answers['business_knowledge'] as string[]).slice(0, 3).join(', ') : 'policy documents'}`
      : 'grounded in your knowledge sources';

    return {
      messageType: 'summary',
      phase: 'phase3.scenarioSpecificSelection',
      content: `I now have enough evidence to finalize the recommendation for ${orgName}.\n\nPhase 3 summary:\n- **Interaction pattern:** Assistive conversational agent in ${preferredChannels}\n- **Data strategy:** RAG-grounded retrieval ${intakeSummary}\n- **Action safety:** Human-approval required for all decisions and commitments\n- **Orchestration:** Moderate — retrieve guidance, summarize, draft, flag escalation\n\nGenerating your recommendation now... (Type anything to receive it, or just say "proceed")`,
    };
  }

  // -------------------------------------------------------------------------
  // Recommendation builder (relocated from AgentOrchestrator)
  // -------------------------------------------------------------------------

  private async buildRecommendationOutput(
    session: AdvisorSession,
    intake: IntakeSubmission | null,
    guidance: CustomerGuidanceDocument | null,
  ): Promise<RecommendationOutput> {
    const searchQuery = intake
      ? Object.values(intake.answers).flat().join(' ').slice(0, 400)
      : `${session.customerOrganizationId} AI assistant`;

    let similarResult: SimilarProjectResult;
    try {
      similarResult = await this.deps.projectSearch.similarProjects({
        query: searchQuery,
        indexName: 'advisor-project-knowledge',
        topK: 3,
      });
    } catch (searchErr) {
      log.warn({ sessionId: session.sessionId, searchError: String(searchErr) }, 'Similar project search failed — treating as no matches');
      similarResult = { noMatchFound: true, reason: 'Search index unavailable or not yet seeded' };
    }

    const similarHighlights: SimilarProjectHighlight[] = isNoMatchFound(similarResult)
      ? []
      : similarResult.slice(0, 2).map((m) => ({
          projectId: m.projectId,
          title: m.title,
          whyItMatters: m.matchRationale,
        }));

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

    const criticalQuestions = this.buildCriticalQuestions(session, guidance);
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
    void evidence;

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

    return [
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
  }

  private buildRationale(intake: IntakeSubmission | null, guidance: CustomerGuidanceDocument | null): RationaleEntry[] {
    return [
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
