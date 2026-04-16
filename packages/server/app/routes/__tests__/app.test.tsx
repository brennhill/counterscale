// @vitest-environment jsdom
import type { LoaderFunctionArgs } from "react-router";
import type { ReactNode } from "react";
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
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { requireAuth } from "~/lib/auth";
import { AnalyticsEngineAPI } from "~/analytics/query";
import { createFetchResponse, getDefaultContext } from "./testutils";
import AppDashboard, { loader } from "../app";

vi.mock("~/lib/auth", () => ({
    requireAuth: vi.fn(),
}));

vi.mock("recharts", async () => {
    const actual = await vi.importActual("recharts");
    return {
        ...actual,
        ResponsiveContainer: ({ children }: { children: ReactNode }) => (
            <div>{children}</div>
        ),
    };
});

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
        cleanup();
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
                )
                .mockResolvedValueOnce(
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
                )
                .mockResolvedValueOnce(
                    createFetchResponse({
                        data: [
                            {
                                install_count: 20,
                                activated_install_count: 12,
                            },
                        ],
                    }),
                )
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
                        data: [{ total_events: 1 }, { total_events: 4 }],
                    }),
                )
                .mockResolvedValueOnce(
                    createFetchResponse({
                        data: [
                            { async_outcome: "complete", count: 7 },
                            { async_outcome: "timeout", count: 1 },
                        ],
                    }),
                )
                .mockResolvedValueOnce(
                    createFetchResponse({
                        data: [
                            {
                                error_kind: "integration",
                                error_code: "EXTENSION_HANDSHAKE_FAILED",
                                count: 3,
                            },
                        ],
                    }),
                )
                .mockResolvedValueOnce(
                    createFetchResponse({
                        data: [
                            {
                                install_id: "install-a",
                                first_seen: "2026-04-01",
                                last_seen: "2026-04-14",
                                active_days: 7,
                                total_sessions: 5,
                                total_events: 25,
                                approx_active_minutes: 15,
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
                                total_usage: 12,
                            },
                        ],
                    }),
                )
                .mockResolvedValueOnce(
                    createFetchResponse({
                        data: [{ total_events: 1 }, { total_events: 4 }],
                    }),
                )
                .mockResolvedValueOnce(
                    createFetchResponse({
                        data: [
                            {
                                family_a: "observe",
                                family_b: "generate",
                                shared_installs: 3,
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
                                total_usage: 10,
                                unique_installs: 1,
                            },
                        ],
                    }),
                )
                .mockResolvedValueOnce(
                    createFetchResponse({
                        data: [{ day: "2026-04-14", total_events: 5 }],
                    }),
                )
                .mockResolvedValueOnce(
                    createFetchResponse({
                        data: [{ total_events: 1 }, { total_events: 3 }],
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
            expect(response.installs).toEqual([
                {
                    installId: "install-a",
                    firstSeen: "2026-04-01",
                    lastSeen: "2026-04-14",
                    activeDays: 7,
                    totalSessions: 5,
                    totalEvents: 25,
                    approxActiveMinutes: 15,
                    topFamily: "observe",
                },
            ]);
            expect(response.segments).toEqual([
                expect.objectContaining({ key: "power", count: 1 }),
            ]);
            expect(response.sessionDepth).toEqual([
                { label: "1", sessionCount: 1 },
                { label: "4-9", sessionCount: 1 },
            ]);
            expect(response.coUsage).toEqual([
                { familyA: "observe", familyB: "generate", sharedInstalls: 3 },
            ]);
            expect(response.toolPerformance).toEqual([
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
            expect(response.activation).toEqual({
                installCount: 20,
                activatedInstallCount: 12,
                activationRate: 0.6,
            });
            expect(response.sessionQuality).toEqual({
                avgDurationS: 1500,
                avgToolCalls: 28,
                buckets: [
                    { label: "1", sessionCount: 1 },
                    { label: "4-9", sessionCount: 1 },
                ],
            });
            expect(response.asyncOutcomes).toEqual([
                { outcome: "complete", count: 7 },
                { outcome: "timeout", count: 1 },
            ]);
            expect(response.appErrors).toEqual([
                {
                    errorKind: "integration",
                    errorCode: "EXTENSION_HANDSHAKE_FAILED",
                    count: 3,
                },
            ]);
            expect(response.selectedInstall).toEqual({
                installId: "install-a",
                firstSeen: "2026-04-01",
                lastSeen: "2026-04-14",
                activeDays: 7,
                totalSessions: 5,
                totalEvents: 25,
                approxActiveMinutes: 15,
                topFamily: "observe",
                families: [
                    {
                        family: "observe",
                        totalUsage: 10,
                        uniqueInstalls: 1,
                        subtools: [
                            {
                                key: "observe:errors",
                                name: "errors",
                                totalUsage: 10,
                                uniqueInstalls: 1,
                            },
                        ],
                    },
                ],
                activity: expect.any(Array),
                sessionDepth: [
                    { label: "1", sessionCount: 1 },
                    { label: "2-3", sessionCount: 1 },
                ],
            });
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
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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
                        {
                            family: "generate",
                            totalUsage: 6,
                            uniqueInstalls: 2,
                            subtools: [
                                {
                                    key: "generate:image",
                                    name: "image",
                                    totalUsage: 6,
                                    uniqueInstalls: 2,
                                },
                            ],
                        },
                    ],
                    installs: [
                        {
                            installId: "install-a",
                            firstSeen: "2026-04-01",
                            lastSeen: "2026-04-14",
                            activeDays: 7,
                            totalSessions: 5,
                            totalEvents: 25,
                            approxActiveMinutes: 15,
                            topFamily: "observe",
                        },
                    ],
                    segments: [
                        {
                            key: "new",
                            label: "New installs",
                            description: "First seen inside the selected date range.",
                            count: 1,
                            share: 1,
                        },
                    ],
                    sessionDepth: [
                        { label: "1", sessionCount: 1 },
                        { label: "4-9", sessionCount: 1 },
                    ],
                    coUsage: [
                        {
                            familyA: "observe",
                            familyB: "generate",
                            sharedInstalls: 3,
                        },
                    ],
                    toolPerformance: [
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
                    ],
                    activation: {
                        installCount: 20,
                        activatedInstallCount: 12,
                        activationRate: 0.6,
                    },
                    sessionQuality: {
                        avgDurationS: 1500,
                        avgToolCalls: 28,
                        buckets: [
                            { label: "1", sessionCount: 1 },
                            { label: "4-9", sessionCount: 1 },
                        ],
                    },
                    asyncOutcomes: [
                        { outcome: "complete", count: 7 },
                        { outcome: "timeout", count: 1 },
                    ],
                    appErrors: [
                        {
                            errorKind: "integration",
                            errorCode: "EXTENSION_HANDSHAKE_FAILED",
                            count: 3,
                        },
                    ],
                    selectedInstall: {
                        installId: "install-a",
                        firstSeen: "2026-04-01",
                        lastSeen: "2026-04-14",
                        activeDays: 7,
                        totalSessions: 5,
                        totalEvents: 25,
                        approxActiveMinutes: 15,
                        topFamily: "observe",
                        families: [
                            {
                                family: "observe",
                                totalUsage: 10,
                                uniqueInstalls: 1,
                                subtools: [
                                    {
                                        key: "observe:errors",
                                        name: "errors",
                                        totalUsage: 10,
                                        uniqueInstalls: 1,
                                    },
                                ],
                            },
                        ],
                        activity: [
                            { date: "2026-04-13", totalEvents: 4 },
                            { date: "2026-04-14", totalEvents: 5 },
                        ],
                        sessionDepth: [
                            { label: "1", sessionCount: 1 },
                            { label: "2-3", sessionCount: 1 },
                        ],
                    },
                }),
            },
        ]);

        render(<RemixStub initialEntries={["/app"]} />);

        expect(await screen.findByText("Kaboom Usage")).toBeInTheDocument();
        expect(
            await screen.findByText("How Kaboom is being used over the selected range."),
        ).toBeInTheDocument();
        expect(await screen.findByText("Unique Installs")).toBeInTheDocument();
        expect(await screen.findByText("Total Tool Events")).toBeInTheDocument();
        expect(await screen.findByText("Total Sessions")).toBeInTheDocument();
        expect(await screen.findByText("Daily Active Installs")).toBeInTheDocument();
        expect(await screen.findByText("Tool Usage")).toBeInTheDocument();
        expect(await screen.findByText("Install Activity")).toBeInTheDocument();
        expect(await screen.findByText("Behavior Segments")).toBeInTheDocument();
        expect(await screen.findByText("Family Pairings")).toBeInTheDocument();
        expect(await screen.findByText("Install Detail")).toBeInTheDocument();
        expect(await screen.findByText("Tool Performance")).toBeInTheDocument();
        expect(await screen.findByText("Activation")).toBeInTheDocument();
        expect(await screen.findByText("Session Quality")).toBeInTheDocument();
        expect(await screen.findByText("Async Outcomes")).toBeInTheDocument();
        expect(await screen.findByText("App Errors")).toBeInTheDocument();
        expect((await screen.findAllByText("install-a")).length).toBeGreaterThan(0);
        expect(await screen.findByText("EXTENSION_HANDSHAKE_FAILED")).toBeInTheDocument();
        expect(await screen.findByRole("button", { name: "observe" })).toBeInTheDocument();
        expect(await screen.findByText("errors")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "generate" })).toBeInTheDocument();
        expect(errorSpy).not.toHaveBeenCalledWith(
            expect.stringContaining("width(0) and height(0)"),
        );
    });

    test("filters to one family and shows selected subtool details", async () => {
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
                        {
                            family: "generate",
                            totalUsage: 6,
                            uniqueInstalls: 2,
                            subtools: [
                                {
                                    key: "generate:image",
                                    name: "image",
                                    totalUsage: 6,
                                    uniqueInstalls: 2,
                                },
                            ],
                        },
                    ],
                    installs: [],
                    segments: [],
                    sessionDepth: [],
                    coUsage: [],
                    toolPerformance: [],
                    activation: {
                        installCount: 0,
                        activatedInstallCount: 0,
                        activationRate: 0,
                    },
                    sessionQuality: {
                        avgDurationS: 0,
                        avgToolCalls: 0,
                        buckets: [],
                    },
                    asyncOutcomes: [],
                    appErrors: [],
                    selectedInstall: null,
                }),
            },
        ]);

        render(<RemixStub initialEntries={["/app"]} />);

        fireEvent.click(await screen.findByRole("button", { name: "generate" }));

        expect(
            screen.getAllByRole("button", { name: "All families" }).length,
        ).toBeGreaterThan(0);
        expect(screen.queryByRole("button", { name: /errors 10 uses 4 installs/i })).not.toBeInTheDocument();
        expect(screen.getByText("image")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /image 6 uses 2 installs/i }));

        expect(screen.getByText("Selected Subtool")).toBeInTheDocument();
        expect(screen.getByText("generate / image")).toBeInTheDocument();
        expect(screen.getByText("6 total uses")).toBeInTheDocument();
        expect(screen.getAllByText("2 installs").length).toBeGreaterThan(0);
    });
});
