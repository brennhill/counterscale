# Kaboom Telemetry Ingestion Design

This document records the current ingestion design for Kaboom app telemetry.

## Goal

Accept structured Kaboom telemetry at `POST /v1/event` and flatten it into queryable Cloudflare Analytics Engine rows without mixing it into the web pageview dataset.

## Endpoint

- Route: `POST /v1/event`
- Body: JSON
- Response: `202 Accepted`

Canonical contract:

- [docs/contracts/kaboom-app-telemetry-analysis-contract.md](/Users/brenn/dev/counterscale/docs/contracts/kaboom-app-telemetry-analysis-contract.md)

## Supported Events

- `tool_call`
- `first_tool_call`
- `session_start`
- `session_end`
- `usage_summary`
- `app_error`

## Normalized Row Model

The ingest layer writes one Analytics Engine row per atomic fact.

Row types:

- `tool_call`
- `first_tool_call`
- `session_start`
- `session_end`
- `tool_summary`
- `async_outcome`
- `app_error`

Flattening:

- one `tool_call` row per raw tool invocation
- one `first_tool_call` row per install milestone
- one `session_start` row per session start
- one `session_end` row per session end
- one `app_error` row per runtime/product failure
- one `tool_summary` row per `usage_summary.tool_stats[]` entry
- one `async_outcome` row per `usage_summary.async_outcomes` key

## Stored Dimensions

Common dimensions:

- `row_type`
- `event`
- `iid`
- `sid`
- `v`
- `os`
- `channel`
- `tool`
- `family`
- `name`
- `source`
- `entrypoint`
- `outcome`
- `async_outcome`
- `error_kind`
- `error_code`
- `severity`
- `screen`
- `workspace_bucket`

Common numerics:

- `event_time_ms`
- `count`
- `window_m`
- `latency_ms`
- `latency_avg_ms`
- `latency_max_ms`
- `error_count`
- `duration_s`
- `tool_calls`
- `active_window_m`
- `retryable`

## Dataset Separation

App telemetry is stored in `APP_TELEMETRY_AE`.

Web pageviews remain in `WEB_COUNTER_AE`.

The two datasets are intentionally separate because they answer different product questions and use different identities and query semantics.
