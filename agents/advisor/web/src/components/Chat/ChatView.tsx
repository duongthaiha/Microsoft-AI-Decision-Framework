import { FormEvent, useEffect, useRef, useState } from 'react';
import type { ConversationTurn } from '@advisor/shared';
import { MessageBubble } from './MessageBubble';

interface ChatViewProps {
  turns: ConversationTurn[];
  isLoading: boolean;
  onSend: (message: string) => void;
  readinessState?: string | undefined;
}

export function ChatView({ turns, isLoading, onSend, readinessState }: ChatViewProps) {
  const [message, setMessage] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [turns, isLoading]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setMessage('');
  };
  return (
    <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border)', background: '#fbfdff' }}>
        <span className="badge">{readinessState ?? 'Gathering evidence'}</span>
      </div>
      <div style={{ height: 520, overflowY: 'auto', padding: 18 }}>
        {turns.length === 0 ? <p className="muted">No messages yet. Send a note to continue the assessment.</p> : turns.map((turn) => <MessageBubble key={turn.turnId} turn={turn} />)}
        {isLoading ? <div className="muted" style={{ padding: 12 }}>Agent is thinking •••</div> : null}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--color-border)', padding: 14 }}>
        <input className="input" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Reply with context, constraints, or a decision..." />
        <button className="btn" type="submit" disabled={isLoading || !message.trim()}>Send</button>
      </form>
    </section>
  );
}
