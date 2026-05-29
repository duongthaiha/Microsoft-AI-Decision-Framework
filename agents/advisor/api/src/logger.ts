export interface LogRecord {
  correlationId?: string;
  sessionId?: string;
  requestType?: string;
  toolCallStatus?: string;
  errorCategory?: string;
  [key: string]: unknown;
}

function formatLog(level: string, meta: LogRecord, message: string): void {
  const ts = new Date().toISOString();
  // Do not log sensitive prompts verbatim — truncate content fields
  const safeMeta = { ...meta };
  if ('content' in safeMeta) safeMeta['content'] = '[REDACTED]';
  if ('prompt' in safeMeta) safeMeta['prompt'] = '[REDACTED]';
  console.log(JSON.stringify({ ts, level, message, ...safeMeta }));
}

export const log = {
  info: (meta: LogRecord, message: string) => formatLog('INFO', meta, message),
  warn: (meta: LogRecord, message: string) => formatLog('WARN', meta, message),
  error: (meta: LogRecord, message: string) => formatLog('ERROR', meta, message),
};
