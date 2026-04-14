import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import type { AnalyticsEngineAPI } from "~/analytics/query";

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
                WHERE timestamp >= toDateTime('${toSqlDate(range.start)}')
                  AND timestamp < toDateTime('${toSqlExclusiveEnd(range.end)}')
            `,
        ),
        runQuery<{ total_events: number }>(
            analyticsEngine,
            `
                SELECT SUM(double2) AS total_events
                FROM kaboomTelemetry
                WHERE timestamp >= toDateTime('${toSqlDate(range.start)}')
                  AND timestamp < toDateTime('${toSqlExclusiveEnd(range.end)}')
                  AND blob2 = 'metric'
            `,
        ),
        runQuery<{ total_sessions: number }>(
            analyticsEngine,
            `
                SELECT COUNT() AS total_sessions
                FROM (
                    SELECT blob4, blob5
                    FROM kaboomTelemetry
                    WHERE timestamp >= toDateTime('${toSqlDate(range.start)}')
                      AND timestamp < toDateTime('${toSqlExclusiveEnd(range.end)}')
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
            SELECT toDate(timestamp) AS day, COUNT(DISTINCT blob4) AS active_installs
            FROM kaboomTelemetry
            WHERE timestamp >= toDateTime('${toSqlDate(range.start)}')
              AND timestamp < toDateTime('${toSqlExclusiveEnd(range.end)}')
              AND blob2 IN ('metric', 'lifecycle')
            GROUP BY day
            ORDER BY day ASC
        `,
    );

    const counts = new Map(
        rows.map((row) => [String(row.day), toNumber(row.active_installs)]),
    );

    const points: DailyActiveInstallPoint[] = [];
    let cursor = dayjs.utc(range.start);
    const end = dayjs.utc(range.end);

    while (cursor.isBefore(end) || cursor.isSame(end, "day")) {
        const date = cursor.format("YYYY-MM-DD");
        points.push({
            date,
            activeInstalls: counts.get(date) || 0,
        });
        cursor = cursor.add(1, "day");
    }

    return points;
}

export async function getToolFamilyUsage(
    analyticsEngine: AnalyticsEngineAPI,
    range: TelemetryDateRange,
): Promise<AppTelemetryFamilyUsage[]> {
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
            WHERE timestamp >= toDateTime('${toSqlDate(range.start)}')
              AND timestamp < toDateTime('${toSqlExclusiveEnd(range.end)}')
              AND blob2 = 'metric'
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
