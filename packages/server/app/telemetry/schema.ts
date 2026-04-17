import type { AnalyticsEngineDataPoint } from "@cloudflare/workers-types";

export const TELEMETRY_ROW_TYPES = {
    toolCall: "tool_call",
    firstToolCall: "first_tool_call",
    sessionStart: "session_start",
    sessionEnd: "session_end",
    toolSummary: "tool_summary",
    asyncOutcome: "async_outcome",
    appError: "app_error",
    malformed: "malformed",
    lifecycle: "lifecycle",
} as const;

export type TelemetryRowType =
    (typeof TELEMETRY_ROW_TYPES)[keyof typeof TELEMETRY_ROW_TYPES];

export const TELEMETRY_BLOB = {
    appId: 0,
    rowType: 1,
    event: 2,
    installId: 3,
    sessionId: 4,
    version: 5,
    os: 6,
    tool: 7,
    source: 8,
    family: 9,
    name: 10,
    channel: 11,
    llm: 12,
    outcome: 13,
    asyncOutcome: 14,
    errorKind: 15,
    errorCode: 16,
    severity: 17,
    screen: 18,
    workspaceBucket: 19,
} as const;

export const TELEMETRY_DOUBLE = {
    eventTimeMs: 0,
    count: 1,
    windowM: 2,
    latencyMs: 3,
    latencyAvgMs: 4,
    latencyMaxMs: 5,
    errorCount: 6,
    durationS: 7,
    toolCalls: 8,
    activeWindowM: 9,
    retryable: 10,
} as const;

export type TelemetryRowFields = {
    event: string,
    iid: string,
    sid: string,
    ts: string,
    v: string,
    os: string,
    channel: string,
    family?: string,
    name?: string,
    tool?: string,
    rawPayloadPreview?: string,
    rawPayloadStorageKey?: string,
    source?: string,
    llm?: string,
    validationErrors?: string,
    outcome?: string,
    asyncOutcome?: string,
    errorKind?: string,
    errorCode?: string,
    severity?: string,
    screen?: string,
    workspaceBucket?: string,
    beaconId?: string,
    count?: number,
    windowM?: number,
    latencyMs?: number,
    latencyAvgMs?: number,
    latencyMaxMs?: number,
    errorCount?: number,
    durationS?: number,
    toolCalls?: number,
    activeWindowM?: number,
    retryable?: boolean,
};

function toEventTimeMs(ts: string) {
    const value = Date.parse(ts);
    return Number.isFinite(value) ? value : 0;
}

export function buildTelemetryRow(
    rowType: TelemetryRowType,
    fields: TelemetryRowFields,
): AnalyticsEngineDataPoint {
    const blobs = Array<string>(20).fill("");
    const doubles = Array<number>(11).fill(0);

    blobs[TELEMETRY_BLOB.appId] = "kaboom";
    blobs[TELEMETRY_BLOB.rowType] = rowType;
    blobs[TELEMETRY_BLOB.event] = fields.event;
    blobs[TELEMETRY_BLOB.installId] = fields.iid;
    blobs[TELEMETRY_BLOB.sessionId] = fields.sid;
    blobs[TELEMETRY_BLOB.version] = fields.v;
    blobs[TELEMETRY_BLOB.os] = fields.os;
    blobs[TELEMETRY_BLOB.tool] = fields.rawPayloadPreview || fields.tool || "";
    blobs[TELEMETRY_BLOB.source] = fields.source || "";
    blobs[TELEMETRY_BLOB.family] = fields.family || "";
    blobs[TELEMETRY_BLOB.name] = fields.rawPayloadStorageKey || fields.name || "";
    blobs[TELEMETRY_BLOB.channel] = fields.channel;
    blobs[TELEMETRY_BLOB.llm] = fields.llm || "";
    blobs[TELEMETRY_BLOB.outcome] = fields.outcome || "";
    blobs[TELEMETRY_BLOB.asyncOutcome] = fields.asyncOutcome || "";
    blobs[TELEMETRY_BLOB.errorKind] = fields.errorKind || "";
    blobs[TELEMETRY_BLOB.errorCode] = fields.errorCode || "";
    blobs[TELEMETRY_BLOB.severity] = fields.validationErrors || fields.severity || "";
    blobs[TELEMETRY_BLOB.screen] = fields.screen || "";
    blobs[TELEMETRY_BLOB.workspaceBucket] = fields.workspaceBucket || "";

    doubles[TELEMETRY_DOUBLE.eventTimeMs] = toEventTimeMs(fields.ts);
    doubles[TELEMETRY_DOUBLE.count] = fields.count || 0;
    doubles[TELEMETRY_DOUBLE.windowM] = fields.windowM || 0;
    doubles[TELEMETRY_DOUBLE.latencyMs] = fields.latencyMs || 0;
    doubles[TELEMETRY_DOUBLE.latencyAvgMs] = fields.latencyAvgMs || 0;
    doubles[TELEMETRY_DOUBLE.latencyMaxMs] = fields.latencyMaxMs || 0;
    doubles[TELEMETRY_DOUBLE.errorCount] = fields.errorCount || 0;
    doubles[TELEMETRY_DOUBLE.durationS] = fields.durationS || 0;
    doubles[TELEMETRY_DOUBLE.toolCalls] = fields.toolCalls || 0;
    doubles[TELEMETRY_DOUBLE.activeWindowM] = fields.activeWindowM || 0;
    doubles[TELEMETRY_DOUBLE.retryable] = fields.retryable ? 1 : 0;

    return {
        indexes: [fields.iid],
        blobs,
        doubles,
    };
}
