import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vitest";
import { AnalyticsEngineAPI } from "~/analytics/query";
import {
    getAppTelemetryOverview,
    getDailyActiveInstalls,
    getTelemetryDateRange,
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
});
