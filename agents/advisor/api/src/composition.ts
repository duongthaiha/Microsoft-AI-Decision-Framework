import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { InMemoryConversationStore } from './adapters/inmemory/InMemoryConversationStore.js';
import { InMemoryGuidanceStore } from './adapters/inmemory/InMemoryGuidanceStore.js';
import { InMemoryProjectSearch } from './adapters/inmemory/InMemoryProjectSearch.js';
import { InMemoryFrameworkRetrieval } from './adapters/inmemory/InMemoryFrameworkRetrieval.js';
import { MockCopilotSessionService } from './adapters/inmemory/MockCopilotSessionService.js';
import { RealCopilotSessionService } from './adapters/inmemory/RealCopilotSessionService.js';
import { AgentOrchestrator } from './agent/AgentOrchestrator.js';
import { DeterministicAdvisorAgent } from './agent/DeterministicAdvisorAgent.js';
import { CopilotAdvisorAgent } from './agent/CopilotAdvisorAgent.js';
import type { IConversationStore, IGuidanceStore, IProjectSearchService, IFrameworkRetrievalService, ICopilotSessionService, IAdvisorAgent } from '@advisor/shared';
import { log } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Skill path is configurable for deployment (container layout differs from the
// repo). Falls back to the in-repo location for local dev.
const SKILL_PATH = process.env['ADVISOR_SKILL_PATH']
  ?? resolve(__dirname, '../../../../.agents/skills/microsoft-ai-decision-framework');

export interface AppDependencies {
  conversationStore: IConversationStore;
  guidanceStore: IGuidanceStore;
  projectSearch: IProjectSearchService;
  frameworkRetrieval: IFrameworkRetrievalService;
  copilotService: ICopilotSessionService;
  advisorAgent: IAdvisorAgent;
  orchestrator: AgentOrchestrator;
  skillPath: string;
}

export async function buildDependencies(): Promise<AppDependencies> {
  const mode = process.env['ADVISOR_AGENT_MODE'] ?? 'mock';
  log.info({ requestType: 'startup', agentMode: mode }, `Building dependencies in ${mode} mode`);

  // -------------------------------------------------------------------------
  // Azure mode — real adapters when COSMOS_ENDPOINT + SEARCH_ENDPOINT are set
  // -------------------------------------------------------------------------
  const cosmosEndpoint = process.env['COSMOS_ENDPOINT'];
  const searchEndpoint = process.env['SEARCH_ENDPOINT'];
  const useAzure = Boolean(cosmosEndpoint && searchEndpoint);

  let conversationStore: IConversationStore;
  let guidanceStore: IGuidanceStore;
  let projectSearch: IProjectSearchService;
  let frameworkRetrieval: IFrameworkRetrievalService;

  if (useAzure) {
    log.info({}, 'COSMOS_ENDPOINT + SEARCH_ENDPOINT detected — using real Azure adapters');
    const databaseId = process.env['COSMOS_DATABASE'] ?? 'advisor';
    const sessionsContainer = process.env['COSMOS_SESSIONS_CONTAINER'] ?? 'sessions';
    const guidanceContainer = process.env['COSMOS_GUIDANCE_CONTAINER'] ?? 'guidance';
    const projectIndex = process.env['SEARCH_INDEX'] ?? 'project-knowledge';
    const frameworkIndex = process.env['FRAMEWORK_INDEX'] ?? 'framework-content';

    // Dynamic import to avoid bundling Azure SDKs when not needed.
    // These imports are awaited lazily — the real adapters only activate at
    // runtime when the env vars are present. For compile-time correctness the
    // imports resolve correctly; at runtime without Azure creds they will fail
    // on first use (guard behavior is intentional).
    const {
      CosmosConversationStore,
      CosmosGuidanceStore,
      AzureAiSearchProjectSearch,
      AzureAiSearchFrameworkRetrieval,
    } = await import('@advisor/data').catch(() => {
      throw new Error(
        'Failed to load @advisor/data. Ensure the data workspace is built: npm run build:data'
      );
    }) as typeof import('@advisor/data');

    const cosmosConvStore = new CosmosConversationStore({
      endpoint: cosmosEndpoint!,
      databaseId,
      containerId: sessionsContainer,
    });
    const cosmosGuidanceStore = new CosmosGuidanceStore({
      endpoint: cosmosEndpoint!,
      databaseId,
      containerId: guidanceContainer,
    });

    // Initialize containers (createIfNotExists). Failures here are fatal.
    await cosmosConvStore.initialize();
    await cosmosGuidanceStore.initialize();

    conversationStore = cosmosConvStore;
    guidanceStore = cosmosGuidanceStore;

    projectSearch = new AzureAiSearchProjectSearch({
      endpoint: searchEndpoint!,
      indexName: projectIndex,
    });

    frameworkRetrieval = new AzureAiSearchFrameworkRetrieval({
      endpoint: searchEndpoint!,
      indexName: frameworkIndex,
      skillPath: SKILL_PATH,
    });

    log.info({}, 'Azure adapters initialised');
  } else {
    log.info({}, 'No COSMOS_ENDPOINT/SEARCH_ENDPOINT — using in-memory adapters (offline mode)');
    conversationStore = new InMemoryConversationStore();
    guidanceStore = new InMemoryGuidanceStore();
    projectSearch = new InMemoryProjectSearch();
    frameworkRetrieval = new InMemoryFrameworkRetrieval(SKILL_PATH);
  }

  // -------------------------------------------------------------------------
  // Copilot SDK transport service — independent of the Azure data layer
  // -------------------------------------------------------------------------
  let copilotService: ICopilotSessionService;
  if (mode === 'copilot') {
    const byok = Boolean(process.env['AZURE_OPENAI_ENDPOINT']);
    log.info(
      { byok },
      byok
        ? 'Using RealCopilotSessionService — Azure AI Foundry BYOK (managed-identity bearer token)'
        : 'Using RealCopilotSessionService — requires GITHUB_TOKEN or COPILOT_TOKEN',
    );
    copilotService = new RealCopilotSessionService(SKILL_PATH);
  } else {
    log.info({}, 'Using MockCopilotSessionService (deterministic, no LLM)');
    copilotService = new MockCopilotSessionService(conversationStore, guidanceStore);
  }

  // -------------------------------------------------------------------------
  // Advisor "brain" — the content generator behind the IAdvisorAgent seam.
  //   mock    → DeterministicAdvisorAgent (scripted, offline, deployed default)
  //   copilot → CopilotAdvisorAgent (real framework-driven SDK agent)
  // -------------------------------------------------------------------------
  let advisorAgent: IAdvisorAgent;
  if (mode === 'copilot') {
    log.info({}, 'Using CopilotAdvisorAgent (framework-driven, GitHub Copilot SDK)');
    advisorAgent = new CopilotAdvisorAgent({
      copilotService,
      skillPath: SKILL_PATH,
      projectSearch,
      frameworkRetrieval,
    });
  } else {
    log.info({}, 'Using DeterministicAdvisorAgent (scripted, deterministic)');
    advisorAgent = new DeterministicAdvisorAgent({ projectSearch, frameworkRetrieval });
  }

  const orchestrator = new AgentOrchestrator({
    conversationStore,
    guidanceStore,
    projectSearch,
    advisorAgent,
  });

  return { conversationStore, guidanceStore, projectSearch, frameworkRetrieval, copilotService, advisorAgent, orchestrator, skillPath: SKILL_PATH };
}
