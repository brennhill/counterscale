import { describe, expect, test, vi } from "vitest";
import { action } from "../v1.event";

describe("v1/event route", () => {
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
});
