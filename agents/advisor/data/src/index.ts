/**
 * @advisor/data — public API barrel.
 *
 * Exports real Azure adapters for Cosmos DB and Azure AI Search,
 * plus the framework content indexer and seed data helpers.
 * Import from '@advisor/data' in composition roots.
 */

// Cosmos DB adapters
export { CosmosConversationStore } from './cosmos/CosmosConversationStore.js';
export type { CosmosConversationStoreOptions } from './cosmos/CosmosConversationStore.js';
export { CosmosGuidanceStore } from './cosmos/CosmosGuidanceStore.js';
export type { CosmosGuidanceStoreOptions } from './cosmos/CosmosGuidanceStore.js';

// Azure AI Search adapters
export { AzureAiSearchProjectSearch } from './search/AzureAiSearchProjectSearch.js';
export type { AzureAiSearchProjectSearchOptions } from './search/AzureAiSearchProjectSearch.js';
export { AzureAiSearchFrameworkRetrieval } from './search/AzureAiSearchFrameworkRetrieval.js';
export type { AzureAiSearchFrameworkRetrievalOptions } from './search/AzureAiSearchFrameworkRetrieval.js';
export { PROJECT_KNOWLEDGE_INDEX_DEFINITION } from './search/projectKnowledgeIndexDefinition.js';
export { FRAMEWORK_CONTENT_INDEX_DEFINITION } from './search/frameworkContentIndexDefinition.js';

// Framework content indexer
export { FrameworkContentIndexer } from './indexing/FrameworkContentIndexer.js';
export type { FrameworkContentIndexerOptions } from './indexing/FrameworkContentIndexer.js';

// Seed data helpers
export { SEED_PROJECT_KNOWLEDGE_DOCUMENTS } from './seed/projects.js';
export { SEED_GUIDANCE_DOCUMENTS } from './seed/guidance.js';
