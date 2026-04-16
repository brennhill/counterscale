# Kaboom Telemetry Contract Implementation Record

This document records the current implementation state of the Kaboom telemetry contract in the worker.

## Canonical References

- Contract: [docs/contracts/kaboom-app-telemetry-analysis-contract.md](/Users/brenn/dev/counterscale/docs/contracts/kaboom-app-telemetry-analysis-contract.md)
- Production setup: [docs/cloudflare-workers-production.md](/Users/brenn/dev/counterscale/docs/cloudflare-workers-production.md)

## Implemented Surface

The worker accepts:

- `tool_call`
- `first_tool_call`
- `session_start`
- `session_end`
- `usage_summary`
- `app_error`

Route:

- `POST /v1/event`

Storage backend:

- `APP_TELEMETRY_AE`

Dashboard surface:

- `/app`

## Ingest Behavior

The ingest layer:

- validates the shared envelope
- validates tool identity as `family:name`
- validates `sid` as a 16-character hex string
- writes app event time as an explicit numeric field
- flattens `usage_summary.tool_stats[]` into `tool_summary` rows
- flattens `usage_summary.async_outcomes` into `async_outcome` rows

## Current Row Types

- `tool_call`
- `first_tool_call`
- `session_start`
- `session_end`
- `tool_summary`
- `async_outcome`
- `app_error`

## Current Dashboard Assumptions

- aggregate tool usage comes from `tool_summary`
- activation comes from `first_tool_call`
- session depth and duration come from `session_end`
- async reliability comes from `async_outcome` and `tool_call.async_outcome`
- runtime failures outside direct tool use come from `app_error`

## Verification Commands

Focused tests:

```bash
pnpm --filter @counterscale/server exec vitest run app/telemetry/__tests__/ingest.test.ts app/telemetry/__tests__/query.test.ts app/routes/__tests__/v1.event.test.tsx app/routes/__tests__/app.test.tsx
```

Build:

```bash
pnpm --filter @counterscale/server build
```

## Follow-On Work

Future dashboard expansions should build on the canonical contract rather than adding new free-form event namespaces. New analysis dimensions should become explicit fields or explicit event types.
