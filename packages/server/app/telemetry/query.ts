import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import type { AnalyticsEngineAPI } from "~/analytics/query";
import { TELEMETRY_ROW_TYPES } from "./schema";

dayjs.extend(utc);

export type TelemetryRangeInput = {
    preset?: string;
    start?: string;
    end?: string;
};

export type TelemetryDateRange = {
    start: string;
    end: string;
    preset?: string;
};

export type AppTelemetryOverview = {
    uniqueInstalls: number;
    totalEvents: number;
    totalSessions: number;
};

export type DailyActiveInstallPoint = {
    date: string;
    activeInstalls: number;
};

export type AppTelemetrySubtoolUsage = {
    key: string;
    name: string;
    totalUsage: number;
    uniqueInstalls: number;
};

export type AppTelemetryFamilyUsage = {
    family: string;
    totalUsage: number;
    uniqueInstalls: number;
    subtools: AppTelemetrySubtoolUsage[];
};

export type InstallUsageSummary = {
    installId: string;
    firstSeen: string;
    lastSeen: string;
    activeDays: number;
    totalSessions: number;
    totalEvents: number;
    approxActiveMinutes: number;
    topFamily: string;
};

export type InstallActivityPoint = {
    date: string;
    totalEvents: number;
};

export type SessionDepthBucket = {
    label: string;
    sessionCount: number;
};

export type InstallDetail = InstallUsageSummary & {
    families: AppTelemetryFamilyUsage[];
    activity: InstallActivityPoint[];
    sessionDepth: SessionDepthBucket[];
};

export type InstallSegment = {
    key: "power" | "repeat" | "new" | "explore";
    label: string;
    description: string;
    count: number;
    share: number;
};

export type FamilyCoUsage = {
    familyA: string;
    familyB: string;
    sharedInstalls: number;
};

export type ToolPerformanceRow = {
    tool: string;
    family: string;
    name: string;
    totalCalls: number;
    uniqueInstalls: number;
    errorCount: number;
    errorRate: number;
    avgLatencyMs: number;
    maxLatencyMs: number;
};

export type ActivationSummary = {
    installCount: number;
    activatedInstallCount: number;
    activationRate: number;
};

export type SessionQualitySummary = {
    avgDurationS: number;
    avgToolCalls: number;
    buckets: SessionDepthBucket[];
};

export type AsyncOutcomeRow = {
    outcome: string;
    count: number;
};

export type AppErrorRow = {
    errorKind: string;
    errorCode: string;
    count: number;
};

type QueryRow = Record<string, string | number | null | undefined>;

function toNumber(value: string | number | null | undefined) {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value !== "") return Number(value);
    return 0;
}

async function runQuery<T extends QueryRow>(
    analyticsEngine: AnalyticsEngineAPI,
    sql: string,
): Promise<T[]> {
    const response = await analyticsEngine.query(sql);
    const json = (await response.json()) as { data?: T[] };
    return json.data || [];
}

function toSqlDate(date: string) {
    return `${date} 00:00:00`;
}

function toSqlExclusiveEnd(date: string) {
    return `${dayjs.utc(date).add(1, "day").format("YYYY-MM-DD")} 00:00:00`;
}

function toSqlStringLiteral(value: string) {
    return `'${value.replace(/'/g, "''")}'`;
}

function buildTimeRangeWhere(range: TelemetryDateRange) {
    return `
        timestamp >= toDateTime('${toSqlDate(range.start)}')
          AND timestamp < toDateTime('${toSqlExclusiveEnd(range.end)}')
    `;
}

function toEpochMs(dateTime: string) {
    return Date.parse(dateTime);
}

function buildV2TimeRangeWhere(range: TelemetryDateRange) {
    return `
        double1 >= ${toEpochMs(`${range.start}T00:00:00Z`)}
          AND double1 < ${toEpochMs(`${dayjs.utc(range.end).add(1, "day").format("YYYY-MM-DD")}T00:00:00Z`)}
    `;
}

function buildRowTypeClause(rowTypes: string[]) {
    return `blob2 IN (${rowTypes.map(toSqlStringLiteral).join(", ")})`;
}

function buildMixedTimeWhere(
    range: TelemetryDateRange,
    {
        legacyRowTypes = [],
        v2RowTypes = [],
    }: {
        legacyRowTypes?: string[];
        v2RowTypes?: string[];
    },
) {
    const parts: string[] = [];

    if (legacyRowTypes.length > 0) {
        parts.push(`(${buildRowTypeClause(legacyRowTypes)} AND ${buildTimeRangeWhere(range)})`);
    }

    if (v2RowTypes.length > 0) {
        parts.push(`(${buildRowTypeClause(v2RowTypes)} AND ${buildV2TimeRangeWhere(range)})`);
    }

    return `blob1 = 'kaboom' AND (${parts.join(" OR ")})`;
}

function buildInstallFilter(installId?: string) {
    return installId ? `AND blob4 = ${toSqlStringLiteral(installId)}` : "";
}

function fillDateSeries<TValue>(
    range: TelemetryDateRange,
    values: Map<string, TValue>,
    createPoint: (date: string, value: TValue | undefined) => TValue,
) {
    const points: TValue[] = [];
    let cursor = dayjs.utc(range.start);
    const end = dayjs.utc(range.end);

    while (cursor.isBefore(end) || cursor.isSame(end, "day")) {
        const date = cursor.format("YYYY-MM-DD");
        points.push(createPoint(date, values.get(date)));
        cursor = cursor.add(1, "day");
    }

    return points;
}

export function getTelemetryDateRange(
    input: TelemetryRangeInput = {},
): TelemetryDateRange {
    if (input.start && input.end) {
        return {
            start: input.start,
            end: input.end,
            preset: input.preset || "custom",
        };
    }

    const now = dayjs.utc();
    const preset = input.preset || "this_month";

    switch (preset) {
        case "7d":
            return {
                start: now.subtract(6, "day").format("YYYY-MM-DD"),
                end: now.format("YYYY-MM-DD"),
                preset,
            };
        case "30d":
            return {
                start: now.subtract(29, "day").format("YYYY-MM-DD"),
                end: now.format("YYYY-MM-DD"),
                preset,
            };
        case "this_month":
        default:
            return {
                start: now.startOf("month").format("YYYY-MM-DD"),
                end: now.format("YYYY-MM-DD"),
                preset: "this_month",
            };
    }
}

export async function getAppTelemetryOverview(
    analyticsEngine: AnalyticsEngineAPI,
    range: TelemetryDateRange,
): Promise<AppTelemetryOverview> {
    const [installs, totalEvents, totalSessions] = await Promise.all([
        runQuery<{ unique_installs: number }>(
            analyticsEngine,
            `
                SELECT COUNT(DISTINCT blob4) AS unique_installs
                FROM kaboomTelemetry
                WHERE ${buildMixedTimeWhere(range, {
                    legacyRowTypes: ["summary", "metric", "lifecycle"],
                    v2RowTypes: [
                        TELEMETRY_ROW_TYPES.toolCall,
                        TELEMETRY_ROW_TYPES.firstToolCall,
                        TELEMETRY_ROW_TYPES.sessionStart,
                        TELEMETRY_ROW_TYPES.sessionEnd,
                        TELEMETRY_ROW_TYPES.toolSummary,
                        TELEMETRY_ROW_TYPES.asyncOutcome,
                        TELEMETRY_ROW_TYPES.appError,
                    ],
                })}
            `,
        ),
        runQuery<{ total_events: number }>(
            analyticsEngine,
            `
                SELECT SUM(double2) AS total_events
                FROM kaboomTelemetry
                WHERE ${buildMixedTimeWhere(range, {
                    legacyRowTypes: ["metric"],
                    v2RowTypes: [TELEMETRY_ROW_TYPES.toolSummary],
                })}
            `,
        ),
        runQuery<{ total_sessions: number }>(
            analyticsEngine,
            `
                SELECT COUNT() AS total_sessions
                FROM (
                    SELECT blob4, blob5
                    FROM kaboomTelemetry
                    WHERE ${buildMixedTimeWhere(range, {
                        legacyRowTypes: ["summary", "metric", "lifecycle"],
                        v2RowTypes: [
                            TELEMETRY_ROW_TYPES.toolCall,
                            TELEMETRY_ROW_TYPES.firstToolCall,
                            TELEMETRY_ROW_TYPES.sessionStart,
                            TELEMETRY_ROW_TYPES.sessionEnd,
                            TELEMETRY_ROW_TYPES.toolSummary,
                            TELEMETRY_ROW_TYPES.asyncOutcome,
                            TELEMETRY_ROW_TYPES.appError,
                        ],
                    })}
                    GROUP BY blob4, blob5
                )
            `,
        ),
    ]);

    return {
        uniqueInstalls: toNumber(installs[0]?.unique_installs),
        totalEvents: toNumber(totalEvents[0]?.total_events),
        totalSessions: toNumber(totalSessions[0]?.total_sessions),
    };
}

export async function getDailyActiveInstalls(
    analyticsEngine: AnalyticsEngineAPI,
    range: TelemetryDateRange,
): Promise<DailyActiveInstallPoint[]> {
    const rows = await runQuery<{ day: string; active_installs: number }>(
        analyticsEngine,
        `
            SELECT
                multiIf(
                    ${buildRowTypeClause(["summary", "metric", "lifecycle"])},
                    toDate(timestamp),
                    toDate(toDateTime(double1 / 1000))
                ) AS day,
                COUNT(DISTINCT blob4) AS active_installs
            FROM kaboomTelemetry
            WHERE ${buildMixedTimeWhere(range, {
                legacyRowTypes: ["summary", "metric", "lifecycle"],
                v2RowTypes: [
                    TELEMETRY_ROW_TYPES.toolCall,
                    TELEMETRY_ROW_TYPES.firstToolCall,
                    TELEMETRY_ROW_TYPES.sessionStart,
                    TELEMETRY_ROW_TYPES.sessionEnd,
                    TELEMETRY_ROW_TYPES.toolSummary,
                    TELEMETRY_ROW_TYPES.asyncOutcome,
                    TELEMETRY_ROW_TYPES.appError,
                ],
            })}
            GROUP BY day
            ORDER BY day ASC
        `,
    );

    const counts = new Map(
        rows.map((row) => [String(row.day), toNumber(row.active_installs)]),
    );

    return fillDateSeries<DailyActiveInstallPoint>(range, counts, (date, activeInstalls) => ({
        date,
        activeInstalls: activeInstalls || 0,
    }));
}

export async function getToolFamilyUsage(
    analyticsEngine: AnalyticsEngineAPI,
    range: TelemetryDateRange,
    installId?: string,
): Promise<AppTelemetryFamilyUsage[]> {
    const installFilter = buildInstallFilter(installId);
    const rows = await runQuery<{
        metric_family: string;
        metric_name: string;
        metric_key: string;
        total_usage: number;
        unique_installs: number;
    }>(
        analyticsEngine,
        `
            SELECT
                blob10 AS metric_family,
                blob11 AS metric_name,
                blob8 AS metric_key,
                SUM(double2) AS total_usage,
                COUNT(DISTINCT blob4) AS unique_installs
            FROM kaboomTelemetry
            WHERE ${buildMixedTimeWhere(range, {
                legacyRowTypes: ["metric"],
                v2RowTypes: [TELEMETRY_ROW_TYPES.toolSummary],
            })}
              ${installFilter}
            GROUP BY metric_family, metric_name, metric_key
            ORDER BY total_usage DESC
        `,
    );

    const families = new Map<string, AppTelemetryFamilyUsage>();

    for (const row of rows) {
        const family = String(row.metric_family);
        const totalUsage = toNumber(row.total_usage);
        const uniqueInstalls = toNumber(row.unique_installs);
        const current = families.get(family) || {
            family,
            totalUsage: 0,
            uniqueInstalls: 0,
            subtools: [],
        };

        current.totalUsage += totalUsage;
        current.uniqueInstalls = Math.max(current.uniqueInstalls, uniqueInstalls);
        current.subtools.push({
            key: String(row.metric_key),
            name: String(row.metric_name),
            totalUsage,
            uniqueInstalls,
        });
        families.set(family, current);
    }

    return Array.from(families.values())
        .map((family) => ({
            ...family,
            subtools: family.subtools.sort((a, b) => b.totalUsage - a.totalUsage),
        }))
        .sort((a, b) => b.totalUsage - a.totalUsage);
}

export async function getInstallUsageSummaries(
    analyticsEngine: AnalyticsEngineAPI,
    range: TelemetryDateRange,
): Promise<InstallUsageSummary[]> {
    const [summaryRows, familyRows] = await Promise.all([
        runQuery<{
            install_id: string;
            first_seen: string;
            last_seen: string;
            active_days: number;
            total_sessions: number;
            total_events: number;
            approx_active_minutes: number;
        }>(
            analyticsEngine,
            `
                SELECT
                    blob4 AS install_id,
                    MIN(day) AS first_seen,
                    MAX(day) AS last_seen,
                    COUNT(DISTINCT day) AS active_days,
                    COUNT(DISTINCT blob5) AS total_sessions,
                    SUM(total_events) AS total_events,
                    SUM(active_minutes) AS approx_active_minutes
                FROM (
                    SELECT
                        blob4,
                        blob5,
                        toDate(timestamp) AS day,
                        SUM(CASE WHEN blob2 = 'metric' THEN double2 ELSE 0 END) AS total_events,
                        SUM(CASE WHEN blob2 = 'summary' THEN double1 ELSE 0 END) AS active_minutes
                    FROM kaboomTelemetry
                    WHERE ${buildMixedTimeWhere(range, {
                        legacyRowTypes: ["summary", "metric", "lifecycle"],
                    })}
                    GROUP BY blob4, blob5, day

                    UNION ALL

                    SELECT
                        blob4,
                        blob5,
                        toDate(toDateTime(double1 / 1000)) AS day,
                        SUM(CASE WHEN blob2 = 'tool_summary' THEN double2 ELSE 0 END) AS total_events,
                        SUM(CASE WHEN blob2 = 'session_end' THEN double10 ELSE 0 END) AS active_minutes
                    FROM kaboomTelemetry
                    WHERE ${buildMixedTimeWhere(range, {
                        v2RowTypes: [
                            TELEMETRY_ROW_TYPES.toolSummary,
                            TELEMETRY_ROW_TYPES.sessionEnd,
                            TELEMETRY_ROW_TYPES.toolCall,
                            TELEMETRY_ROW_TYPES.firstToolCall,
                            TELEMETRY_ROW_TYPES.sessionStart,
                            TELEMETRY_ROW_TYPES.asyncOutcome,
                            TELEMETRY_ROW_TYPES.appError,
                        ],
                    })}
                    GROUP BY blob4, blob5, day
                )
                GROUP BY install_id
                ORDER BY total_events DESC, last_seen DESC
                LIMIT 50
            `,
        ),
        runQuery<{
            install_id: string;
            metric_family: string;
            total_usage: number;
        }>(
            analyticsEngine,
            `
                SELECT
                    blob4 AS install_id,
                    blob10 AS metric_family,
                    SUM(double2) AS total_usage
                FROM kaboomTelemetry
                WHERE ${buildMixedTimeWhere(range, {
                    legacyRowTypes: ["metric"],
                    v2RowTypes: [TELEMETRY_ROW_TYPES.toolSummary],
                })}
                GROUP BY install_id, metric_family
                ORDER BY install_id ASC, total_usage DESC, metric_family ASC
            `,
        ),
    ]);

    const topFamilies = new Map<string, string>();
    for (const row of familyRows) {
        const installId = String(row.install_id);
        if (!topFamilies.has(installId)) {
            topFamilies.set(installId, String(row.metric_family));
        }
    }

    return summaryRows
        .map((row) => ({
            installId: String(row.install_id),
            firstSeen: String(row.first_seen),
            lastSeen: String(row.last_seen),
            activeDays: toNumber(row.active_days),
            totalSessions: toNumber(row.total_sessions),
            totalEvents: toNumber(row.total_events),
            approxActiveMinutes: toNumber(row.approx_active_minutes),
            topFamily: topFamilies.get(String(row.install_id)) || "none",
        }))
        .sort((a, b) => b.totalEvents - a.totalEvents || a.installId.localeCompare(b.installId));
}

function bucketSessionDepth(totalEvents: number) {
    if (totalEvents <= 1) return "1";
    if (totalEvents <= 3) return "2-3";
    if (totalEvents <= 9) return "4-9";
    if (totalEvents <= 24) return "10-24";
    return "25+";
}

export function deriveInstallSegments(
    installs: InstallUsageSummary[],
    range: TelemetryDateRange,
): InstallSegment[] {
    if (installs.length === 0) return [];

    const counts: Record<InstallSegment["key"], number> = {
        power: 0,
        repeat: 0,
        new: 0,
        explore: 0,
    };

    for (const install of installs) {
        const firstSeen = dayjs.utc(install.firstSeen);
        const rangeStart = dayjs.utc(range.start);

        if (
            install.totalEvents >= 100 ||
            install.totalSessions >= 10 ||
            install.activeDays >= 7
        ) {
            counts.power += 1;
            continue;
        }

        if (firstSeen.isSame(rangeStart) || firstSeen.isAfter(rangeStart)) {
            counts.new += 1;
            continue;
        }

        if (install.activeDays >= 3 || install.totalSessions >= 4 || install.totalEvents >= 10) {
            counts.repeat += 1;
            continue;
        }

        counts.explore += 1;
    }

    const total = installs.length;
    const definitions: Array<Pick<InstallSegment, "key" | "label" | "description">> = [
        {
            key: "power",
            label: "Power users",
            description: "High-depth installs with repeated sessions and heavier tool usage.",
        },
        {
            key: "repeat",
            label: "Repeat users",
            description: "Installs returning across multiple days or sessions.",
        },
        {
            key: "new",
            label: "New installs",
            description: "First seen inside the selected date range.",
        },
        {
            key: "explore",
            label: "Exploratory installs",
            description: "Light one-off or low-depth usage so far.",
        },
    ];

    return definitions
        .map((definition) => ({
            ...definition,
            count: counts[definition.key],
            share: total === 0 ? 0 : counts[definition.key] / total,
        }))
        .filter((segment) => segment.count > 0)
        .sort((a, b) => b.count - a.count);
}

export async function getSessionDepthDistribution(
    analyticsEngine: AnalyticsEngineAPI,
    range: TelemetryDateRange,
    installId?: string,
): Promise<SessionDepthBucket[]> {
    const installFilter = buildInstallFilter(installId);
    const rows = await runQuery<{
        total_events: number;
    }>(
        analyticsEngine,
        `
            SELECT total_events
            FROM (
                SELECT double9 AS total_events
                FROM kaboomTelemetry
                WHERE ${buildMixedTimeWhere(range, {
                    v2RowTypes: [TELEMETRY_ROW_TYPES.sessionEnd],
                })}
                  ${installFilter}

                UNION ALL

                SELECT SUM(double2) AS total_events
                FROM kaboomTelemetry
                WHERE ${buildMixedTimeWhere(range, {
                    legacyRowTypes: ["metric"],
                })}
                  ${installFilter}
                GROUP BY blob4, blob5
            )
        `,
    );

    const counts = new Map<string, number>();
    for (const row of rows) {
        const label = bucketSessionDepth(toNumber(row.total_events));
        counts.set(label, (counts.get(label) || 0) + 1);
    }

    const order = ["1", "2-3", "4-9", "10-24", "25+"];
    return order
        .filter((label) => counts.has(label))
        .map((label) => ({
            label,
            sessionCount: counts.get(label) || 0,
        }));
}

export async function getFamilyCoUsage(
    analyticsEngine: AnalyticsEngineAPI,
    range: TelemetryDateRange,
): Promise<FamilyCoUsage[]> {
    const rows = await runQuery<{
        family_a: string;
        family_b: string;
        shared_installs: number;
    }>(
        analyticsEngine,
        `
            SELECT
                a.metric_family AS family_a,
                b.metric_family AS family_b,
                COUNT() AS shared_installs
            FROM (
                SELECT DISTINCT blob4 AS install_id, blob10 AS metric_family
                FROM kaboomTelemetry
                WHERE ${buildMixedTimeWhere(range, {
                    legacyRowTypes: ["metric"],
                    v2RowTypes: [TELEMETRY_ROW_TYPES.toolSummary],
                })}
            ) a
            INNER JOIN (
                SELECT DISTINCT blob4 AS install_id, blob10 AS metric_family
                FROM kaboomTelemetry
                WHERE ${buildMixedTimeWhere(range, {
                    legacyRowTypes: ["metric"],
                    v2RowTypes: [TELEMETRY_ROW_TYPES.toolSummary],
                })}
            ) b
            ON a.install_id = b.install_id
            AND a.metric_family < b.metric_family
            GROUP BY family_a, family_b
            ORDER BY shared_installs DESC, family_a ASC, family_b ASC
            LIMIT 12
        `,
    );

    return rows.map((row) => ({
        familyA: String(row.family_a),
        familyB: String(row.family_b),
        sharedInstalls: toNumber(row.shared_installs),
    }));
}

async function getInstallDailyActivity(
    analyticsEngine: AnalyticsEngineAPI,
    range: TelemetryDateRange,
    installId: string,
): Promise<InstallActivityPoint[]> {
    const installFilter = toSqlStringLiteral(installId);
    const rows = await runQuery<{ day: string; total_events: number }>(
        analyticsEngine,
        `
            SELECT day, SUM(total_events) AS total_events
            FROM (
                SELECT toDate(timestamp) AS day, SUM(double2) AS total_events
                FROM kaboomTelemetry
                WHERE ${buildMixedTimeWhere(range, {
                    legacyRowTypes: ["metric"],
                })}
                  AND blob4 = ${installFilter}
                GROUP BY day

                UNION ALL

                SELECT toDate(toDateTime(double1 / 1000)) AS day, SUM(double2) AS total_events
                FROM kaboomTelemetry
                WHERE ${buildMixedTimeWhere(range, {
                    v2RowTypes: [TELEMETRY_ROW_TYPES.toolSummary],
                })}
                  AND blob4 = ${installFilter}
                GROUP BY day
            )
            GROUP BY day
            ORDER BY day ASC
        `,
    );

    const counts = new Map(rows.map((row) => [String(row.day), toNumber(row.total_events)]));
    return fillDateSeries<InstallActivityPoint>(range, counts, (date, totalEvents) => ({
        date,
        totalEvents: totalEvents || 0,
    }));
}

export async function getInstallDetail(
    analyticsEngine: AnalyticsEngineAPI,
    range: TelemetryDateRange,
    installId: string,
    summary?: InstallUsageSummary,
): Promise<InstallDetail | null> {
    const resolvedSummary =
        summary ||
        (await getInstallUsageSummaries(analyticsEngine, range)).find(
            (install) => install.installId === installId,
        );

    if (!resolvedSummary) {
        return null;
    }

    const [families, activity, sessionDepth] = await Promise.all([
        getToolFamilyUsage(analyticsEngine, range, installId),
        getInstallDailyActivity(analyticsEngine, range, installId),
        getSessionDepthDistribution(analyticsEngine, range, installId),
    ]);

    return {
        ...resolvedSummary,
        families,
        activity,
        sessionDepth,
    };
}

export async function getToolPerformance(
    analyticsEngine: AnalyticsEngineAPI,
    range: TelemetryDateRange,
): Promise<ToolPerformanceRow[]> {
    const rows = await runQuery<{
        tool: string;
        metric_family: string;
        metric_name: string;
        total_calls: number;
        unique_installs: number;
        error_count: number;
        avg_latency_ms: number;
        max_latency_ms: number;
    }>(
        analyticsEngine,
        `
            SELECT
                blob8 AS tool,
                blob10 AS metric_family,
                blob11 AS metric_name,
                SUM(double2) AS total_calls,
                COUNT(DISTINCT blob4) AS unique_installs,
                SUM(double7) AS error_count,
                CASE
                    WHEN SUM(double2) = 0 THEN 0
                    ELSE SUM(double5 * double2) / SUM(double2)
                END AS avg_latency_ms,
                MAX(double6) AS max_latency_ms
            FROM kaboomTelemetry
            WHERE ${buildMixedTimeWhere(range, {
                v2RowTypes: [TELEMETRY_ROW_TYPES.toolSummary],
            })}
            GROUP BY tool, metric_family, metric_name
            ORDER BY total_calls DESC, tool ASC
        `,
    );

    return rows.map((row) => {
        const totalCalls = toNumber(row.total_calls);
        const errorCount = toNumber(row.error_count);

        return {
            tool: String(row.tool),
            family: String(row.metric_family),
            name: String(row.metric_name),
            totalCalls,
            uniqueInstalls: toNumber(row.unique_installs),
            errorCount,
            errorRate: totalCalls === 0 ? 0 : errorCount / totalCalls,
            avgLatencyMs: toNumber(row.avg_latency_ms),
            maxLatencyMs: toNumber(row.max_latency_ms),
        };
    });
}

export async function getActivationSummary(
    analyticsEngine: AnalyticsEngineAPI,
    range: TelemetryDateRange,
): Promise<ActivationSummary> {
    const rows = await runQuery<{
        install_count: number;
        activated_install_count: number;
    }>(
        analyticsEngine,
        `
            SELECT
                (
                    SELECT COUNT(DISTINCT blob4)
                    FROM kaboomTelemetry
                    WHERE ${buildMixedTimeWhere(range, {
                        legacyRowTypes: ["summary", "metric", "lifecycle"],
                        v2RowTypes: [
                            TELEMETRY_ROW_TYPES.toolCall,
                            TELEMETRY_ROW_TYPES.firstToolCall,
                            TELEMETRY_ROW_TYPES.sessionStart,
                            TELEMETRY_ROW_TYPES.sessionEnd,
                            TELEMETRY_ROW_TYPES.toolSummary,
                            TELEMETRY_ROW_TYPES.asyncOutcome,
                            TELEMETRY_ROW_TYPES.appError,
                        ],
                    })}
                ) AS install_count,
                (
                    SELECT COUNT(DISTINCT blob4)
                    FROM kaboomTelemetry
                    WHERE ${buildMixedTimeWhere(range, {
                        v2RowTypes: [TELEMETRY_ROW_TYPES.firstToolCall],
                    })}
                ) AS activated_install_count
        `,
    );

    const installCount = toNumber(rows[0]?.install_count);
    const activatedInstallCount = toNumber(rows[0]?.activated_install_count);

    return {
        installCount,
        activatedInstallCount,
        activationRate: installCount === 0 ? 0 : activatedInstallCount / installCount,
    };
}

export async function getSessionQuality(
    analyticsEngine: AnalyticsEngineAPI,
    range: TelemetryDateRange,
): Promise<SessionQualitySummary> {
    const [rows, buckets] = await Promise.all([
        runQuery<{
            avg_duration_s: number;
            avg_tool_calls: number;
        }>(
            analyticsEngine,
            `
                SELECT
                    AVG(double8) AS avg_duration_s,
                    AVG(double9) AS avg_tool_calls
                FROM kaboomTelemetry
                WHERE ${buildMixedTimeWhere(range, {
                    v2RowTypes: [TELEMETRY_ROW_TYPES.sessionEnd],
                })}
            `,
        ),
        getSessionDepthDistribution(analyticsEngine, range),
    ]);

    return {
        avgDurationS: toNumber(rows[0]?.avg_duration_s),
        avgToolCalls: toNumber(rows[0]?.avg_tool_calls),
        buckets,
    };
}

export async function getAsyncOutcomeSummary(
    analyticsEngine: AnalyticsEngineAPI,
    range: TelemetryDateRange,
): Promise<AsyncOutcomeRow[]> {
    const rows = await runQuery<{
        async_outcome: string;
        count: number;
    }>(
        analyticsEngine,
        `
            SELECT
                blob15 AS async_outcome,
                SUM(double2) AS count
            FROM kaboomTelemetry
            WHERE ${buildMixedTimeWhere(range, {
                v2RowTypes: [TELEMETRY_ROW_TYPES.asyncOutcome],
            })}
            GROUP BY async_outcome
            ORDER BY count DESC, async_outcome ASC
        `,
    );

    return rows.map((row) => ({
        outcome: String(row.async_outcome),
        count: toNumber(row.count),
    }));
}

export async function getAppErrorSummary(
    analyticsEngine: AnalyticsEngineAPI,
    range: TelemetryDateRange,
): Promise<AppErrorRow[]> {
    const rows = await runQuery<{
        error_kind: string;
        error_code: string;
        count: number;
    }>(
        analyticsEngine,
        `
            SELECT
                blob16 AS error_kind,
                blob17 AS error_code,
                SUM(double2) AS count
            FROM kaboomTelemetry
            WHERE ${buildMixedTimeWhere(range, {
                v2RowTypes: [TELEMETRY_ROW_TYPES.appError],
            })}
            GROUP BY error_kind, error_code
            ORDER BY count DESC, error_kind ASC, error_code ASC
        `,
    );

    return rows.map((row) => ({
        errorKind: String(row.error_kind),
        errorCode: String(row.error_code),
        count: toNumber(row.count),
    }));
}
