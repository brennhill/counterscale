import { describe, expect, test, vi } from "vitest";
import {
    TELEMETRY_BLOB,
    TELEMETRY_DOUBLE,
    TELEMETRY_ROW_TYPES,
    buildTelemetryRow,
} from "../schema";
import { parseAppTelemetryBeacon, writeAppTelemetryBeacon } from "../ingest";

describe("telemetry schema", () => {
    test("builds normalized tool_call rows with explicit client event time", () => {
        const row = buildTelemetryRow(TELEMETRY_ROW_TYPES.toolCall, {
            event: "tool_call",
            iid: "install-1",
            sid: "8510f6ce8ca743c2",
            ts: "2026-04-15T08:10:00Z",
            v: "0.8.2",
            os: "darwin-arm64",
            channel: "stable",
            family: "observe",
            name: "page",
            tool: "observe:page",
            outcome: "success",
            latencyMs: 45,
        });

        expect(row.indexes).toEqual(["install-1"]);
        expect(row.blobs[TELEMETRY_BLOB.rowType]).toBe("tool_call");
        expect(row.blobs[TELEMETRY_BLOB.event]).toBe("tool_call");
        expect(row.blobs[TELEMETRY_BLOB.installId]).toBe("install-1");
        expect(row.blobs[TELEMETRY_BLOB.tool]).toBe("observe:page");
        expect(row.blobs[TELEMETRY_BLOB.outcome]).toBe("success");
        expect(row.doubles[TELEMETRY_DOUBLE.eventTimeMs]).toBe(
            Date.parse("2026-04-15T08:10:00Z"),
        );
        expect(row.doubles[TELEMETRY_DOUBLE.latencyMs]).toBe(45);
    });
});

describe("telemetry ingest", () => {
    test("accepts tool_call beacons", () => {
        const beacon = parseAppTelemetryBeacon({
            event: "tool_call",
            iid: "install-1",
            sid: "8510F6CE8CA743C2",
            ts: "2026-04-15T08:10:00Z",
            v: "0.8.2",
            os: "darwin-arm64",
            channel: "stable",
            family: "observe",
            name: "page",
            tool: "observe:page",
            outcome: "success",
            latency_ms: 45,
        });

        expect(beacon).toEqual(
            expect.objectContaining({
                event: "tool_call",
                sid: "8510f6ce8ca743c2",
                tool: "observe:page",
                outcome: "success",
            }),
        );
    });

    test("accepts app_error beacons", () => {
        const beacon = parseAppTelemetryBeacon({
            event: "app_error",
            iid: "install-1",
            sid: "8510f6ce8ca743c2",
            ts: "2026-04-15T08:11:00Z",
            v: "0.8.2",
            os: "darwin-arm64",
            channel: "stable",
            error_kind: "integration",
            error_code: "EXTENSION_HANDSHAKE_FAILED",
            severity: "error",
            source: "extension",
            retryable: true,
        });

        expect(beacon).toEqual(
            expect.objectContaining({
                event: "app_error",
                error_kind: "integration",
                error_code: "EXTENSION_HANDSHAKE_FAILED",
            }),
        );
    });

    test("accepts session boundary beacons", () => {
        const start = parseAppTelemetryBeacon({
            event: "session_start",
            iid: "install-1",
            sid: "8510f6ce8ca743c2",
            ts: "2026-04-15T08:00:00Z",
            v: "0.8.2",
            os: "darwin-arm64",
            channel: "stable",
            reason: "first_activity",
        });
        const end = parseAppTelemetryBeacon({
            event: "session_end",
            iid: "install-1",
            sid: "8510f6ce8ca743c2",
            ts: "2026-04-15T08:35:00Z",
            v: "0.8.2",
            os: "darwin-arm64",
            channel: "stable",
            reason: "timeout",
            duration_s: 1500,
            tool_calls: 28,
            active_window_m: 25,
        });

        expect(start).toEqual(
            expect.objectContaining({
                event: "session_start",
                reason: "first_activity",
            }),
        );
        expect(end).toEqual(
            expect.objectContaining({
                event: "session_end",
                reason: "timeout",
                tool_calls: 28,
            }),
        );
    });

    test("accepts current Kaboom session_end beacons with zero-second duration", () => {
        const end = parseAppTelemetryBeacon({
            event: "session_end",
            iid: "install-1",
            sid: "8510f6ce8ca743c2",
            ts: "2026-04-15T08:35:00Z",
            v: "0.8.2",
            os: "darwin-arm64",
            channel: "dev",
            reason: "shutdown",
            duration_s: 0,
            tool_calls: 1,
        });

        expect(end).toEqual(
            expect.objectContaining({
                event: "session_end",
                reason: "shutdown",
                duration_s: 0,
                tool_calls: 1,
            }),
        );
    });

    test("accepts structured usage_summary beacons", () => {
        const beacon = parseAppTelemetryBeacon({
            event: "usage_summary",
            iid: "install-1",
            sid: "8510f6ce8ca743c2",
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
        });

        expect(beacon).toEqual(
            expect.objectContaining({
                event: "usage_summary",
                tool_stats: expect.arrayContaining([
                    expect.objectContaining({
                        tool: "observe:page",
                        count: 12,
                    }),
                ]),
                async_outcomes: {
                    complete: 7,
                    error: 2,
                    timeout: 1,
                },
            }),
        );
    });

    test("fans out structured usage_summary beacons into normalized rows", () => {
        const writeDataPoint = vi.fn();

        const beacon = parseAppTelemetryBeacon({
            event: "usage_summary",
            iid: "install-1",
            sid: "8510f6ce8ca743c2",
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
            ],
            async_outcomes: {
                complete: 7,
                timeout: 1,
            },
        });

        writeAppTelemetryBeacon({ writeDataPoint } as any, beacon);

        expect(writeDataPoint).toHaveBeenCalledTimes(3);
        expect(writeDataPoint.mock.calls[0][0].blobs[TELEMETRY_BLOB.rowType]).toBe(
            "tool_summary",
        );
        expect(writeDataPoint.mock.calls[0][0].blobs[TELEMETRY_BLOB.tool]).toBe(
            "observe:page",
        );
        expect(writeDataPoint.mock.calls[0][0].doubles[TELEMETRY_DOUBLE.count]).toBe(12);
        expect(writeDataPoint.mock.calls[1][0].blobs[TELEMETRY_BLOB.rowType]).toBe(
            "async_outcome",
        );
        expect(writeDataPoint.mock.calls[2][0].blobs[TELEMETRY_BLOB.asyncOutcome]).toBe(
            "timeout",
        );
    });
});
