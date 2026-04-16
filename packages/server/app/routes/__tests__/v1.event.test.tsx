import { describe, expect, test, vi } from "vitest";
import { action } from "../v1.event";

describe("v1/event route", () => {
    test("rejects non-POST methods", async () => {
        const writeDataPoint = vi.fn();
        const request = new Request("https://example.com/v1/event", {
            method: "PUT",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                event: "daemon_start",
                v: "0.8.1",
                os: "darwin-arm64",
                iid: "a1b2c3d4e5f6",
                sid: "8f3c1e4b7d92a6ff",
            }),
        });

        const response = await action({
            request,
            context: {
                cloudflare: {
                    env: {
                        APP_TELEMETRY_AE: {
                            writeDataPoint,
                        },
                    },
                },
            },
            params: {},
        });

        expect(response.status).toBe(405);
        expect(response.headers.get("Allow")).toBe("POST");
        expect(writeDataPoint).not.toHaveBeenCalled();
    });

    test("accepts usage_summary beacons and fans out summary + metric rows", async () => {
        const writeDataPoint = vi.fn();
        const request = new Request("https://example.com/v1/event", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                event: "usage_summary",
                v: "0.8.1",
                os: "darwin-arm64",
                iid: "a1b2c3d4e5f6",
                sid: "8f3c1e4b7d92a6ff",
                window_m: 5,
                props: {
                    "observe:errors": 5,
                    "interact:click": 2,
                    "ext:video": 1,
                },
            }),
        });

        const response = await action({
            request,
            context: {
                cloudflare: {
                    env: {
                        APP_TELEMETRY_AE: {
                            writeDataPoint,
                        },
                    },
                },
            },
            params: {},
        });

        expect(response.status).toBe(202);
        expect(writeDataPoint).toHaveBeenCalledTimes(4);

        const summaryCall = writeDataPoint.mock.calls[0][0];
        expect(summaryCall.blobs).toEqual([
            "kaboom",
            "summary",
            "usage_summary",
            "a1b2c3d4e5f6",
            "8f3c1e4b7d92a6ff",
            "0.8.1",
            "darwin-arm64",
            "",
            "",
            "",
            "",
            expect.any(String),
        ]);
        expect(summaryCall.doubles).toEqual([5, 0, 1]);

        const metricCall = writeDataPoint.mock.calls[1][0];
        expect(metricCall.blobs).toEqual([
            "kaboom",
            "metric",
            "usage_summary",
            "a1b2c3d4e5f6",
            "8f3c1e4b7d92a6ff",
            "0.8.1",
            "darwin-arm64",
            "observe:errors",
            "tool",
            "observe",
            "errors",
            expect.any(String),
        ]);
        expect(metricCall.doubles).toEqual([5, 5, 1]);
    });

    test("normalizes uppercase session ids before storage", async () => {
        const writeDataPoint = vi.fn();
        const request = new Request("https://example.com/v1/event", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                event: "daemon_start",
                v: "0.8.1",
                os: "darwin-arm64",
                iid: "a1b2c3d4e5f6",
                sid: "8F3C1E4B7D92A6FF",
            }),
        });

        const response = await action({
            request,
            context: {
                cloudflare: {
                    env: {
                        APP_TELEMETRY_AE: {
                            writeDataPoint,
                        },
                    },
                },
            },
            params: {},
        });

        expect(response.status).toBe(202);
        expect(writeDataPoint).toHaveBeenCalledTimes(1);
        expect(writeDataPoint.mock.calls[0][0].blobs[4]).toBe(
            "8f3c1e4b7d92a6ff",
        );
    });

    test("accepts lifecycle beacons and writes one lifecycle row", async () => {
        const writeDataPoint = vi.fn();
        const request = new Request("https://example.com/v1/event", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                event: "daemon_start",
                v: "0.8.1",
                os: "darwin-arm64",
                iid: "a1b2c3d4e5f6",
                sid: "8f3c1e4b7d92a6ff",
            }),
        });

        const response = await action({
            request,
            context: {
                cloudflare: {
                    env: {
                        APP_TELEMETRY_AE: {
                            writeDataPoint,
                        },
                    },
                },
            },
            params: {},
        });

        expect(response.status).toBe(202);
        expect(writeDataPoint).toHaveBeenCalledTimes(1);
        expect(writeDataPoint.mock.calls[0][0].blobs).toEqual([
            "kaboom",
            "lifecycle",
            "daemon_start",
            "a1b2c3d4e5f6",
            "8f3c1e4b7d92a6ff",
            "0.8.1",
            "darwin-arm64",
            "",
            "",
            "",
            "",
            expect.any(String),
        ]);
        expect(writeDataPoint.mock.calls[0][0].doubles).toEqual([0, 0, 1]);
    });

    test("accepts tool_call beacons and writes one normalized row", async () => {
        const writeDataPoint = vi.fn();
        const request = new Request("https://example.com/v1/event", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                event: "tool_call",
                iid: "a1b2c3d4e5f6",
                sid: "8F3C1E4B7D92A6FF",
                ts: "2026-04-15T08:10:00Z",
                v: "0.8.2",
                os: "darwin-arm64",
                channel: "stable",
                family: "observe",
                name: "page",
                tool: "observe:page",
                outcome: "success",
                latency_ms: 45,
            }),
        });

        const response = await action({
            request,
            context: {
                cloudflare: {
                    env: {
                        APP_TELEMETRY_AE: {
                            writeDataPoint,
                        },
                    },
                },
            },
            params: {},
        });

        expect(response.status).toBe(202);
        expect(writeDataPoint).toHaveBeenCalledTimes(1);
    });

    test("accepts app_error beacons and writes one normalized row", async () => {
        const writeDataPoint = vi.fn();
        const request = new Request("https://example.com/v1/event", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                event: "app_error",
                iid: "a1b2c3d4e5f6",
                sid: "8f3c1e4b7d92a6ff",
                ts: "2026-04-15T08:11:00Z",
                v: "0.8.2",
                os: "darwin-arm64",
                channel: "stable",
                error_kind: "integration",
                error_code: "EXTENSION_HANDSHAKE_FAILED",
                severity: "error",
                source: "extension",
                retryable: true,
            }),
        });

        const response = await action({
            request,
            context: {
                cloudflare: {
                    env: {
                        APP_TELEMETRY_AE: {
                            writeDataPoint,
                        },
                    },
                },
            },
            params: {},
        });

        expect(response.status).toBe(202);
        expect(writeDataPoint).toHaveBeenCalledTimes(1);
    });

    test("accepts session_start and session_end beacons", async () => {
        const writeDataPoint = vi.fn();
        const startRequest = new Request("https://example.com/v1/event", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                event: "session_start",
                iid: "a1b2c3d4e5f6",
                sid: "8f3c1e4b7d92a6ff",
                ts: "2026-04-15T08:00:00Z",
                v: "0.8.2",
                os: "darwin-arm64",
                channel: "stable",
                reason: "first_activity",
            }),
        });
        const endRequest = new Request("https://example.com/v1/event", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                event: "session_end",
                iid: "a1b2c3d4e5f6",
                sid: "8f3c1e4b7d92a6ff",
                ts: "2026-04-15T08:35:00Z",
                v: "0.8.2",
                os: "darwin-arm64",
                channel: "stable",
                reason: "timeout",
                duration_s: 1500,
                tool_calls: 28,
                active_window_m: 25,
            }),
        });

        const startResponse = await action({
            request: startRequest,
            context: {
                cloudflare: {
                    env: {
                        APP_TELEMETRY_AE: {
                            writeDataPoint,
                        },
                    },
                },
            },
            params: {},
        });
        const endResponse = await action({
            request: endRequest,
            context: {
                cloudflare: {
                    env: {
                        APP_TELEMETRY_AE: {
                            writeDataPoint,
                        },
                    },
                },
            },
            params: {},
        });

        expect(startResponse.status).toBe(202);
        expect(endResponse.status).toBe(202);
        expect(writeDataPoint).toHaveBeenCalledTimes(2);
    });

    test("accepts current Kaboom short session_end beacons", async () => {
        const writeDataPoint = vi.fn();
        const request = new Request("https://example.com/v1/event", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                event: "session_end",
                iid: "a1b2c3d4e5f6",
                sid: "8f3c1e4b7d92a6ff",
                ts: "2026-04-15T08:35:00Z",
                v: "0.8.2",
                os: "darwin-arm64",
                channel: "dev",
                reason: "shutdown",
                duration_s: 0,
                tool_calls: 1,
            }),
        });

        const response = await action({
            request,
            context: {
                cloudflare: {
                    env: {
                        APP_TELEMETRY_AE: {
                            writeDataPoint,
                        },
                    },
                },
            },
            params: {},
        });

        expect(response.status).toBe(202);
        expect(writeDataPoint).toHaveBeenCalledTimes(1);
    });

    test("accepts structured usage_summary beacons and flattens tool and async rows", async () => {
        const writeDataPoint = vi.fn();
        const request = new Request("https://example.com/v1/event", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                event: "usage_summary",
                iid: "a1b2c3d4e5f6",
                sid: "8f3c1e4b7d92a6ff",
                ts: "2026-04-15T08:35:00Z",
                v: "0.8.2",
                os: "darwin-arm64",
                channel: "stable",
                window_m: 5,
                tool_stats: [
                    {
                        family: "observe",
                        name: "page",
                        tool: "observe:page",
                        count: 12,
                        error_count: 0,
                        latency_avg_ms: 45,
                        latency_max_ms: 230,
                    },
                    {
                        family: "interact",
                        name: "click",
                        tool: "interact:click",
                        count: 5,
                        error_count: 1,
                        latency_avg_ms: 1200,
                        latency_max_ms: 3500,
                    },
                ],
                async_outcomes: {
                    complete: 7,
                    error: 2,
                    timeout: 1,
                },
                session_depth: 28,
            }),
        });

        const response = await action({
            request,
            context: {
                cloudflare: {
                    env: {
                        APP_TELEMETRY_AE: {
                            writeDataPoint,
                        },
                    },
                },
            },
            params: {},
        });

        expect(response.status).toBe(202);
        expect(writeDataPoint).toHaveBeenCalledTimes(5);
    });

    test("accepts allowed metric families with open names", async () => {
        const writeDataPoint = vi.fn();
        const request = new Request("https://example.com/v1/event", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                event: "usage_summary",
                v: "0.8.1",
                os: "darwin-arm64",
                iid: "a1b2c3d4e5f6",
                sid: "8f3c1e4b7d92a6ff",
                window_m: 5,
                props: {
                    "generate:custom-workflow": 2,
                    "analyze:performance": 1,
                    "configure:noise_rule": 1,
                },
            }),
        });

        const response = await action({
            request,
            context: {
                cloudflare: {
                    env: {
                        APP_TELEMETRY_AE: {
                            writeDataPoint,
                        },
                    },
                },
            },
            params: {},
        });

        expect(response.status).toBe(202);
        expect(writeDataPoint).toHaveBeenCalledTimes(4);
        expect(writeDataPoint.mock.calls[1][0].blobs.slice(7, 11)).toEqual([
            "generate:custom-workflow",
            "tool",
            "generate",
            "custom-workflow",
        ]);
        expect(writeDataPoint.mock.calls[2][0].blobs.slice(7, 11)).toEqual([
            "analyze:performance",
            "tool",
            "analyze",
            "performance",
        ]);
        expect(writeDataPoint.mock.calls[3][0].blobs.slice(7, 11)).toEqual([
            "configure:noise_rule",
            "tool",
            "configure",
            "noise_rule",
        ]);
    });

    test("rejects malformed usage_summary payloads", async () => {
        const writeDataPoint = vi.fn();
        const request = new Request("https://example.com/v1/event", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                event: "usage_summary",
                v: "0.8.1",
                os: "darwin-arm64",
                iid: "a1b2c3d4e5f6",
                sid: "8f3c1e4b7d92a6ff",
            }),
        });

        const response = await action({
            request,
            context: {
                cloudflare: {
                    env: {
                        APP_TELEMETRY_AE: {
                            writeDataPoint,
                        },
                    },
                },
            },
            params: {},
        });

        expect(response.status).toBe(400);
        expect(writeDataPoint).not.toHaveBeenCalled();
    });

    test("rejects malformed session ids", async () => {
        const writeDataPoint = vi.fn();
        const request = new Request("https://example.com/v1/event", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                event: "daemon_start",
                v: "0.8.1",
                os: "darwin-arm64",
                iid: "a1b2c3d4e5f6",
                sid: "not-a-session",
            }),
        });

        const response = await action({
            request,
            context: {
                cloudflare: {
                    env: {
                        APP_TELEMETRY_AE: {
                            writeDataPoint,
                        },
                    },
                },
            },
            params: {},
        });

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            error: "sid must be a 16-character hex string",
        });
        expect(writeDataPoint).not.toHaveBeenCalled();
    });

    test("rejects malformed metric keys", async () => {
        const writeDataPoint = vi.fn();
        const request = new Request("https://example.com/v1/event", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                event: "usage_summary",
                v: "0.8.1",
                os: "darwin-arm64",
                iid: "a1b2c3d4e5f6",
                sid: "8f3c1e4b7d92a6ff",
                window_m: 5,
                props: {
                    interact: 2,
                },
            }),
        });

        const response = await action({
            request,
            context: {
                cloudflare: {
                    env: {
                        APP_TELEMETRY_AE: {
                            writeDataPoint,
                        },
                    },
                },
            },
            params: {},
        });

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            error: "Metric keys must match family:name",
        });
        expect(writeDataPoint).not.toHaveBeenCalled();
    });

    test("rejects unknown metric families", async () => {
        const writeDataPoint = vi.fn();
        const request = new Request("https://example.com/v1/event", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                event: "usage_summary",
                v: "0.8.1",
                os: "darwin-arm64",
                iid: "a1b2c3d4e5f6",
                sid: "8f3c1e4b7d92a6ff",
                window_m: 5,
                props: {
                    "tool:click": 2,
                },
            }),
        });

        const response = await action({
            request,
            context: {
                cloudflare: {
                    env: {
                        APP_TELEMETRY_AE: {
                            writeDataPoint,
                        },
                    },
                },
            },
            params: {},
        });

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            error: "Metric family must be one of observe, interact, generate, analyze, configure, ext",
        });
        expect(writeDataPoint).not.toHaveBeenCalled();
    });
});
