import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vitest";
import { AnalyticsEngineAPI } from "~/analytics/query";
import {
    deriveInstallSegments,
    getAppTelemetryOverview,
    getAppErrorSummary,
    getAsyncOutcomeSummary,
    getActivationSummary,
    getDailyActiveInstalls,
    getFamilyCoUsage,
    getInstallDetail,
    getInstallUsageSummaries,
    getSessionQuality,
    getSessionDepthDistribution,
    getTelemetryDateRange,
    getToolPerformance,
    getToolFamilyUsage,
} from "../query";

function createFetchResponse<T>(data: T) {
    return {
        ok: true,
        json: () => new Promise<T>((resolve) => resolve(data)),
    };
}

describe("app telemetry query", () => {
    const analyticsEngine = new AnalyticsEngineAPI("test-account", "test-token");
    let fetch: Mock;

    beforeEach(() => {
        fetch = global.fetch = vi.fn();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-04-14T12:00:00Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test("defaults this_month to the current UTC month", () => {
        expect(getTelemetryDateRange({ preset: "this_month" })).toEqual({
            start: "2026-04-01",
            end: "2026-04-14",
            preset: "this_month",
        });
    });

    test("returns overview metrics from aggregate rows", async () => {
        fetch
            .mockResolvedValueOnce(
                createFetchResponse({
                    data: [{ unique_installs: 42 }],
                }),
            )
            .mockResolvedValueOnce(
                createFetchResponse({
                    data: [{ total_events: 1337 }],
                }),
            )
            .mockResolvedValueOnce(
                createFetchResponse({
                    data: [{ total_sessions: 88 }],
                }),
            );

        const overview = await getAppTelemetryOverview(analyticsEngine, {
            start: "2026-04-01",
            end: "2026-04-14",
        });

        expect(overview).toEqual({
            uniqueInstalls: 42,
            totalEvents: 1337,
            totalSessions: 88,
        });
        expect(fetch).toHaveBeenCalledTimes(3);
        expect(fetch.mock.calls[2][1]?.body).toContain(
            "SELECT COUNT() AS total_sessions",
        );
    });

    test("returns daily active installs grouped by day", async () => {
        fetch.mockResolvedValue(
            createFetchResponse({
                data: [
                    { day: "2026-04-10", active_installs: 4 },
                    { day: "2026-04-12", active_installs: 7 },
                ],
            }),
        );

        const trend = await getDailyActiveInstalls(analyticsEngine, {
            start: "2026-04-10",
            end: "2026-04-12",
        });

        expect(trend).toEqual([
            { date: "2026-04-10", activeInstalls: 4 },
            { date: "2026-04-11", activeInstalls: 0 },
            { date: "2026-04-12", activeInstalls: 7 },
        ]);
    });

    test("groups tool family usage and nests subtools sorted by total usage", async () => {
        fetch.mockResolvedValue(
            createFetchResponse({
                data: [
                    {
                        metric_family: "observe",
                        metric_name: "errors",
                        metric_key: "observe:errors",
                        total_usage: 20,
                        unique_installs: 5,
                    },
                    {
                        metric_family: "observe",
                        metric_name: "logs",
                        metric_key: "observe:logs",
                        total_usage: 10,
                        unique_installs: 3,
                    },
                    {
                        metric_family: "generate",
                        metric_name: "test",
                        metric_key: "generate:test",
                        total_usage: 15,
                        unique_installs: 4,
                    },
                ],
            }),
        );

        const families = await getToolFamilyUsage(analyticsEngine, {
            start: "2026-04-01",
            end: "2026-04-14",
        });

        expect(families).toEqual([
            {
                family: "observe",
                totalUsage: 30,
                uniqueInstalls: 5,
                subtools: [
                    {
                        key: "observe:errors",
                        name: "errors",
                        totalUsage: 20,
                        uniqueInstalls: 5,
                    },
                    {
                        key: "observe:logs",
                        name: "logs",
                        totalUsage: 10,
                        uniqueInstalls: 3,
                    },
                ],
            },
            {
                family: "generate",
                totalUsage: 15,
                uniqueInstalls: 4,
                subtools: [
                    {
                        key: "generate:test",
                        name: "test",
                        totalUsage: 15,
                        uniqueInstalls: 4,
                    },
                ],
            },
        ]);
    });

    test("returns install usage summaries sorted by total events", async () => {
        fetch
            .mockResolvedValueOnce(
                createFetchResponse({
                    data: [
                        {
                            install_id: "install-b",
                            first_seen: "2026-04-03",
                            last_seen: "2026-04-14",
                            active_days: 5,
                            total_sessions: 8,
                            total_events: 80,
                            approx_active_minutes: 25,
                        },
                        {
                            install_id: "install-a",
                            first_seen: "2026-04-01",
                            last_seen: "2026-04-14",
                            active_days: 10,
                            total_sessions: 12,
                            total_events: 120,
                            approx_active_minutes: 40,
                        },
                    ],
                }),
            )
            .mockResolvedValueOnce(
                createFetchResponse({
                    data: [
                        {
                            install_id: "install-a",
                            metric_family: "observe",
                            total_usage: 80,
                        },
                        {
                            install_id: "install-b",
                            metric_family: "generate",
                            total_usage: 50,
                        },
                    ],
                }),
            );

        const installs = await getInstallUsageSummaries(analyticsEngine, {
            start: "2026-04-01",
            end: "2026-04-14",
        });

        expect(installs).toEqual([
            {
                installId: "install-a",
                firstSeen: "2026-04-01",
                lastSeen: "2026-04-14",
                activeDays: 10,
                totalSessions: 12,
                totalEvents: 120,
                approxActiveMinutes: 40,
                topFamily: "observe",
            },
            {
                installId: "install-b",
                firstSeen: "2026-04-03",
                lastSeen: "2026-04-14",
                activeDays: 5,
                totalSessions: 8,
                totalEvents: 80,
                approxActiveMinutes: 25,
                topFamily: "generate",
            },
        ]);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch.mock.calls[1][1]?.body).toContain("metric_family");
    });

    test("returns install detail with family usage, subtools, daily activity, and session depth", async () => {
        fetch
            .mockResolvedValueOnce(
                createFetchResponse({
                    data: [
                        {
                            install_id: "install-a",
                            first_seen: "2026-04-01",
                            last_seen: "2026-04-14",
                            active_days: 10,
                            total_sessions: 12,
                            total_events: 120,
                            approx_active_minutes: 40,
                        },
                    ],
                }),
            )
            .mockResolvedValueOnce(
                createFetchResponse({
                    data: [
                        {
                            install_id: "install-a",
                            metric_family: "observe",
                            total_usage: 80,
                        },
                        {
                            install_id: "install-a",
                            metric_family: "generate",
                            total_usage: 40,
                        },
                    ],
                }),
            )
            .mockResolvedValueOnce(
                createFetchResponse({
                    data: [
                        {
                            metric_family: "observe",
                            metric_name: "errors",
                            metric_key: "observe:errors",
                            total_usage: 80,
                            unique_installs: 1,
                        },
                        {
                            metric_family: "generate",
                            metric_name: "image",
                            metric_key: "generate:image",
                            total_usage: 40,
                            unique_installs: 1,
                        },
                    ],
                }),
            )
            .mockResolvedValueOnce(
                createFetchResponse({
                    data: [
                        { day: "2026-04-13", total_events: 10 },
                        { day: "2026-04-14", total_events: 12 },
                    ],
                }),
            )
            .mockResolvedValueOnce(
                createFetchResponse({
                    data: [
                        { total_events: 1 },
                        { total_events: 1 },
                        { total_events: 4 },
                        { total_events: 8 },
                        { total_events: 9 },
                    ],
                }),
            );

        const detail = await getInstallDetail(
            analyticsEngine,
            { start: "2026-04-01", end: "2026-04-14" },
            "install-a",
        );

        expect(detail).toEqual({
            installId: "install-a",
            firstSeen: "2026-04-01",
            lastSeen: "2026-04-14",
            activeDays: 10,
            totalSessions: 12,
            totalEvents: 120,
            approxActiveMinutes: 40,
            topFamily: "observe",
            families: [
                {
                    family: "observe",
                    totalUsage: 80,
                    uniqueInstalls: 1,
                    subtools: [
                        {
                            key: "observe:errors",
                            name: "errors",
                            totalUsage: 80,
                            uniqueInstalls: 1,
                        },
                    ],
                },
                {
                    family: "generate",
                    totalUsage: 40,
                    uniqueInstalls: 1,
                    subtools: [
                        {
                            key: "generate:image",
                            name: "image",
                            totalUsage: 40,
                            uniqueInstalls: 1,
                        },
                    ],
                },
            ],
            activity: [
                { date: "2026-04-01", totalEvents: 0 },
                { date: "2026-04-02", totalEvents: 0 },
                { date: "2026-04-03", totalEvents: 0 },
                { date: "2026-04-04", totalEvents: 0 },
                { date: "2026-04-05", totalEvents: 0 },
                { date: "2026-04-06", totalEvents: 0 },
                { date: "2026-04-07", totalEvents: 0 },
                { date: "2026-04-08", totalEvents: 0 },
                { date: "2026-04-09", totalEvents: 0 },
                { date: "2026-04-10", totalEvents: 0 },
                { date: "2026-04-11", totalEvents: 0 },
                { date: "2026-04-12", totalEvents: 0 },
                { date: "2026-04-13", totalEvents: 10 },
                { date: "2026-04-14", totalEvents: 12 },
            ],
            sessionDepth: [
                { label: "1", sessionCount: 2 },
                { label: "4-9", sessionCount: 3 },
            ],
        });
        expect(fetch).toHaveBeenCalledTimes(5);
    });

    test("derives install segments from current usage summaries", () => {
        const segments = deriveInstallSegments(
            [
                {
                    installId: "new-one",
                    firstSeen: "2026-04-10",
                    lastSeen: "2026-04-10",
                    activeDays: 1,
                    totalSessions: 1,
                    totalEvents: 2,
                    approxActiveMinutes: 5,
                    topFamily: "observe",
                },
                {
                    installId: "repeat-one",
                    firstSeen: "2026-03-28",
                    lastSeen: "2026-04-14",
                    activeDays: 3,
                    totalSessions: 4,
                    totalEvents: 12,
                    approxActiveMinutes: 10,
                    topFamily: "generate",
                },
                {
                    installId: "power-one",
                    firstSeen: "2026-03-15",
                    lastSeen: "2026-04-14",
                    activeDays: 9,
                    totalSessions: 15,
                    totalEvents: 160,
                    approxActiveMinutes: 60,
                    topFamily: "analyze",
                },
            ],
            {
                start: "2026-04-01",
                end: "2026-04-14",
            },
        );

        expect(segments).toEqual([
            expect.objectContaining({
                key: "power",
                count: 1,
            }),
            expect.objectContaining({
                key: "repeat",
                count: 1,
            }),
            expect.objectContaining({
                key: "new",
                count: 1,
            }),
        ]);
    });

    test("returns session depth distribution buckets", async () => {
        fetch.mockResolvedValue(
            createFetchResponse({
                data: [
                    { total_events: 1 },
                    { total_events: 1 },
                    { total_events: 1 },
                    { total_events: 1 },
                    { total_events: 2 },
                    { total_events: 3 },
                    { total_events: 3 },
                    { total_events: 10 },
                    { total_events: 18 },
                ],
            }),
        );

        const buckets = await getSessionDepthDistribution(analyticsEngine, {
            start: "2026-04-01",
            end: "2026-04-14",
        });

        expect(buckets).toEqual([
            { label: "1", sessionCount: 4 },
            { label: "2-3", sessionCount: 3 },
            { label: "10-24", sessionCount: 2 },
        ]);
        expect(fetch.mock.calls[0][1]?.body).toContain("GROUP BY blob4, blob5");
    });

    test("returns family co-usage by install overlap", async () => {
        fetch.mockResolvedValue(
            createFetchResponse({
                data: [
                    {
                        family_a: "observe",
                        family_b: "generate",
                        shared_installs: 6,
                    },
                    {
                        family_a: "observe",
                        family_b: "analyze",
                        shared_installs: 4,
                    },
                ],
            }),
        );

        const pairs = await getFamilyCoUsage(analyticsEngine, {
            start: "2026-04-01",
            end: "2026-04-14",
        });

        expect(pairs).toEqual([
            { familyA: "observe", familyB: "generate", sharedInstalls: 6 },
            { familyA: "observe", familyB: "analyze", sharedInstalls: 4 },
        ]);
        expect(fetch.mock.calls[0][1]?.body).toContain("shared_installs");
    });

    test("escapes install ids in install-scoped queries", async () => {
        fetch.mockResolvedValue(createFetchResponse({ data: [] }));

        await getToolFamilyUsage(
            analyticsEngine,
            { start: "2026-04-01", end: "2026-04-14" },
            "install'oops",
        );

        expect(fetch.mock.calls[0][1]?.body).toContain("AND blob4 = 'install''oops'");
    });

    test("returns tool performance rows from normalized v2 telemetry", async () => {
        fetch.mockResolvedValue(
            createFetchResponse({
                data: [
                    {
                        tool: "observe:page",
                        metric_family: "observe",
                        metric_name: "page",
                        total_calls: 12,
                        unique_installs: 5,
                        error_count: 1,
                        avg_latency_ms: 45,
                        max_latency_ms: 230,
                    },
                ],
            }),
        );

        const rows = await getToolPerformance(analyticsEngine, {
            start: "2026-04-01",
            end: "2026-04-14",
        });

        expect(rows).toEqual([
            {
                tool: "observe:page",
                family: "observe",
                name: "page",
                totalCalls: 12,
                uniqueInstalls: 5,
                errorCount: 1,
                errorRate: 1 / 12,
                avgLatencyMs: 45,
                maxLatencyMs: 230,
            },
        ]);
        expect(fetch.mock.calls[0][1]?.body).toContain("tool_summary");
        expect(fetch.mock.calls[0][1]?.body).not.toContain("'tool_call'");
    });

    test("returns activation summary from first_tool_call rows", async () => {
        fetch.mockResolvedValue(
            createFetchResponse({
                data: [
                    {
                        install_count: 20,
                        activated_install_count: 12,
                    },
                ],
            }),
        );

        const summary = await getActivationSummary(analyticsEngine, {
            start: "2026-04-01",
            end: "2026-04-14",
        });

        expect(summary).toEqual({
            installCount: 20,
            activatedInstallCount: 12,
            activationRate: 0.6,
        });
        expect(fetch.mock.calls[0][1]?.body).toContain("first_tool_call");
    });

    test("returns session quality metrics from session_end rows", async () => {
        fetch
            .mockResolvedValueOnce(
                createFetchResponse({
                    data: [
                        {
                            avg_duration_s: 1500,
                            avg_tool_calls: 28,
                        },
                    ],
                }),
            )
            .mockResolvedValueOnce(
                createFetchResponse({
                    data: [
                        { total_events: 1 },
                        { total_events: 2 },
                        { total_events: 12 },
                    ],
                }),
            );

        const summary = await getSessionQuality(analyticsEngine, {
            start: "2026-04-01",
            end: "2026-04-14",
        });

        expect(summary).toEqual({
            avgDurationS: 1500,
            avgToolCalls: 28,
            buckets: [
                { label: "1", sessionCount: 1 },
                { label: "2-3", sessionCount: 1 },
                { label: "10-24", sessionCount: 1 },
            ],
        });
        expect(fetch.mock.calls[0][1]?.body).toContain("session_end");
    });

    test("returns async outcome counts from normalized rows", async () => {
        fetch.mockResolvedValue(
            createFetchResponse({
                data: [
                    { async_outcome: "complete", count: 7 },
                    { async_outcome: "timeout", count: 1 },
                ],
            }),
        );

        const rows = await getAsyncOutcomeSummary(analyticsEngine, {
            start: "2026-04-01",
            end: "2026-04-14",
        });

        expect(rows).toEqual([
            { outcome: "complete", count: 7 },
            { outcome: "timeout", count: 1 },
        ]);
        expect(fetch.mock.calls[0][1]?.body).toContain("async_outcome");
    });

    test("returns app error groups from app_error rows", async () => {
        fetch.mockResolvedValue(
            createFetchResponse({
                data: [
                    {
                        error_kind: "integration",
                        error_code: "EXTENSION_HANDSHAKE_FAILED",
                        count: 3,
                    },
                ],
            }),
        );

        const rows = await getAppErrorSummary(analyticsEngine, {
            start: "2026-04-01",
            end: "2026-04-14",
        });

        expect(rows).toEqual([
            {
                errorKind: "integration",
                errorCode: "EXTENSION_HANDSHAKE_FAILED",
                count: 3,
            },
        ]);
        expect(fetch.mock.calls[0][1]?.body).toContain("app_error");
    });
});
