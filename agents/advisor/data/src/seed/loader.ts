/**
 * Seed loader — pushes seed data into Cosmos DB and Azure AI Search.
 *
 * Usage (after building the package):
 *   node dist/seed/loader.js
 *
 * Required environment variables:
 *   COSMOS_ENDPOINT      — Cosmos DB account endpoint
 *   COSMOS_DATABASE      — Cosmos DB database ID (default: advisor)
 *   SEARCH_ENDPOINT      — Azure AI Search service endpoint
 *   SEARCH_INDEX         — Project knowledge index name (default: project-knowledge)
 *   FRAMEWORK_INDEX      — Framework content index name (default: framework-content)
 *   SKILL_PATH           — Absolute path to the framework skill directory
 *
 * Auth: DefaultAzureCredential — run with az login or managed identity.
 * Safe to run multiple times — documents are upserted, not duplicated.
 */

import { CosmosGuidanceStore } from '../cosmos/CosmosGuidanceStore.js';
import { AzureAiSearchProjectSearch } from '../search/AzureAiSearchProjectSearch.js';
import { FrameworkContentIndexer } from '../indexing/FrameworkContentIndexer.js';
import { SEED_PROJECT_KNOWLEDGE_DOCUMENTS } from './projects.js';
import { SEED_GUIDANCE_DOCUMENTS } from './guidance.js';

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const cosmosEndpoint = requireEnv('COSMOS_ENDPOINT');
  const databaseId = requireEnv('COSMOS_DATABASE', 'advisor');
  const searchEndpoint = requireEnv('SEARCH_ENDPOINT');
  const projectIndexName = requireEnv('SEARCH_INDEX', 'project-knowledge');
  const frameworkIndexName = requireEnv('FRAMEWORK_INDEX', 'framework-content');
  const skillPath = requireEnv('SKILL_PATH', '');

  console.log('🌱 AI Framework Advisor — Seed Loader');
  console.log(`   Cosmos DB: ${cosmosEndpoint}`);
  console.log(`   Search:    ${searchEndpoint}`);
  console.log('');

  // -------------------------------------------------------------------------
  // 1. Guidance documents → Cosmos DB (guidance container)
  // -------------------------------------------------------------------------
  console.log('📦 Loading guidance documents into Cosmos DB...');
  const guidanceStore = new CosmosGuidanceStore({
    endpoint: cosmosEndpoint,
    databaseId,
    containerId: 'guidance',
  });
  await guidanceStore.initialize();

  for (const doc of SEED_GUIDANCE_DOCUMENTS) {
    try {
      await guidanceStore.createGuidance(doc);
      console.log(`   ✓ Created: ${doc.instructionSetId} (${doc.customerOrganizationId})`);
    } catch (err: unknown) {
      // 409 Conflict = already exists, safe to skip
      if (isConflict(err)) {
        await guidanceStore.updateGuidance(doc);
        console.log(`   ↺ Updated: ${doc.instructionSetId} (${doc.customerOrganizationId})`);
      } else {
        throw err;
      }
    }
  }
  console.log('');

  // -------------------------------------------------------------------------
  // 2. Project knowledge documents → Azure AI Search
  // -------------------------------------------------------------------------
  console.log('🔍 Indexing project knowledge documents into Azure AI Search...');
  const projectSearch = new AzureAiSearchProjectSearch({
    endpoint: searchEndpoint,
    indexName: projectIndexName,
  });
  await projectSearch.ensureIndex();

  const searchDocs = SEED_PROJECT_KNOWLEDGE_DOCUMENTS.map(
    AzureAiSearchProjectSearch.toSearchDocument
  );
  await projectSearch.uploadDocuments(searchDocs);
  console.log(`   ✓ Indexed ${searchDocs.length} project knowledge documents`);
  console.log('');

  // -------------------------------------------------------------------------
  // 3. Framework content → Azure AI Search (optional — requires skillPath)
  // -------------------------------------------------------------------------
  if (skillPath) {
    console.log('📚 Indexing framework content from skill references...');
    const indexer = new FrameworkContentIndexer({
      endpoint: searchEndpoint,
      indexName: frameworkIndexName,
      skillPath,
    });
    const result = await indexer.run();
    console.log(
      `   ✓ Indexed ${result.chunksIndexed} chunks from ${result.filesProcessed} files`
    );
  } else {
    console.log('ℹ  Skipping framework content indexing (SKILL_PATH not set)');
  }
  console.log('');
  console.log('✅ Seed loading complete.');
}

function isConflict(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    return e['code'] === 409 || e['statusCode'] === 409;
  }
  return false;
}

main().catch((err) => {
  console.error('❌ Seed loader failed:', err);
  process.exit(1);
});
