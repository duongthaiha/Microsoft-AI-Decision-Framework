/**
 * FrameworkContentIndexer — chunks and indexes framework reference docs.
 *
 * Reads .md files from the skill references directory, splits each file by
 * H2 headings into retrievable chunks, and uploads them to the
 * framework-content Azure AI Search index.
 *
 * Chunking strategy:
 *  - Each H2 section becomes one chunk (heading + body text).
 *  - If a file has no H2 headings, the whole file is one chunk.
 *  - Maximum chunk length: 2000 characters (truncated at word boundary).
 *  - Chunk IDs are stable: sha256(source + chunkIndex) → safe for re-indexing.
 *
 * Phase detection heuristic:
 *  - Files containing "phase1" or "business_impact" → phase1
 *  - Files containing "phase2" or "technology_grouping" → phase2
 *  - Files containing "phase3" or "scenario" → phase3
 *  - Otherwise: "all"
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { SearchClient, SearchIndexClient } from '@azure/search-documents';
import { DefaultAzureCredential } from '@azure/identity';
import { FRAMEWORK_CONTENT_INDEX_DEFINITION } from '../search/frameworkContentIndexDefinition.js';

export interface FrameworkContentIndexerOptions {
  endpoint: string;
  indexName?: string;
  skillPath: string;
}

interface FrameworkChunkDocument {
  id: string;
  source: string;
  documentTitle: string;
  chunkIndex: number;
  phase: string;
  sectionHeading: string;
  content: string;
}

const MAX_CHUNK_CHARS = 2000;
const BATCH_SIZE = 100;
const DEFAULT_INDEX_NAME = 'framework-content';

export class FrameworkContentIndexer {
  private readonly searchClient: SearchClient<FrameworkChunkDocument>;
  private readonly indexClient: SearchIndexClient;
  private readonly options: Required<FrameworkContentIndexerOptions>;

  constructor(options: FrameworkContentIndexerOptions) {
    this.options = {
      endpoint: options.endpoint,
      indexName: options.indexName ?? DEFAULT_INDEX_NAME,
      skillPath: options.skillPath,
    };
    const credential = new DefaultAzureCredential();
    this.searchClient = new SearchClient<FrameworkChunkDocument>(
      this.options.endpoint,
      this.options.indexName,
      credential
    );
    this.indexClient = new SearchIndexClient(this.options.endpoint, credential);
  }

  /**
   * Creates/updates the index definition then chunks and uploads all .md
   * files from the skill references directory.
   * Safe to call repeatedly — existing documents with matching IDs are replaced.
   */
  async run(): Promise<{ filesProcessed: number; chunksIndexed: number }> {
    await this.indexClient.createOrUpdateIndex(FRAMEWORK_CONTENT_INDEX_DEFINITION);

    const refsPath = resolve(this.options.skillPath, 'references');
    if (!existsSync(refsPath)) {
      throw new Error(`References directory not found: ${refsPath}`);
    }

    const files = readdirSync(refsPath).filter((f) => f.endsWith('.md'));
    const allChunks: FrameworkChunkDocument[] = [];

    for (const file of files) {
      const content = readFileSync(join(refsPath, file), 'utf-8');
      const chunks = this.chunkFile(file, content);
      allChunks.push(...chunks);
    }

    // Upload in batches
    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
      await this.searchClient.uploadDocuments(allChunks.slice(i, i + BATCH_SIZE));
    }

    return { filesProcessed: files.length, chunksIndexed: allChunks.length };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private chunkFile(file: string, content: string): FrameworkChunkDocument[] {
    const documentTitle = this.extractTitle(file, content);
    const phase = this.detectPhase(file, content);
    const sections = this.splitByH2(content);
    const source = `references/${file}`;

    return sections.map((section, chunkIndex) => ({
      id: this.stableId(source, chunkIndex),
      source,
      documentTitle,
      chunkIndex,
      phase,
      sectionHeading: section.heading,
      content: this.truncate(section.body),
    }));
  }

  private extractTitle(file: string, content: string): string {
    const h1 = /^#\s+(.+)$/m.exec(content);
    return h1?.[1]?.trim() ?? basename(file, '.md');
  }

  private detectPhase(file: string, content: string): string {
    const combined = (file + content).toLowerCase();
    if (combined.includes('phase1') || combined.includes('business_impact') || combined.includes('bxt')) {
      return 'phase1';
    }
    if (combined.includes('phase2') || combined.includes('nine_critical') || combined.includes('technology_grouping')) {
      return 'phase2';
    }
    if (combined.includes('phase3') || combined.includes('scenario_specific') || combined.includes('scenario-specific')) {
      return 'phase3';
    }
    return 'all';
  }

  private splitByH2(content: string): Array<{ heading: string; body: string }> {
    const h2Regex = /^##\s+(.+)$/gm;
    const matches = [...content.matchAll(h2Regex)];

    if (matches.length === 0) {
      return [{ heading: '', body: content }];
    }

    const sections: Array<{ heading: string; body: string }> = [];
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      if (!match) continue;
      const heading = match[1]?.trim() ?? '';
      const start = match.index ?? 0;
      const nextMatch = matches[i + 1];
      const end = nextMatch?.index ?? content.length;
      const body = content.slice(start, end).trim();
      sections.push({ heading, body });
    }

    return sections;
  }

  private truncate(text: string): string {
    if (text.length <= MAX_CHUNK_CHARS) return text;
    const truncated = text.slice(0, MAX_CHUNK_CHARS);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > MAX_CHUNK_CHARS * 0.8 ? truncated.slice(0, lastSpace) + '…' : truncated + '…';
  }

  private stableId(source: string, chunkIndex: number): string {
    return createHash('sha256')
      .update(`${source}::${chunkIndex}`)
      .digest('hex')
      .slice(0, 32);
  }
}
