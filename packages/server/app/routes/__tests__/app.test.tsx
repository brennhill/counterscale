// @vitest-environment jsdom
import type { LoaderFunctionArgs } from "react-router";
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    test,
    vi,
    type Mock,
} from "vitest";
import "vitest-dom/extend-expect";
import ResizeObserverPolyfill from "resize-observer-polyfill";
import { createRoutesStub } from "react-router";
import { render, screen } from "@testing-library/react";

import { requireAuth } from "~/lib/auth";
import { AnalyticsEngineAPI } from "~/analytics/query";
import { createFetchResponse, getDefaultContext } from "./testutils";
import AppDashboard, { loader } from "../app";

vi.mock("~/lib/auth", () => ({
    requireAuth: vi.fn(),
}));

describe("App dashboard route", () => {
    let fetch: Mock;

    beforeAll(() => {
        global.ResizeObserver = ResizeObserverPolyfill;
    });

    beforeEach(() => {
        fetch = global.fetch = vi.fn();
        vi.mocked(requireAuth).mockResolvedValue({} as any);
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-04-14T12:00:00Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe("loader", () => {
        test("defaults to this month and returns overview, trend, and family usage", async () => {
            fetch
                .mockResolvedValueOnce(
                    createFetchResponse({ data: [{ unique_installs: 12 }] }),
                )
                .mockResolvedValueOnce(
                    createFetchResponse({ data: [{ total_events: 25 }] }),
                )
                .mockResolvedValueOnce(
                    createFetchResponse({ data: [{ total_sessions: 7 }] }),
                )
                .mockResolvedValueOnce(
                    createFetchResponse({
                        data: [{ day: "2026-04-14", active_installs: 5 }],
                    }),
                )
                .mockResolvedValueOnce(
                    createFetchResponse({
                        data: [
                            {
                                metric_family: "observe",
                                metric_name: "errors",
                                metric_key: "observe:errors",
                                total_usage: 10,
                                unique_installs: 4,
                            },
                        ],
                    }),
                );

            const response = await loader({
                ...getDefaultContext(),
                request: {
                    url: "http://localhost:3000/app",
                } as Request,
            } as LoaderFunctionArgs);

            expect(response.range).toEqual({
                start: "2026-04-01",
                end: "2026-04-14",
                preset: "this_month",
            });
            expect(response.overview).toEqual({
                uniqueInstalls: 12,
                totalEvents: 25,
                totalSessions: 7,
            });
            expect(response.trend).toEqual([
                { date: "2026-04-01", activeInstalls: 0 },
                { date: "2026-04-02", activeInstalls: 0 },
                { date: "2026-04-03", activeInstalls: 0 },
                { date: "2026-04-04", activeInstalls: 0 },
                { date: "2026-04-05", activeInstalls: 0 },
                { date: "2026-04-06", activeInstalls: 0 },
                { date: "2026-04-07", activeInstalls: 0 },
                { date: "2026-04-08", activeInstalls: 0 },
                { date: "2026-04-09", activeInstalls: 0 },
                { date: "2026-04-10", activeInstalls: 0 },
                { date: "2026-04-11", activeInstalls: 0 },
                { date: "2026-04-12", activeInstalls: 0 },
                { date: "2026-04-13", activeInstalls: 0 },
                { date: "2026-04-14", activeInstalls: 5 },
            ]);
            expect(response.families).toEqual([
                {
                    family: "observe",
                    totalUsage: 10,
                    uniqueInstalls: 4,
                    subtools: [
                        {
                            key: "observe:errors",
                            name: "errors",
                            totalUsage: 10,
                            uniqueInstalls: 4,
                        },
                    ],
                },
            ]);
        });

        test("requires authentication", async () => {
            vi.mocked(requireAuth).mockRejectedValue(
                new Response(null, { status: 302 }),
            );

            await expect(
                loader({
                    context: {
                        analyticsEngine: new AnalyticsEngineAPI("x", "y"),
                        cloudflare: { env: {} },
                    },
                    request: { url: "http://localhost:3000/app" } as Request,
                } as LoaderFunctionArgs),
            ).rejects.toBeInstanceOf(Response);
        });
    });

    test("renders kpis, trend section, and family breakdown", async () => {
        vi.useRealTimers();

        const RemixStub = createRoutesStub([
            {
                path: "/app",
                Component: AppDashboard,
                HydrateFallback: () => null,
                loader: () => ({
                    range: {
                        start: "2026-04-01",
                        end: "2026-04-14",
                        preset: "this_month",
                    },
                    overview: {
                        uniqueInstalls: 12,
                        totalEvents: 25,
                        totalSessions: 7,
                    },
                    trend: [
                        { date: "2026-04-13", activeInstalls: 4 },
                        { date: "2026-04-14", activeInstalls: 5 },
                    ],
                    families: [
                        {
                            family: "observe",
                            totalUsage: 10,
                            uniqueInstalls: 4,
                            subtools: [
                                {
                                    key: "observe:errors",
                                    name: "errors",
                                    totalUsage: 10,
                                    uniqueInstalls: 4,
                                },
                            ],
                        },
                    ],
                }),
            },
        ]);

        render(<RemixStub initialEntries={["/app"]} />);

        expect(await screen.findByText("Unique Installs")).toBeInTheDocument();
        expect(await screen.findByText("Total Tool Events")).toBeInTheDocument();
        expect(await screen.findByText("Total Sessions")).toBeInTheDocument();
        expect(await screen.findByText("Daily Active Installs")).toBeInTheDocument();
        expect(await screen.findByText("Tool Usage")).toBeInTheDocument();
        expect(await screen.findByText("observe")).toBeInTheDocument();
        expect(await screen.findByText("errors")).toBeInTheDocument();
    });
});
