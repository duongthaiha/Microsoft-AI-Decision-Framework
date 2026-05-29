import { useState } from 'react';
import { apiClient } from '../../api/client';

interface FeedbackControlsProps {
  sessionId: string;
  onFeedbackSubmitted?: () => void;
}

export function FeedbackControls({ sessionId, onFeedbackSubmitted }: FeedbackControlsProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!rating || submitted) return;
    const response = await apiClient.submitFeedback(sessionId, rating, comment.trim() || undefined);
    if (!response.ok) { setError(response.error.message); return; }
    setSubmitted(true); setError(null); onFeedbackSubmitted?.();
  };
  return (
    <section className="card">
      <h2>Was this recommendation useful?</h2>
      {submitted ? <div className="success">Thank you for your feedback.</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="btn-row" aria-label="Rating">
        {[1,2,3,4,5].map((star) => <button key={star} type="button" className="btn secondary" onClick={() => setRating(star)} disabled={submitted} aria-label={`${star} star`}>{star <= rating ? '★' : '☆'}</button>)}
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="feedback">Optional comment</label>
        <textarea id="feedback" className="textarea" rows={3} value={comment} onChange={(event) => setComment(event.target.value)} disabled={submitted} />
      </div>
      <button className="btn" type="button" onClick={submit} disabled={submitted || !rating}>Submit Feedback</button>
    </section>
  );
}
