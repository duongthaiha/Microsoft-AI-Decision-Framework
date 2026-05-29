import type { ReactNode } from 'react';
import type { RecommendationOutput, SimilarProjectSearchResult } from '@advisor/shared';

interface RecommendationViewProps {
  recommendation: RecommendationOutput;
  similarProjects?: SimilarProjectSearchResult | undefined;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="card"><h2>{title}</h2>{children}</section>;
}

export function RecommendationView({ recommendation }: RecommendationViewProps) {
  return (
    <div>
      <section className="hero">
        <div className="btn-row"><span className="badge">Confidence: {recommendation.confidence}</span><span className="badge">{recommendation.status}</span></div>
        <h1>Recommended Approach</h1>
        <p>{recommendation.recommendedApproach.summary}</p>
      </section>
      <div className="grid two">
        <Card title="Primary technologies"><ul className="list">{recommendation.recommendedApproach.primaryTechnologies.map((tech) => <li key={tech.name}><strong>{tech.name}</strong>: {tech.role}</li>)}</ul></Card>
        <Card title="Supporting technologies"><ul className="list">{recommendation.recommendedApproach.supportingTechnologies.map((tech) => <li key={tech.name}><strong>{tech.name}</strong>: {tech.role}</li>)}</ul></Card>
      </div>
      <Card title="Why this recommendation"><div className="grid">{recommendation.rationale.map((entry) => <div key={entry.reason}><strong>{entry.reason}</strong><ul className="list">{entry.evidence.map((item) => <li key={item}>{item}</li>)}</ul></div>)}</div></Card>
      <Card title="Decision Evidence"><ul className="list">{recommendation.decisionEvidenceSources.map((source) => <li key={source}><strong>{source}</strong></li>)}</ul></Card>
      <div className="grid two">
        <Card title="Assumptions"><ul className="list">{recommendation.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></Card>
        <Card title="Trade-offs"><ul className="list">{recommendation.tradeOffs.map((item) => <li key={item.tradeOff}>{item.tradeOff} <span className="badge">{item.acceptedForPoc ? 'Accepted for POC' : 'Not accepted'}</span></li>)}</ul></Card>
      </div>
      <Card title="Similar Projects"><ul className="list">{recommendation.similarProjectHighlights.map((item) => <li key={item.projectId}><strong>{item.title}</strong>: {item.whyItMatters}</li>)}</ul></Card>
      {recommendation.customInstructionInfluence.length > 0 ? <Card title="Custom Instruction Influence"><ul className="list">{recommendation.customInstructionInfluence.map((item) => <li key={item.instructionId}><strong>{item.instructionId}</strong>: {item.effect}</li>)}</ul></Card> : null}
      <Card title="Follow-up Questions"><ul className="list">{recommendation.followUpQuestions.map((item) => <li key={item}>{item}</li>)}</ul></Card>
    </div>
  );
}
