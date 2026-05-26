import React from 'react';
import { useParams } from 'react-router-dom';
import type { ReadinessBrief } from '../types';

// TODO M1: replace static mock with apiGet(`/api/briefs/${id}`)
const MOCK_BRIEF: ReadinessBrief = {
  recommendedPlatform: {
    platformKey: 'copilot-studio',
    displayName: 'Microsoft Copilot Studio',
    rationale:
      'The project requires a low-code conversational agent with Teams integration and no autonomous tool-calling. Copilot Studio is the simplest platform that will work.',
    estimatedComplexity: 'medium',
    tradeOffs: 'Limited pro-code extensibility; connector governance overhead.',
    runnerUpAlternatives: ['M365 Agents SDK (pro-code option)', 'Azure Bot Service'],
  },
  bxtScore: {
    viability: 80,
    desirability: 85,
    feasibility: 70,
    summary: 'Strong fit with existing M365 licensing; feasibility gated on connector approval.',
  },
  alignmentNotes: [
    {
      instructionId: 'ci-001',
      outcome: 'followed',
      reason: 'Recommendation uses an available, licensed platform.',
      frameworkAnchor: 'Q2 build style',
    },
  ],
  risks: [
    'Custom connector governance — ensure data classification is reviewed.',
    'Token limits may constrain grounding doc length.',
  ],
  nextActions: [
    'Review existing Customer FAQ Bot project with the team.',
    'Run a Copilot Studio proof of concept with a sample topic.',
    'Confirm M365 Copilot licence coverage with IT.',
  ],
  orgContextVersion: 'v2',
  generatedAt: '2026-05-26T17:00:00Z',
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
        <p className="recommended-platform">{brief.recommendedPlatform.displayName}</p>
        <p>{brief.recommendedPlatform.rationale}</p>
        <p>
          <strong>Estimated complexity:</strong> {brief.recommendedPlatform.estimatedComplexity}
        </p>
        <p>
          <strong>Trade-offs:</strong> {brief.recommendedPlatform.tradeOffs}
        </p>
      </section>

      {brief.recommendedPlatform.runnerUpAlternatives.length > 0 && (
        <section aria-labelledby="alternatives-heading">
          <h2 id="alternatives-heading">Alternatives considered</h2>
          <ul>
            {brief.recommendedPlatform.runnerUpAlternatives.map((alt) => (
              <li key={alt}>{alt}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="bxt-heading">
        <h2 id="bxt-heading">BXT assessment</h2>
        <p>
          Viability {brief.bxtScore.viability}% · Desirability {brief.bxtScore.desirability}% ·
          Feasibility {brief.bxtScore.feasibility}%
        </p>
        <p>{brief.bxtScore.summary}</p>
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

