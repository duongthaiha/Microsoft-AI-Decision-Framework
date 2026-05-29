import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { IFrameworkRetrievalService, FrameworkRetrievalQuery, FrameworkRetrievalResult } from '@advisor/shared';

export class InMemoryFrameworkRetrieval implements IFrameworkRetrievalService {
  private documents: Array<{ content: string; source: string }> = [];

  constructor(skillPath: string) {
    this.loadDocuments(skillPath);
  }

  private loadDocuments(skillPath: string): void {
    const refsPath = resolve(skillPath, 'references');
    if (!existsSync(refsPath)) {
      // Fallback: embed the three-phase summary inline
      this.documents.push({
        source: 'embedded:three-phase-summary',
        content: THREE_PHASE_SUMMARY,
      });
      return;
    }
    try {
      const files = readdirSync(refsPath).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const content = readFileSync(join(refsPath, file), 'utf-8');
        this.documents.push({ source: `references/${file}`, content });
      }
    } catch {
      this.documents.push({ source: 'embedded:three-phase-summary', content: THREE_PHASE_SUMMARY });
    }
    if (this.documents.length === 0) {
      this.documents.push({ source: 'embedded:three-phase-summary', content: THREE_PHASE_SUMMARY });
    }
  }

  async retrieve(query: FrameworkRetrievalQuery): Promise<FrameworkRetrievalResult[]> {
    const q = query.query.toLowerCase();
    const topK = query.topK ?? 3;
    const scored = this.documents
      .map((doc) => {
        const words = q.split(/\s+/).filter((w) => w.length > 3);
        const lc = doc.content.toLowerCase();
        const hits = words.filter((w) => lc.includes(w)).length;
        const score = words.length > 0 ? hits / words.length : 0;
        return { ...doc, score };
      })
      .filter((d) => d.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    if (scored.length === 0) {
      return [{ content: THREE_PHASE_SUMMARY, source: 'embedded:three-phase-summary' }];
    }
    return scored.map((d) => ({ content: d.content.slice(0, 2000), source: d.source }));
  }
}

const THREE_PHASE_SUMMARY = `
# Microsoft AI Decision Framework — Three-Phase Methodology

## Phase 1: Business Impact Assessment (BXT)
Evaluate Business Viability, Experience Desirability, and Technology Feasibility.
- Business Viability: Is there a real operational problem with measurable impact?
- Experience Desirability: Do target users need this in their workflow?
- Technology Feasibility: Can available data, permissions, and skills support it?
Only proceed to Phase 2 when all three dimensions have sufficient evidence.

## Phase 2: Technology Groupings — Nine Critical Questions
Pre-question: Do you actually need an agent? (vs search, workflow, deterministic app, RAG only)
1. User interaction pattern: Conversational / Autonomous / API / Embedded
2. Build style and control level: Low-code (Copilot Studio) / Pro-code (SDK/Foundry)
3. Data strategy: Grounding (RAG) / Memory / Analytics
4. Orchestration complexity: Simple retrieval → complex multi-step planning
5. Compliance and governance: Trust boundary, data sovereignty, audit requirements
6. Scale and cost: Pilot → departmental → enterprise
7. Action safety: Read-only → user-approved → autonomous changes
8. Team skills: Makers / Full-stack / Azure engineers / AI specialists
9. Proactive vs reactive: Wait for prompt vs monitor and alert

Candidate Technology Groupings:
- Grouping 1: End-user copilots (M365 Copilot, built-in agents)
- Grouping 2: Extensibility into existing copilots (Graph Connectors, Declarative Agents)
- Grouping 3: Build AI apps and agents (Copilot Studio, M365 Agents SDK, Foundry)
- Grouping 4: AI services and building blocks (Azure OpenAI, AI Search, Document Intelligence)
- Grouping 5: Specialized agents (GitHub Copilot, Security Copilot, Domain Copilots)

## Phase 3: Scenario-Specific Selection
Convert Phase 2 groupings into selected frameworks. Combinations are supported.
Produce: recommended approach, architecture cast (front door / orchestrator / engine / grounding / actions / governance), rationale, trade-offs, next steps.
`.trim();
