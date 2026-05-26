import React from 'react';
import { useParams } from 'react-router-dom';
import type { ReadinessBrief, AlignmentNote } from '../types';

// TODO M1: replace static mock with apiGet(`/api/briefs/${id}`)
const MOCK_BRIEF: ReadinessBrief & { alignmentNotes: AlignmentNote[] } = {
  recommendedPlatform: 'Microsoft Copilot Studio',
  rationale:
    'The project requires a low-code conversational agent with Teams integration and no autonomous tool-calling. Copilot Studio is the simplest platform that will work.',
  estimatedComplexity: 'medium',
  similarProjects: [
    {
      projectId: 'proj-001',
      name: 'Customer FAQ Bot',
      similarity: 0.87,
      summary: 'Handles tier-1 support questions in Teams.',
    },
  ],
  alternatives: ['M365 Agents SDK (pro-code option)', 'Azure Bot Service'],
  risks: [
    'Custom connector governance — ensure data classification is reviewed.',
    'Token limits may constrain grounding doc length.',
  ],
  nextActions: [
    'Review existing Customer FAQ Bot project with the team.',
    'Run a Copilot Studio proof of concept with a sample topic.',
    'Confirm M365 Copilot licence coverage with IT.',
  ],
  orgContextVersion: 'v2 (2026-05-20)',
  alignmentNotes: [
    {
      instructionId: 'ci-001',
      outcome: 'followed',
      reason: 'Recommendation uses an available, licensed platform.',
      frameworkAnchor: 'Q2 build style',
    },
  ],
};

export function BriefPage() {
  const { id } = useParams<{ id: string }>();

  const brief = MOCK_BRIEF; // TODO M1: fetch from API

  return (
    <main className="brief-page">
      <header className="brief-header">
        <h1>Project readiness brief</h1>
        <p className="brief-meta">
          Request <code>{id}</code> · Org context {brief.orgContextVersion}
        </p>
      </header>

      <section aria-labelledby="recommendation-heading">
        <h2 id="recommendation-heading">Recommended platform</h2>
        <p className="recommended-platform">{brief.recommendedPlatform}</p>
        <p>{brief.rationale}</p>
      </section>

      <section aria-labelledby="similar-heading">
        <h2 id="similar-heading">Similar projects</h2>
        {brief.similarProjects.length === 0 ? (
          <p>No close matches found in the project shelf.</p>
        ) : (
          <ul>
            {brief.similarProjects.map((p) => (
              <li key={p.projectId}>
                <strong>{p.name}</strong> — {p.summary} (similarity:{' '}
                {Math.round(p.similarity * 100)}%)
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="complexity-heading">
        <h2 id="complexity-heading">Estimated complexity</h2>
        <p>{brief.estimatedComplexity}</p>
      </section>

      <section aria-labelledby="alternatives-heading">
        <h2 id="alternatives-heading">Alternatives considered</h2>
        <ul>
          {brief.alternatives.map((alt) => (
            <li key={alt}>{alt}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="risks-heading">
        <h2 id="risks-heading">Risks</h2>
        <ul>
          {brief.risks.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="next-actions-heading">
        <h2 id="next-actions-heading">Next actions</h2>
        <ol>
          {brief.nextActions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="alignment-heading">
        <h2 id="alignment-heading">Organisation instruction alignment</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Instruction</th>
              <th scope="col">Outcome</th>
              <th scope="col">Reason</th>
              <th scope="col">Framework anchor</th>
            </tr>
          </thead>
          <tbody>
            {brief.alignmentNotes.map((n) => (
              <tr key={n.instructionId}>
                <td>
                  <code>{n.instructionId}</code>
                </td>
                <td>{n.outcome}</td>
                <td>{n.reason}</td>
                <td>{n.frameworkAnchor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
