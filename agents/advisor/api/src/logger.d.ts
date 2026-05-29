export interface LogRecord {
    correlationId?: string;
    sessionId?: string;
    requestType?: string;
    toolCallStatus?: string;
    errorCategory?: string;
    [key: string]: unknown;
}
export declare const log: {
    info: (meta: LogRecord, message: string) => void;
    warn: (meta: LogRecord, message: string) => void;
    error: (meta: LogRecord, message: string) => void;
};
//# sourceMappingURL=logger.d.ts.map