/**
 * @advisor/api — Express server for the AI Framework Advisor Agent.
 *
 * Real implementation: Express routes, Copilot SDK integration (mock + real),
 * In-memory adapters for Cosmos DB (IConversationStore) and Azure AI Search (IProjectSearchService).
 */

import { buildDependencies } from './composition.js';
import { createApp } from './app.js';
import { log } from './logger.js';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const deps = buildDependencies();
const app = createApp(deps);

app.listen(PORT, () => {
  log.info({ requestType: 'startup' }, `@advisor/api listening on port ${PORT}`);
});

