import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChatView } from '../components/Chat/ChatView';
import { useSession } from '../hooks/useSession';

const readinessLabels: Record<string, string> = {
  intakeSubmitted: 'Phase 1: Business Impact',
  businessImpactComplete: 'Phase 2: Technology',
  technologyQuestionsComplete: 'Ready for Recommendation',
  readyForRecommendation: 'Ready for Recommendation',
  recommendationDelivered: 'Recommendation Delivered',
};

export function ConversationPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const session = useSession(sessionId);
  const ready = session.readinessState === 'readyForRecommendation' || session.readinessState === 'recommendationDelivered';
  useEffect(() => {
    const latest = session.turns[session.turns.length - 1];
    if (latest?.messageType === 'recommendation') navigate(`/session/${sessionId}/recommendation`);
  }, [navigate, session.turns, sessionId]);
  return (
    <>
      <div className="btn-row" style={{ justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Advisor conversation</h1>
          <span className="badge">{readinessLabels[session.readinessState ?? ''] ?? 'Gathering evidence'}</span>
        </div>
        {ready ? <Link className="btn" to={`/session/${sessionId}/recommendation`}>View Recommendation</Link> : null}
      </div>
      {session.error ? <div className="error">{session.error}</div> : null}
      <ChatView turns={session.turns} isLoading={session.isLoading} onSend={(message) => void session.sendMessage(message)} readinessState={readinessLabels[session.readinessState ?? '']} />
    </>
  );
}
