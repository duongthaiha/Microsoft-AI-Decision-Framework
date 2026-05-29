/**
 * Seed project knowledge documents for the POC project-knowledge index.
 *
 * Six representative projects covering diverse industries, interaction patterns,
 * and governance requirements. The NFU Mutual insurance project is the primary
 * reference case; the others provide contrast for realistic similar-project
 * matching across different verticals.
 *
 * None of these documents contain real customer-sensitive data.
 * IDs match the corresponding projectId in sample-project-data-nfum.json
 * where applicable.
 */

import type { ProjectKnowledgeDocument } from '@advisor/shared';

export const SEED_PROJECT_KNOWLEDGE_DOCUMENTS: ProjectKnowledgeDocument[] = [
  // -------------------------------------------------------------------------
  // 1. NFU Mutual — Rural Claims Advisor (primary POC reference case)
  // -------------------------------------------------------------------------
  {
    projectId: 'proj-nfum-rural-claims-advisor-001',
    customerOrganizationId: 'org-nfum',
    title: 'Rural Claims Advisor Agent — NFU Mutual',
    summary:
      'Assistive agent embedded in Microsoft Teams that helps claims handlers ' +
      'navigate policy documents, internal guidance, and prior claim notes. ' +
      'Surfaces recommended next actions with source citations. Human approval ' +
      'required for all decisions, payments, and customer commitments.',
    businessOutcome:
      'Reduced average claim-handling time during weather-related spikes; ' +
      'improved consistency for newer handlers; explainable outputs reviewable ' +
      'by team leaders and compliance.',
    industry: 'Insurance',
    businessDomain: 'Rural and agricultural claims',
    useCaseTags: [
      'claims-handler-productivity',
      'policy-document-retrieval',
      'guided-decision-support',
      'weather-event-claims',
    ],
    frameworkTags: [
      'phase1.businessImpactAssessment',
      'phase2.technologyGroupings',
      'phase3.scenarioSpecificSelection',
      'grouping3.buildAiAppsAndAgents',
    ],
    technologyTags: [
      'Microsoft Copilot Studio',
      'Azure AI Search',
      'Azure OpenAI',
      'Microsoft Teams',
      'SharePoint',
    ],
    dataSourceTags: ['policy-documents', 'internal-guidance', 'claim-history'],
    sensitivityLevel: 'Medium',
    status: 'recommended',
    searchableText:
      'Insurance claims handler productivity policy document retrieval grounded ' +
      'answers human approval Teams integration assistive copilot rural agricultural ' +
      'NFU Mutual weather storm claims handler guidance RAG hybrid search',
    similarProjectSignals: {
      interactionPattern: 'assistive conversational agent in Microsoft Teams',
      proactivity: 'reactive — responds to handler queries on demand',
      dataPattern: 'grounded retrieval over policy and guidance documents (RAG)',
      actionSafety: 'draft and recommend only — no autonomous decisions or payments',
      governancePattern:
        'human approval for all decisions; source citations required; audit trail; explainable to compliance',
    },
  },

  // -------------------------------------------------------------------------
  // 2. Commercial Insurance — Policy Guidance Assistant
  // -------------------------------------------------------------------------
  {
    projectId: 'proj-insurance-guidance-assistant-014',
    customerOrganizationId: 'org-commercial-insurer',
    title: 'Policy Guidance Assistant for Commercial Insurance',
    summary:
      'Grounded Q&A assistant for commercial insurance brokers. Answers policy ' +
      'coverage questions by retrieving and citing approved policy documents ' +
      'and underwriting guidelines. Deployed in a custom web portal.',
    businessOutcome:
      'Faster broker query resolution; reduction in escalations to underwriters ' +
      'for routine coverage questions.',
    industry: 'Insurance',
    businessDomain: 'Commercial property and casualty',
    useCaseTags: [
      'broker-self-service',
      'policy-coverage-qa',
      'underwriting-guidance',
      'document-grounding',
    ],
    frameworkTags: [
      'phase2.technologyGroupings',
      'phase3.scenarioSpecificSelection',
      'grouping3.buildAiAppsAndAgents',
    ],
    technologyTags: ['Microsoft Copilot Studio', 'Azure AI Search', 'Azure OpenAI'],
    dataSourceTags: ['policy-documents', 'underwriting-guidelines'],
    sensitivityLevel: 'Medium',
    status: 'completed',
    searchableText:
      'Commercial insurance broker policy coverage questions grounded answers ' +
      'underwriting guidelines document retrieval assistive agent regulated industry ' +
      'source citations human approval',
    similarProjectSignals: {
      interactionPattern: 'assistive Q&A agent in a custom web portal',
      proactivity: 'reactive',
      dataPattern: 'grounded retrieval over policy and underwriting documents',
      actionSafety: 'read-only — no write actions',
      governancePattern: 'source citations required; underwriter escalation path',
    },
  },

  // -------------------------------------------------------------------------
  // 3. Claims Triage — Weather Event Copilot
  // -------------------------------------------------------------------------
  {
    projectId: 'proj-claims-triage-copilot-022',
    customerOrganizationId: 'org-regional-insurer',
    title: 'Claims Triage Copilot for Weather Events',
    summary:
      'Triage copilot deployed during storm and flood claim spikes. Categorises ' +
      'incoming claim notifications by severity and routes to appropriate handler ' +
      'queues. Uses proactive alerts when a claim pattern indicates an escalation ' +
      'risk.',
    businessOutcome:
      'Reduced claim triage backlog during peak weather events; improved routing ' +
      'accuracy; handler queues balanced automatically.',
    industry: 'Insurance',
    businessDomain: 'Property and casualty claims triage',
    useCaseTags: [
      'claims-triage',
      'weather-event-routing',
      'severity-classification',
      'queue-management',
    ],
    frameworkTags: [
      'phase2.technologyGroupings',
      'phase3.scenarioSpecificSelection',
      'grouping3.buildAiAppsAndAgents',
      'grouping4.aiServicesAndBuildingBlocks',
    ],
    technologyTags: ['Microsoft Foundry', 'Azure AI Search', 'Azure App Service'],
    dataSourceTags: ['claims-data', 'weather-feeds', 'handler-capacity-data'],
    sensitivityLevel: 'Medium',
    status: 'completed',
    searchableText:
      'Claims triage weather storm flood events severity routing queue management ' +
      'proactive alerts classification pro-code agent Azure Foundry insurance handler',
    similarProjectSignals: {
      interactionPattern: 'autonomous triage with human escalation gates',
      proactivity: 'reactive plus risk-based proactive alerts on claim patterns',
      dataPattern: 'classification over structured claims and weather data',
      actionSafety: 'autonomous routing; human approval for escalation decisions',
      governancePattern:
        'audit log of routing decisions; human override at all stages',
    },
  },

  // -------------------------------------------------------------------------
  // 4. HR Policy Advisor — Internal Self-Service Agent
  // -------------------------------------------------------------------------
  {
    projectId: 'proj-hr-policy-advisor-031',
    customerOrganizationId: 'org-enterprise-hr',
    title: 'HR Policy Advisor Agent',
    summary:
      'Internal self-service agent for employee HR policy questions. Grounded in ' +
      'HR policy documents hosted in SharePoint. Surfaces relevant policy sections ' +
      'with citations. Escalates unresolved queries to HR team via email.',
    businessOutcome:
      'Reduced HR team ticket volume for routine policy questions; improved ' +
      'employee experience; faster policy lookup.',
    industry: 'Human Resources',
    businessDomain: 'Internal employee self-service',
    useCaseTags: [
      'hr-policy-qa',
      'employee-self-service',
      'document-grounding',
      'internal-knowledge-base',
    ],
    frameworkTags: [
      'phase2.technologyGroupings',
      'phase3.scenarioSpecificSelection',
      'grouping2.extensibilityIntoExistingCopilots',
      'grouping3.buildAiAppsAndAgents',
    ],
    technologyTags: ['Copilot Studio', 'SharePoint Graph Connector', 'Azure OpenAI'],
    dataSourceTags: ['sharepoint-hr-policies', 'employee-handbook'],
    sensitivityLevel: 'Low',
    status: 'completed',
    searchableText:
      'HR policy advisor employee self-service SharePoint document retrieval ' +
      'grounded answers internal knowledge base copilot studio low-code regulated ' +
      'governance citations escalation',
    similarProjectSignals: {
      interactionPattern: 'assistive Q&A agent — employees ask, agent answers',
      proactivity: 'reactive',
      dataPattern: 'grounded retrieval over internal SharePoint policy documents',
      actionSafety: 'read-only — escalates via email, no system writes',
      governancePattern: 'citations required; HR team escalation path',
    },
  },

  // -------------------------------------------------------------------------
  // 5. Banking — Regulatory Compliance Q&A Assistant
  // -------------------------------------------------------------------------
  {
    projectId: 'proj-banking-compliance-assistant-007',
    customerOrganizationId: 'org-uk-bank',
    title: 'Regulatory Compliance Q&A Assistant — UK Banking',
    summary:
      'Assistive agent for compliance analysts at a UK retail bank. Answers ' +
      'questions about FCA/PRA regulatory requirements, internal compliance ' +
      'policies, and recent regulatory updates. High governance bar: all answers ' +
      'include source references; flagged uncertainty triggers human review.',
    businessOutcome:
      'Compliance analyst productivity improvement; reduction in escalations to ' +
      'legal team for standard regulatory questions; audit-ready interaction logs.',
    industry: 'Financial Services',
    businessDomain: 'Regulatory compliance',
    useCaseTags: [
      'regulatory-compliance-qa',
      'policy-retrieval',
      'analyst-productivity',
      'audit-trail',
    ],
    frameworkTags: [
      'phase1.businessImpactAssessment',
      'phase2.technologyGroupings',
      'phase3.scenarioSpecificSelection',
      'grouping3.buildAiAppsAndAgents',
      'grouping4.aiServicesAndBuildingBlocks',
    ],
    technologyTags: [
      'Microsoft Foundry',
      'Azure AI Search',
      'Azure OpenAI',
      'Azure Key Vault',
    ],
    dataSourceTags: ['regulatory-documents', 'internal-compliance-policies', 'fca-pra-updates'],
    sensitivityLevel: 'High',
    status: 'inProgress',
    searchableText:
      'Banking regulatory compliance FCA PRA analyst assistant grounded retrieval ' +
      'audit trail source citations high governance pro-code regulated financial ' +
      'services UK human review uncertainty flagging',
    similarProjectSignals: {
      interactionPattern: 'assistive conversational agent for compliance analysts',
      proactivity: 'reactive',
      dataPattern: 'grounded retrieval over regulatory and compliance documents',
      actionSafety: 'read-only — no autonomous regulatory filings',
      governancePattern:
        'mandatory source citations; uncertainty flagging; audit log; human review on flagged answers',
    },
  },

  // -------------------------------------------------------------------------
  // 6. Retail — Inventory Replenishment Agent
  // -------------------------------------------------------------------------
  {
    projectId: 'proj-retail-inventory-agent-045',
    customerOrganizationId: 'org-retail-chain',
    title: 'Inventory Replenishment Recommendation Agent',
    summary:
      'Autonomous agent that monitors stock levels and sales velocity, forecasts ' +
      'replenishment needs, and raises purchase orders for human approval. ' +
      'Integrates with ERP and supply chain data. Pro-code, Microsoft Foundry.',
    businessOutcome:
      'Reduced stockout incidents; inventory cost optimisation; procurement team ' +
      'time savings on routine reorder decisions.',
    industry: 'Retail',
    businessDomain: 'Supply chain and inventory management',
    useCaseTags: [
      'inventory-replenishment',
      'purchase-order-drafting',
      'supply-chain-automation',
      'stock-forecasting',
    ],
    frameworkTags: [
      'phase2.technologyGroupings',
      'phase3.scenarioSpecificSelection',
      'grouping3.buildAiAppsAndAgents',
      'grouping4.aiServicesAndBuildingBlocks',
    ],
    technologyTags: [
      'Microsoft Foundry',
      'Azure Logic Apps',
      'Azure OpenAI',
      'Azure Cosmos DB',
    ],
    dataSourceTags: ['erp-data', 'sales-data', 'supplier-catalogue'],
    sensitivityLevel: 'Low',
    status: 'recommended',
    searchableText:
      'Retail inventory replenishment autonomous agent purchase order ERP ' +
      'supply chain stock forecast pro-code Foundry human approval agentic ' +
      'planning multi-step orchestration',
    similarProjectSignals: {
      interactionPattern: 'autonomous background agent with human approval gate',
      proactivity: 'proactive — monitors stock levels and triggers on thresholds',
      dataPattern: 'analytics over structured ERP and sales data',
      actionSafety: 'draft purchase orders for human approval — no autonomous spend',
      governancePattern:
        'purchase order approval workflow; full audit trail in ERP',
    },
  },
];
