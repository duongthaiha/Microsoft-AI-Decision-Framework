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
import type { IConversationStore, IGuidanceStore, IProjectSearchService, IFrameworkRetrievalService, ICopilotSessionService } from '@advisor/shared';
import { log } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(__dirname, '../../../../.agents/skills/microsoft-ai-decision-framework');

export interface AppDependencies {
  conversationStore: IConversationStore;
  guidanceStore: IGuidanceStore;
  projectSearch: IProjectSearchService;
  frameworkRetrieval: IFrameworkRetrievalService;
  copilotService: ICopilotSessionService;
  orchestrator: AgentOrchestrator;
  skillPath: string;
}

export function buildDependencies(): AppDependencies {
  const mode = process.env['ADVISOR_AGENT_MODE'] ?? 'mock';
  log.info({ requestType: 'startup', agentMode: mode }, `Building dependencies in ${mode} mode`);

  const conversationStore = new InMemoryConversationStore();
  const guidanceStore = new InMemoryGuidanceStore();
  const projectSearch = new InMemoryProjectSearch();
  const frameworkRetrieval = new InMemoryFrameworkRetrieval(SKILL_PATH);

  let copilotService: ICopilotSessionService;
  if (mode === 'copilot') {
    log.info({}, 'Using RealCopilotSessionService — requires GITHUB_TOKEN or COPILOT_TOKEN');
    copilotService = new RealCopilotSessionService(SKILL_PATH);
  } else {
    log.info({}, 'Using MockCopilotSessionService (deterministic, no LLM)');
    copilotService = new MockCopilotSessionService(conversationStore, guidanceStore);
  }

  const orchestrator = new AgentOrchestrator({
    conversationStore,
    guidanceStore,
    projectSearch,
    frameworkRetrieval,
    copilotService,
    skillPath: SKILL_PATH,
  });

  return { conversationStore, guidanceStore, projectSearch, frameworkRetrieval, copilotService, orchestrator, skillPath: SKILL_PATH };
}
