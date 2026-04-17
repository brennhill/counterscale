import type {
    AnalyticsEngineDataPoint,
    AnalyticsEngineDataset,
} from "@cloudflare/workers-types";
import {
    TELEMETRY_ROW_TYPES,
    buildTelemetryRow,
    type TelemetryRowType,
} from "./schema";

const APP_ID = "kaboom";
const SESSION_ID_PATTERN = /^[0-9a-fA-F]{16}$/;
const MALFORMED_PREVIEW_MAX_BYTES = 1024;
const MALFORMED_VALIDATION_ERRORS_MAX_BYTES = 2048;
const MALFORMED_STORAGE_PREFIX = "telemetry-malformed";
const ALLOWED_METRIC_FAMILIES = new Set([
    "observe",
    "interact",
    "generate",
    "analyze",
    "configure",
    "ext",
]);
const ALLOWED_METRIC_FAMILY_ERROR =
    "Metric family must be one of observe, interact, generate, analyze, configure, ext";

const LIFECYCLE_EVENTS = new Set([
    "daemon_start",
    "extension_connect",
    "extension_version_mismatch",
] as const);

const TOOL_OUTCOMES = new Set([
    "success",
    "error",
    "cancelled",
    "timeout",
    "expired",
] as const);

const ASYNC_OUTCOMES = new Set([
    "complete",
    "error",
    "timeout",
    "expired",
    "cancelled",
] as const);

const APP_ERROR_SEVERITIES = new Set(["warning", "error", "fatal"] as const);
const SESSION_START_REASONS = new Set([
    "first_activity",
    "startup",
    "post_timeout",
    "resume",
] as const);
const SESSION_END_REASONS = new Set([
    "timeout",
    "shutdown",
    "restart",
    "crash",
    "background",
] as const);

type LifecycleEventName =
    | "daemon_start"
    | "extension_connect"
    | "extension_version_mismatch";

type LegacyUsageSummaryBeacon = {
    event: "usage_summary";
    v: string;
    os: string;
    iid: string;
    sid: string;
    window_m: number;
    props: Record<string, number>;
};

type LegacyLifecycleBeacon = {
    event: LifecycleEventName;
    v: string;
    os: string;
    iid: string;
    sid: string;
};

type BaseV2Envelope = {
    event: string;
    iid: string;
    sid: string;
    ts: string;
    v: string;
    os: string;
    channel: string;
    llm?: string;
    screen?: string;
    workspace_bucket?: string;
};

type ToolCallBeacon = BaseV2Envelope & {
    event: "tool_call";
    family: string;
    name: string;
    tool: string;
    outcome: string;
    latency_ms?: number;
    source?: string;
    async?: boolean;
    async_outcome?: string;
};

type FirstToolCallBeacon = BaseV2Envelope & {
    event: "first_tool_call";
    family: string;
    name: string;
    tool: string;
};

type SessionStartBeacon = BaseV2Envelope & {
    event: "session_start";
    reason: string;
};

type SessionEndBeacon = BaseV2Envelope & {
    event: "session_end";
    reason: string;
    duration_s: number;
    tool_calls: number;
    active_window_m?: number;
};

type AppErrorBeacon = BaseV2Envelope & {
    event: "app_error";
    error_kind: string;
    error_code: string;
    severity: string;
    source?: string;
    retryable?: boolean;
};

type ToolSummaryEntry = {
    family: string;
    name: string;
    tool: string;
    count: number;
    error_count?: number;
    latency_avg_ms?: number;
    latency_max_ms?: number;
};

type StructuredUsageSummaryBeacon = BaseV2Envelope & {
    event: "usage_summary";
    window_m: number;
    tool_stats: ToolSummaryEntry[];
    async_outcomes?: Record<string, number>;
};

export type AppTelemetryBeacon =
    | LegacyUsageSummaryBeacon
    | LegacyLifecycleBeacon
    | ToolCallBeacon
    | FirstToolCallBeacon
    | SessionStartBeacon
    | SessionEndBeacon
    | AppErrorBeacon
    | StructuredUsageSummaryBeacon;

type MalformedTelemetry = {
    rawPayload: string,
    errors: string[],
    errorCode:
        | "json_parse_failed"
        | "contract_validation_failed"
        | "body_read_failed",
    event?: string,
    iid?: string,
    sid?: string,
    ts?: string,
    v?: string,
    os?: string,
    channel?: string,
    llm?: string,
    screen?: string,
    workspace_bucket?: string,
};

type ParsedPayloadResult = {
    beacons: AppTelemetryBeacon[],
    malformed?: MalformedTelemetry,
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRequiredString(
    body: Record<string, unknown>,
    key: string,
): string | null {
    const value = body[key];
    if (typeof value !== "string" || value.trim() === "") {
        return null;
    }
    return value;
}

function getOptionalString(
    body: Record<string, unknown>,
    key: string,
): string | undefined {
    const value = body[key];
    if (typeof value !== "string" || value.trim() === "") {
        return undefined;
    }
    return value;
}

function getOptionalBoolean(
    body: Record<string, unknown>,
    key: string,
): boolean | undefined {
    const value = body[key];
    return typeof value === "boolean" ? value : undefined;
}

function getRequiredPositiveInteger(
    body: Record<string, unknown>,
    key: string,
): number | null {
    const value = body[key];
    if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
        return null;
    }
    return value;
}

function getOptionalNonNegativeInteger(
    body: Record<string, unknown>,
    key: string,
): number | undefined {
    const value = body[key];
    if (
        !Number.isInteger(value) ||
        typeof value !== "number" ||
        value < 0
    ) {
        return undefined;
    }
    return value;
}

function getRequiredNonNegativeInteger(
    body: Record<string, unknown>,
    key: string,
): number | null {
    const value = body[key];
    if (
        !Number.isInteger(value) ||
        typeof value !== "number" ||
        value < 0
    ) {
        return null;
    }
    return value;
}

function normalizeSessionId(sessionId: string) {
    if (!SESSION_ID_PATTERN.test(sessionId)) {
        throw new Error("sid must be a 16-character hex string");
    }
    return sessionId.toLowerCase();
}

function isValidIsoTimestamp(value: string | undefined): value is string {
    return !!value && !Number.isNaN(Date.parse(value));
}

function getRecoverableString(
    body: Record<string, unknown>,
    key: string,
): string | undefined {
    const value = body[key];
    return typeof value === "string" ? value : undefined;
}

function recoverMalformedTelemetry(
    body: Record<string, unknown>,
    rawPayload: string,
    errors: string[],
    errorCode: MalformedTelemetry["errorCode"],
): MalformedTelemetry {
    const ts = getRecoverableString(body, "ts");

    return {
        rawPayload,
        errors,
        errorCode,
        event: getRecoverableString(body, "event"),
        iid: getRecoverableString(body, "iid"),
        sid: getRecoverableString(body, "sid"),
        ts: isValidIsoTimestamp(ts) ? ts : undefined,
        v: getRecoverableString(body, "v"),
        os: getRecoverableString(body, "os"),
        channel: getRecoverableString(body, "channel"),
        llm: getRecoverableString(body, "llm"),
        screen: getRecoverableString(body, "screen"),
        workspace_bucket: getRecoverableString(body, "workspace_bucket"),
    };
}

function truncateUtf8(value: string, maxBytes: number) {
    const encoder = new TextEncoder();
    if (encoder.encode(value).length <= maxBytes) {
        return value;
    }

    const suffix = "... [truncated]";
    let end = value.length;
    while (end > 0) {
        const candidate = value.slice(0, end) + suffix;
        if (encoder.encode(candidate).length <= maxBytes) {
            return candidate;
        }
        end -= 1;
    }

    return suffix;
}

function buildMalformedPreview(rawPayload: string) {
    return truncateUtf8(rawPayload, MALFORMED_PREVIEW_MAX_BYTES);
}

function buildValidationErrors(errors: string[]) {
    return truncateUtf8(
        errors.join(" | "),
        MALFORMED_VALIDATION_ERRORS_MAX_BYTES,
    );
}

function buildMalformedStorageKey(ts: string | undefined, id: string) {
    const date = ts ? new Date(ts) : new Date();
    const year = String(date.getUTCFullYear());
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");

    return `${MALFORMED_STORAGE_PREFIX}/${year}/${month}/${day}/${id}.json`;
}

function requireIsoTimestamp(body: Record<string, unknown>) {
    const ts = getRequiredString(body, "ts");
    if (!ts || Number.isNaN(Date.parse(ts))) {
        throw new Error("ts must be a valid ISO-8601 timestamp");
    }
    return ts;
}

function requireChannel(body: Record<string, unknown>) {
    const channel = getRequiredString(body, "channel");
    if (!channel) {
        throw new Error("Missing required v2 envelope fields");
    }
    return channel;
}

function parseMetricKey(metricKey: string) {
    const parts = metricKey.split(":");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error("Metric keys must match family:name");
    }

    const [family, name] = parts;
    if (!ALLOWED_METRIC_FAMILIES.has(family)) {
        throw new Error(ALLOWED_METRIC_FAMILY_ERROR);
    }

    const source = family === "ext" ? "ext" : "tool";

    return {
        metricSource: source,
        metricFamily: family,
        metricName: name,
    };
}

function parseToolIdentity(
    family: string,
    name: string,
    tool: string,
) {
    if (!ALLOWED_METRIC_FAMILIES.has(family)) {
        throw new Error(ALLOWED_METRIC_FAMILY_ERROR);
    }
    if (!name) {
        throw new Error("name must be non-empty");
    }
    if (tool !== `${family}:${name}`) {
        throw new Error("tool must match family:name");
    }
}

function parseBaseV2Envelope(body: Record<string, unknown>) {
    const event = getRequiredString(body, "event");
    const version = getRequiredString(body, "v");
    const os = getRequiredString(body, "os");
    const installId = getRequiredString(body, "iid");
    const sessionId = getRequiredString(body, "sid");

    if (!event || !version || !os || !installId || !sessionId) {
        throw new Error("Missing required event envelope fields");
    }

    return {
        event,
        iid: installId,
        sid: normalizeSessionId(sessionId),
        ts: requireIsoTimestamp(body),
        v: version,
        os,
        channel: requireChannel(body),
        llm: getOptionalString(body, "llm"),
        screen: getOptionalString(body, "screen"),
        workspace_bucket: getOptionalString(body, "workspace_bucket"),
    };
}

function parseStructuredUsageSummary(
    body: Record<string, unknown>,
    base: ReturnType<typeof parseBaseV2Envelope>,
): StructuredUsageSummaryBeacon {
    const windowMinutes = getRequiredPositiveInteger(body, "window_m");
    if (!windowMinutes) {
        throw new Error("usage_summary requires a positive integer window_m");
    }

    const toolStats = body.tool_stats;
    if (!Array.isArray(toolStats)) {
        throw new Error("usage_summary requires tool_stats");
    }

    const normalizedToolStats = toolStats.map((entry) => {
        if (!isRecord(entry)) {
            throw new Error("tool_stats entries must be objects");
        }

        const family = getRequiredString(entry, "family");
        const name = getRequiredString(entry, "name");
        const tool = getRequiredString(entry, "tool");
        const count = getRequiredPositiveInteger(entry, "count");

        if (!family || !name || !tool || !count) {
            throw new Error("tool_stats entries require family, name, tool, and count");
        }

        parseToolIdentity(family, name, tool);

        const errorCount = getOptionalNonNegativeInteger(entry, "error_count");
        const latencyAvgMs = getOptionalNonNegativeInteger(entry, "latency_avg_ms");
        const latencyMaxMs = getOptionalNonNegativeInteger(entry, "latency_max_ms");

        return {
            family,
            name,
            tool,
            count,
            error_count: errorCount,
            latency_avg_ms: latencyAvgMs,
            latency_max_ms: latencyMaxMs,
        };
    });

    const asyncOutcomesValue = body.async_outcomes;
    let asyncOutcomes: Record<string, number> | undefined;

    if (asyncOutcomesValue !== undefined) {
        if (!isRecord(asyncOutcomesValue)) {
            throw new Error("async_outcomes must be an object");
        }

        asyncOutcomes = {};
        for (const [key, value] of Object.entries(asyncOutcomesValue)) {
            if (!ASYNC_OUTCOMES.has(key as typeof ASYNC_OUTCOMES extends Set<infer T> ? T : never)) {
                throw new Error("async_outcomes contains an unsupported outcome");
            }
            if (
                !Number.isInteger(value) ||
                typeof value !== "number" ||
                value < 0
            ) {
                throw new Error("async_outcomes values must be non-negative integers");
            }
            asyncOutcomes[key] = value;
        }
    }

    return {
        ...base,
        event: "usage_summary",
        window_m: windowMinutes,
        tool_stats: normalizedToolStats,
        async_outcomes: asyncOutcomes,
    };
}

function parseLegacyUsageSummaryWithSalvage(
    body: Record<string, unknown>,
    rawPayload: string,
): ParsedPayloadResult {
    const errors: string[] = [];
    const event = getRequiredString(body, "event");
    const version = getRequiredString(body, "v");
    const os = getRequiredString(body, "os");
    const installId = getRequiredString(body, "iid");
    const sessionId = getRequiredString(body, "sid");

    if (!event || !version || !os || !installId || !sessionId) {
        errors.push("Missing required event envelope fields");
        return {
            beacons: [],
            malformed: recoverMalformedTelemetry(
                body,
                rawPayload,
                errors,
                "contract_validation_failed",
            ),
        };
    }

    let normalizedSessionId: string | null = null;
    try {
        normalizedSessionId = normalizeSessionId(sessionId);
    } catch (error) {
        errors.push(
            error instanceof Error ? error.message : "sid must be a 16-character hex string",
        );
    }

    const windowMinutes = body.window_m;
    if (
        !Number.isInteger(windowMinutes) ||
        typeof windowMinutes !== "number" ||
        windowMinutes <= 0
    ) {
        errors.push("usage_summary requires a positive integer window_m");
    }

    const props = body.props;
    if (!isRecord(props)) {
        errors.push("usage_summary requires props");
    }

    const normalizedProps: Record<string, number> = {};
    if (isRecord(props)) {
        for (const [key, value] of Object.entries(props)) {
            if (
                typeof key !== "string" ||
                key.trim() === "" ||
                !Number.isInteger(value) ||
                typeof value !== "number" ||
                value < 0
            ) {
                errors.push(`usage_summary props entry ${key || "<empty>"} must be a non-negative integer`);
                continue;
            }

            try {
                parseMetricKey(key);
                normalizedProps[key] = value;
            } catch (error) {
                errors.push(error instanceof Error ? error.message : "Invalid metric key");
            }
        }
    }

    const beacons: AppTelemetryBeacon[] = [];
    if (
        normalizedSessionId &&
        typeof windowMinutes === "number" &&
        windowMinutes > 0 &&
        Object.keys(normalizedProps).length > 0
    ) {
        beacons.push({
            event: "usage_summary",
            v: version,
            os,
            iid: installId,
            sid: normalizedSessionId,
            window_m: windowMinutes,
            props: normalizedProps,
        });
    }

    return errors.length > 0
        ? {
            beacons,
            malformed: recoverMalformedTelemetry(
                body,
                rawPayload,
                errors,
                "contract_validation_failed",
            ),
        }
        : { beacons };
}

function parseStructuredUsageSummaryWithSalvage(
    body: Record<string, unknown>,
    rawPayload: string,
): ParsedPayloadResult {
    const errors: string[] = [];
    let base: ReturnType<typeof parseBaseV2Envelope> | null = null;

    try {
        base = parseBaseV2Envelope(body);
    } catch (error) {
        errors.push(error instanceof Error ? error.message : "Invalid event envelope");
    }

    if (!base) {
        return {
            beacons: [],
            malformed: recoverMalformedTelemetry(
                body,
                rawPayload,
                errors,
                "contract_validation_failed",
            ),
        };
    }

    const windowMinutes = getRequiredPositiveInteger(body, "window_m");
    if (!windowMinutes) {
        errors.push("usage_summary requires a positive integer window_m");
    }

    const toolStats = body.tool_stats;
    const normalizedToolStats: ToolSummaryEntry[] = [];
    if (!Array.isArray(toolStats)) {
        errors.push("usage_summary requires tool_stats");
    } else {
        for (const [index, entry] of toolStats.entries()) {
            if (!isRecord(entry)) {
                errors.push(`tool_stats[${index}] must be an object`);
                continue;
            }

            const family = getRequiredString(entry, "family");
            const name = getRequiredString(entry, "name");
            const tool = getRequiredString(entry, "tool");
            const count = getRequiredPositiveInteger(entry, "count");

            if (!family || !name || !tool || !count) {
                errors.push(`tool_stats[${index}] requires family, name, tool, and count`);
                continue;
            }

            try {
                parseToolIdentity(family, name, tool);
            } catch (error) {
                errors.push(
                    error instanceof Error
                        ? `tool_stats[${index}] ${error.message}`
                        : `tool_stats[${index}] is invalid`,
                );
                continue;
            }

            const errorCount = getOptionalNonNegativeInteger(entry, "error_count");
            const latencyAvgMs = getOptionalNonNegativeInteger(entry, "latency_avg_ms");
            const latencyMaxMs = getOptionalNonNegativeInteger(entry, "latency_max_ms");

            if (entry.error_count !== undefined && errorCount === undefined) {
                errors.push(`tool_stats[${index}] error_count must be a non-negative integer`);
            }
            if (entry.latency_avg_ms !== undefined && latencyAvgMs === undefined) {
                errors.push(`tool_stats[${index}] latency_avg_ms must be a non-negative integer`);
            }
            if (entry.latency_max_ms !== undefined && latencyMaxMs === undefined) {
                errors.push(`tool_stats[${index}] latency_max_ms must be a non-negative integer`);
            }

            normalizedToolStats.push({
                family,
                name,
                tool,
                count,
                error_count: errorCount,
                latency_avg_ms: latencyAvgMs,
                latency_max_ms: latencyMaxMs,
            });
        }
    }

    const asyncOutcomesValue = body.async_outcomes;
    let asyncOutcomes: Record<string, number> | undefined;
    if (asyncOutcomesValue !== undefined) {
        if (!isRecord(asyncOutcomesValue)) {
            errors.push("async_outcomes must be an object");
        } else {
            asyncOutcomes = {};
            for (const [key, value] of Object.entries(asyncOutcomesValue)) {
                if (
                    !ASYNC_OUTCOMES.has(key as typeof ASYNC_OUTCOMES extends Set<infer T> ? T : never)
                ) {
                    errors.push("async_outcomes contains an unsupported outcome");
                    continue;
                }
                if (
                    !Number.isInteger(value) ||
                    typeof value !== "number" ||
                    value < 0
                ) {
                    errors.push("async_outcomes values must be non-negative integers");
                    continue;
                }
                asyncOutcomes[key] = value;
            }
        }
    }

    const hasSalvageableRows =
        normalizedToolStats.length > 0 ||
        Object.keys(asyncOutcomes || {}).length > 0;

    const beacons: AppTelemetryBeacon[] =
        windowMinutes && hasSalvageableRows
            ? [{
                ...base,
                event: "usage_summary",
                window_m: windowMinutes,
                tool_stats: normalizedToolStats,
                async_outcomes: asyncOutcomes,
            }]
            : [];

    return errors.length > 0
        ? {
            beacons,
            malformed: recoverMalformedTelemetry(
                body,
                rawPayload,
                errors,
                "contract_validation_failed",
            ),
        }
        : { beacons };
}

function parseAppTelemetryPayload(
    body: unknown,
    rawPayload: string,
): ParsedPayloadResult {
    if (!isRecord(body)) {
        return {
            beacons: [],
            malformed: {
                rawPayload,
                errors: ["Payload must be a JSON object"],
                errorCode: "contract_validation_failed",
            },
        };
    }

    const event = getRequiredString(body, "event");
    if (event === "usage_summary") {
        if (Array.isArray(body.tool_stats)) {
            return parseStructuredUsageSummaryWithSalvage(body, rawPayload);
        }

        return parseLegacyUsageSummaryWithSalvage(body, rawPayload);
    }

    try {
        return {
            beacons: [parseAppTelemetryBeacon(body)],
        };
    } catch (error) {
        return {
            beacons: [],
            malformed: recoverMalformedTelemetry(
                body,
                rawPayload,
                [error instanceof Error ? error.message : "Invalid telemetry payload"],
                "contract_validation_failed",
            ),
        };
    }
}

export function parseAppTelemetryBeacon(body: unknown): AppTelemetryBeacon {
    if (!isRecord(body)) {
        throw new Error("Payload must be a JSON object");
    }

    const event = getRequiredString(body, "event");
    const version = getRequiredString(body, "v");
    const os = getRequiredString(body, "os");
    const installId = getRequiredString(body, "iid");
    const sessionId = getRequiredString(body, "sid");

    if (!event || !version || !os || !installId || !sessionId) {
        throw new Error("Missing required event envelope fields");
    }

    const normalizedSessionId = normalizeSessionId(sessionId);

    if (event === "usage_summary") {
        if (Array.isArray(body.tool_stats)) {
            return parseStructuredUsageSummary(body, parseBaseV2Envelope(body));
        }

        const windowMinutes = body.window_m;
        const props = body.props;

        if (
            !Number.isInteger(windowMinutes) ||
            typeof windowMinutes !== "number" ||
            windowMinutes <= 0
        ) {
            throw new Error("usage_summary requires a positive integer window_m");
        }

        if (!isRecord(props)) {
            throw new Error("usage_summary requires props");
        }

        const normalizedProps: Record<string, number> = {};
        for (const [key, value] of Object.entries(props)) {
            if (
                typeof key !== "string" ||
                key.trim() === "" ||
                !Number.isInteger(value) ||
                typeof value !== "number" ||
                value < 0
            ) {
                throw new Error("usage_summary props must be non-negative integers");
            }
            parseMetricKey(key);
            normalizedProps[key] = value;
        }

        return {
            event,
            v: version,
            os,
            iid: installId,
            sid: normalizedSessionId,
            window_m: windowMinutes,
            props: normalizedProps,
        };
    }

    if (LIFECYCLE_EVENTS.has(event as LifecycleEventName)) {
        return {
            event: event as LifecycleEventName,
            v: version,
            os,
            iid: installId,
            sid: normalizedSessionId,
        };
    }

    const base = parseBaseV2Envelope(body);

    if (event === "tool_call") {
        const family = getRequiredString(body, "family");
        const name = getRequiredString(body, "name");
        const tool = getRequiredString(body, "tool");
        const outcome = getRequiredString(body, "outcome");
        if (!family || !name || !tool || !outcome) {
            throw new Error("tool_call requires family, name, tool, and outcome");
        }
        parseToolIdentity(family, name, tool);
        if (!TOOL_OUTCOMES.has(outcome as typeof TOOL_OUTCOMES extends Set<infer T> ? T : never)) {
            throw new Error("tool_call outcome is invalid");
        }

        const asyncOutcome = getOptionalString(body, "async_outcome");
        if (
            asyncOutcome &&
            !ASYNC_OUTCOMES.has(asyncOutcome as typeof ASYNC_OUTCOMES extends Set<infer T> ? T : never)
        ) {
            throw new Error("tool_call async_outcome is invalid");
        }

        return {
            ...base,
            event: "tool_call",
            family,
            name,
            tool,
            outcome,
            latency_ms: getOptionalNonNegativeInteger(body, "latency_ms"),
            source: getOptionalString(body, "source"),
            async: getOptionalBoolean(body, "async"),
            async_outcome: asyncOutcome,
        };
    }

    if (event === "first_tool_call") {
        const family = getRequiredString(body, "family");
        const name = getRequiredString(body, "name");
        const tool = getRequiredString(body, "tool");
        if (!family || !name || !tool) {
            throw new Error("first_tool_call requires family, name, and tool");
        }
        parseToolIdentity(family, name, tool);

        return {
            ...base,
            event: "first_tool_call",
            family,
            name,
            tool,
        };
    }

    if (event === "session_start") {
        const reason = getRequiredString(body, "reason");
        if (
            !reason ||
            !SESSION_START_REASONS.has(reason as typeof SESSION_START_REASONS extends Set<infer T> ? T : never)
        ) {
            throw new Error("session_start reason is invalid");
        }

        return {
            ...base,
            event: "session_start",
            reason,
        };
    }

    if (event === "session_end") {
        const reason = getRequiredString(body, "reason");
        const durationSeconds = getRequiredNonNegativeInteger(body, "duration_s");
        const toolCalls = getRequiredPositiveInteger(body, "tool_calls");
        if (
            !reason ||
            !SESSION_END_REASONS.has(reason as typeof SESSION_END_REASONS extends Set<infer T> ? T : never) ||
            durationSeconds === null ||
            !toolCalls
        ) {
            throw new Error("session_end requires reason, duration_s, and tool_calls");
        }

        return {
            ...base,
            event: "session_end",
            reason,
            duration_s: durationSeconds,
            tool_calls: toolCalls,
            active_window_m: getOptionalNonNegativeInteger(body, "active_window_m"),
        };
    }

    if (event === "app_error") {
        const errorKind = getRequiredString(body, "error_kind");
        const errorCode = getRequiredString(body, "error_code");
        const severity = getRequiredString(body, "severity");
        if (!errorKind || !errorCode || !severity) {
            throw new Error("app_error requires error_kind, error_code, and severity");
        }
        if (
            !APP_ERROR_SEVERITIES.has(severity as typeof APP_ERROR_SEVERITIES extends Set<infer T> ? T : never)
        ) {
            throw new Error("app_error severity is invalid");
        }

        return {
            ...base,
            event: "app_error",
            error_kind: errorKind,
            error_code: errorCode,
            severity,
            source: getOptionalString(body, "source"),
            retryable: getOptionalBoolean(body, "retryable"),
        };
    }

    throw new Error(`Unsupported event: ${event}`);
}

function buildLegacyDataPoint(
    rowType: "summary" | "metric" | "lifecycle",
    beacon: LegacyUsageSummaryBeacon | LegacyLifecycleBeacon,
    beaconId: string,
    metric?: {
        metricKey: string;
        metricCount: number;
        metricSource: string;
        metricFamily: string;
        metricName: string;
    },
): AnalyticsEngineDataPoint {
    return {
        indexes: [beacon.iid],
        blobs: [
            APP_ID,
            rowType,
            beacon.event,
            beacon.iid,
            beacon.sid,
            beacon.v,
            beacon.os,
            metric?.metricKey || "",
            metric?.metricSource || "",
            metric?.metricFamily || "",
            metric?.metricName || "",
            beaconId,
        ],
        doubles: [
            beacon.event === "usage_summary" ? beacon.window_m : 0,
            metric?.metricCount || 0,
            1,
        ],
    };
}

function buildV2Row(
    rowType: TelemetryRowType,
    beaconId: string,
    fields: Parameters<typeof buildTelemetryRow>[1],
) {
    return buildTelemetryRow(rowType, {
        ...fields,
        beaconId,
    });
}

function buildAppTelemetryDataPoints(
    beacon: AppTelemetryBeacon,
): AnalyticsEngineDataPoint[] {
    const beaconId = crypto.randomUUID();

    if ("props" in beacon) {
        const dataPoints = [buildLegacyDataPoint("summary", beacon, beaconId)];

        for (const [metricKey, metricCount] of Object.entries(beacon.props)) {
            dataPoints.push(
                buildLegacyDataPoint("metric", beacon, beaconId, {
                    metricKey,
                    metricCount,
                    ...parseMetricKey(metricKey),
                }),
            );
        }

        return dataPoints;
    }

    if (LIFECYCLE_EVENTS.has(beacon.event as LifecycleEventName)) {
        const lifecycleBeacon = beacon as LegacyLifecycleBeacon;
        return [buildLegacyDataPoint("lifecycle", lifecycleBeacon, beaconId)];
    }

    if (beacon.event === "tool_call") {
        return [buildV2Row(TELEMETRY_ROW_TYPES.toolCall, beaconId, {
            ...beacon,
            count: 1,
            latencyMs: beacon.latency_ms,
            asyncOutcome: beacon.async_outcome,
            workspaceBucket: beacon.workspace_bucket,
        })];
    }

    if (beacon.event === "first_tool_call") {
        return [buildV2Row(TELEMETRY_ROW_TYPES.firstToolCall, beaconId, {
            ...beacon,
            count: 1,
            workspaceBucket: beacon.workspace_bucket,
        })];
    }

    if (beacon.event === "session_start") {
        return [buildV2Row(TELEMETRY_ROW_TYPES.sessionStart, beaconId, {
            ...beacon,
            source: beacon.reason,
            count: 1,
            workspaceBucket: beacon.workspace_bucket,
        })];
    }

    if (beacon.event === "session_end") {
        return [buildV2Row(TELEMETRY_ROW_TYPES.sessionEnd, beaconId, {
            ...beacon,
            source: beacon.reason,
            count: 1,
            durationS: beacon.duration_s,
            toolCalls: beacon.tool_calls,
            activeWindowM: beacon.active_window_m,
            workspaceBucket: beacon.workspace_bucket,
        })];
    }

    if (beacon.event === "app_error") {
        return [buildV2Row(TELEMETRY_ROW_TYPES.appError, beaconId, {
            ...beacon,
            count: 1,
            errorKind: beacon.error_kind,
            errorCode: beacon.error_code,
            workspaceBucket: beacon.workspace_bucket,
        })];
    }

    if (beacon.event === "usage_summary") {
        const dataPoints: AnalyticsEngineDataPoint[] = [];

        for (const toolStat of beacon.tool_stats) {
            dataPoints.push(buildV2Row(TELEMETRY_ROW_TYPES.toolSummary, beaconId, {
                ...beacon,
                family: toolStat.family,
                name: toolStat.name,
                tool: toolStat.tool,
                count: toolStat.count,
                windowM: beacon.window_m,
                errorCount: toolStat.error_count,
                latencyAvgMs: toolStat.latency_avg_ms,
                latencyMaxMs: toolStat.latency_max_ms,
                workspaceBucket: beacon.workspace_bucket,
            }));
        }

        for (const [outcome, count] of Object.entries(beacon.async_outcomes || {})) {
            dataPoints.push(buildV2Row(TELEMETRY_ROW_TYPES.asyncOutcome, beaconId, {
                ...beacon,
                count,
                windowM: beacon.window_m,
                asyncOutcome: outcome,
                workspaceBucket: beacon.workspace_bucket,
            }));
        }

        return dataPoints;
    }

    return [];
}

export function writeAppTelemetryBeacon(
    analyticsEngine: AnalyticsEngineDataset,
    beacon: AppTelemetryBeacon,
) {
    for (const dataPoint of buildAppTelemetryDataPoints(beacon)) {
        analyticsEngine.writeDataPoint(dataPoint);
    }
}

async function buildMalformedTelemetryDataPoint(
    malformed: MalformedTelemetry,
    bucket?: R2Bucket,
) {
    const errors = [...malformed.errors];
    let rawPayloadStorageKey = "";

    if (malformed.rawPayload && bucket) {
        const storageKey = buildMalformedStorageKey(
            malformed.ts,
            crypto.randomUUID(),
        );

        try {
            await bucket.put(
                storageKey,
                JSON.stringify({
                    raw_payload: malformed.rawPayload,
                    ingest_time: new Date().toISOString(),
                    event: malformed.event || "unknown",
                    iid: malformed.iid || "",
                    sid: malformed.sid || "",
                    ts: malformed.ts || "",
                    error_code: malformed.errorCode,
                    errors: malformed.errors,
                }),
                {
                    httpMetadata: {
                        contentType: "application/json",
                    },
                },
            );
            rawPayloadStorageKey = storageKey;
        } catch {
            errors.push("raw payload archival failed");
        }
    }

    return buildV2Row(
        TELEMETRY_ROW_TYPES.malformed,
        crypto.randomUUID(),
        {
            event: malformed.event || "unknown",
            iid: malformed.iid || "",
            sid: malformed.sid || "",
            ts: malformed.ts || new Date().toISOString(),
            v: malformed.v || "",
            os: malformed.os || "",
            channel: malformed.channel || "",
            rawPayloadPreview: buildMalformedPreview(malformed.rawPayload),
            rawPayloadStorageKey,
            source: "ingest",
            llm: malformed.llm,
            validationErrors: buildValidationErrors(errors),
            errorKind: "malformed_payload",
            errorCode: malformed.errorCode,
            screen: malformed.screen,
            workspaceBucket: malformed.workspace_bucket,
            count: 1,
        },
    );
}

export async function ingestAppTelemetryRequest(
    request: Request,
    analyticsEngine: AnalyticsEngineDataset,
    malformedTelemetryBucket?: R2Bucket,
) {
    let rawBody = "";

    try {
        rawBody = await request.text();
    } catch {
        analyticsEngine.writeDataPoint(
            await buildMalformedTelemetryDataPoint(
                {
                    rawPayload: "",
                    errors: ["Request body could not be read"],
                    errorCode: "body_read_failed",
                },
                malformedTelemetryBucket,
            ),
        );
        return new Response(null, { status: 202 });
    }

    let body: unknown;
    try {
        body = JSON.parse(rawBody);
    } catch {
        analyticsEngine.writeDataPoint(
            await buildMalformedTelemetryDataPoint(
                {
                    rawPayload: rawBody,
                    errors: ["Request body must be valid JSON"],
                    errorCode: "json_parse_failed",
                },
                malformedTelemetryBucket,
            ),
        );
        return new Response(null, { status: 202 });
    }

    const result = parseAppTelemetryPayload(body, rawBody);
    const dataPoints = result.beacons.flatMap(buildAppTelemetryDataPoints);
    const malformedDataPoint = result.malformed
        ? await buildMalformedTelemetryDataPoint(
            result.malformed,
            malformedTelemetryBucket,
        )
        : null;

    for (const dataPoint of dataPoints) {
        analyticsEngine.writeDataPoint(dataPoint);
    }

    if (malformedDataPoint) {
        analyticsEngine.writeDataPoint(malformedDataPoint);
    }

    return new Response(null, { status: 202 });
}
