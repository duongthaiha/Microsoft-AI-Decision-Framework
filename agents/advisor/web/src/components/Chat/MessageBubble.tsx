import type { ConversationTurn } from '@advisor/shared';

interface MessageBubbleProps { turn: ConversationTurn; }

export function MessageBubble({ turn }: MessageBubbleProps) {
  const isUser = turn.role === 'user';
  const isQuestion = turn.messageType === 'clarifyingQuestion';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', margin: '12px 0' }}>
      <div style={{ maxWidth: '72%', borderRadius: 18, padding: '12px 14px', background: isUser ? 'var(--color-primary)' : isQuestion ? '#eef6ff' : '#f3f2f1', color: isUser ? 'white' : 'var(--color-text)', border: isQuestion ? '1px solid #b7d7f2' : '1px solid transparent' }}>
        {turn.phase ? <div className="help" style={{ color: isUser ? '#dbeafe' : 'var(--color-muted)', marginBottom: 4 }}>{turn.phase}</div> : null}
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{isQuestion && !isUser ? '❔ ' : ''}{turn.content}</div>
      </div>
    </div>
  );
}
