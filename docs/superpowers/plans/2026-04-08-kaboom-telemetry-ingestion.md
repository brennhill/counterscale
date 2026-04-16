# Kaboom Telemetry Ingestion Implementation Record

This document records the delivered Kaboom telemetry ingestion path.

## Delivered Outcome

The worker exposes:

- `POST /v1/event`

The route accepts the canonical Kaboom telemetry contract and writes normalized rows into `APP_TELEMETRY_AE`.

## Canonical References

- Contract: [docs/contracts/kaboom-app-telemetry-analysis-contract.md](/Users/brenn/dev/counterscale/docs/contracts/kaboom-app-telemetry-analysis-contract.md)
- Ingestion design: [docs/superpowers/specs/2026-04-08-kaboom-telemetry-ingestion-design.md](/Users/brenn/dev/counterscale/docs/superpowers/specs/2026-04-08-kaboom-telemetry-ingestion-design.md)

## Implemented Event Set

- `tool_call`
- `first_tool_call`
- `session_start`
- `session_end`
- `usage_summary`
- `app_error`

## Implemented Row Types

- `tool_call`
- `first_tool_call`
- `session_start`
- `session_end`
- `tool_summary`
- `async_outcome`
- `app_error`

## Verification

Focused route and ingest tests:

```bash
pnpm --filter @counterscale/server exec vitest run app/routes/__tests__/v1.event.test.tsx app/telemetry/__tests__/ingest.test.ts
```

Build:

```bash
pnpm --filter @counterscale/server build
```
