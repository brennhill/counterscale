import type {
    AnalyticsEngineDataPoint,
    AnalyticsEngineDataset,
} from "@cloudflare/workers-types";

const APP_ID = "kaboom";
const SESSION_ID_PATTERN = /^[0-9a-fA-F]{16}$/;
const ALLOWED_METRIC_FAMILIES = new Set([
    "observe",
    "interact",
    "generate",
    "ext",
]);

const LIFECYCLE_EVENTS = new Set([
    "daemon_start",
    "extension_connect",
    "extension_version_mismatch",
] as const);

type LifecycleEventName =
    | "daemon_start"
    | "extension_connect"
    | "extension_version_mismatch";

type UsageSummaryBeacon = {
    event: "usage_summary";
    v: string;
    os: string;
    iid: string;
    sid: string;
    window_m: number;
    props: Record<string, number>;
};

type LifecycleBeacon = {
    event: LifecycleEventName;
    v: string;
    os: string;
    iid: string;
    sid: string;
};

export type AppTelemetryBeacon = UsageSummaryBeacon | LifecycleBeacon;

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

function createBadRequest(message: string) {
    return Response.json({ error: message }, { status: 400 });
}

function parseMetricKey(metricKey: string) {
    const parts = metricKey.split(":");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error("Metric keys must match family:name");
    }

    const [family, name] = parts;
    if (!ALLOWED_METRIC_FAMILIES.has(family)) {
        throw new Error(
            "Metric family must be one of observe, interact, generate, ext",
        );
    }

    const source = family === "ext" ? "ext" : "tool";

    return {
        metricSource: source,
        metricFamily: family,
        metricName: name,
    };
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

    if (!SESSION_ID_PATTERN.test(sessionId)) {
        throw new Error("sid must be a 16-character hex string");
    }

    const normalizedSessionId = sessionId.toLowerCase();

    if (event === "usage_summary") {
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

    throw new Error(`Unsupported event: ${event}`);
}

function buildDataPoint(
    rowType: "summary" | "metric" | "lifecycle",
    beacon: AppTelemetryBeacon,
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

export function writeAppTelemetryBeacon(
    analyticsEngine: AnalyticsEngineDataset,
    beacon: AppTelemetryBeacon,
) {
    const beaconId = crypto.randomUUID();

    if (beacon.event === "usage_summary") {
        analyticsEngine.writeDataPoint(buildDataPoint("summary", beacon, beaconId));

        for (const [metricKey, metricCount] of Object.entries(beacon.props)) {
            analyticsEngine.writeDataPoint(
                buildDataPoint("metric", beacon, beaconId, {
                    metricKey,
                    metricCount,
                    ...parseMetricKey(metricKey),
                }),
            );
        }

        return;
    }

    analyticsEngine.writeDataPoint(buildDataPoint("lifecycle", beacon, beaconId));
}

export async function ingestAppTelemetryRequest(
    request: Request,
    analyticsEngine: AnalyticsEngineDataset,
) {
    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return createBadRequest("Request body must be valid JSON");
    }

    let beacon: AppTelemetryBeacon;
    try {
        beacon = parseAppTelemetryBeacon(body);
    } catch (error) {
        return createBadRequest(
            error instanceof Error ? error.message : "Invalid telemetry payload",
        );
    }

    writeAppTelemetryBeacon(analyticsEngine, beacon);
    return new Response(null, { status: 202 });
}
