import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FeedbackControls } from '../components/Recommendation/FeedbackControls';
import { RecommendationView } from '../components/Recommendation/RecommendationView';
import { useSession } from '../hooks/useSession';

export function RecommendationPage() {
  const { sessionId = '' } = useParams();
  const session = useSession(sessionId);
  useEffect(() => { void session.fetchRecommendation(sessionId); }, [sessionId]);
  return (
    <>
      <div className="btn-row" style={{ justifyContent: 'space-between', marginBottom: 18 }}>
        <h1>Recommendation</h1>
        <Link className="btn secondary" to="/">Start New Assessment</Link>
      </div>
      {session.error ? <div className="error">{session.error}</div> : null}
      {session.isLoading && !session.recommendation ? <section className="card">Loading recommendation...</section> : null}
      {session.recommendation ? <RecommendationView recommendation={session.recommendation} similarProjects={session.similarProjects} /> : null}
      <FeedbackControls sessionId={sessionId} />
    </>
  );
}
