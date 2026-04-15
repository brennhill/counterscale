# Kaboom App Telemetry Analysis Contract

Date: 2026-04-15

This document extends the current Kaboom telemetry contract so the app can support:

- install-level drilldown
- session reconstruction
- co-usage analysis
- session flow analysis
- behavioral segmentation
- clustering over time

This is an **additive** contract. Existing `usage_summary` and lifecycle beacons remain valid.

## Principles

- Anonymous by default
- No user identifiers beyond anonymous `install_id`
- No raw document, prompt, or page content
- Keep aggregate `usage_summary` for cheap rollups
- Add explicit event records only where they unlock behavior analysis

## Existing Required Envelope

All telemetry beacons already include:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `event` | string | yes | Event name |
| `v` | string | yes | App version |
| `os` | string | yes | OS / platform string |
| `iid` | string | yes | Install ID |
| `sid` | string | yes | Session ID |

## New Required Envelope Fields

These should be added to **all** beacons:

| Field | Type | Required | Example | Why |
|-------|------|----------|---------|-----|
| `ts` | string | yes | `2026-04-15T07:10:00Z` | Required for ordered timelines and session flow analysis |
| `channel` | string | yes | `stable`, `beta`, `dev`, `local` | Needed to compare adoption and churn by release channel |

## New Optional Envelope Fields

These should be sent when available:

| Field | Type | Required | Example | Why |
|-------|------|----------|---------|-----|
| `screen` | string | no | `inbox`, `review`, `recording` | Enables view-level behavior analysis |
| `workspace_bucket` | string | no | `none`, `1`, `2_5`, `6_20`, `21_plus` | Approximate workload/project-size segmentation without leaking precise counts |
| `arch` | string | no | `arm64`, `x64` | Platform detail |

## Event Types

### 1. `usage_summary` (keep)

Current 5-minute aggregate beacon. Keep this unchanged except for the new common envelope fields.

Example:

```json
{
  "event": "usage_summary",
  "ts": "2026-04-15T07:10:00Z",
  "v": "0.8.1",
  "os": "darwin-arm64",
  "channel": "stable",
  "iid": "a1b2c3d4e5f6",
  "sid": "8f3c1e4b7d92a6ff",
  "screen": "inbox",
  "workspace_bucket": "2_5",
  "window_m": 5,
  "props": {
    "observe:errors": 5,
    "interact:click": 2,
    "generate:test": 1,
    "ext:screenshot": 1
  }
}
```

### 2. `session_start` (new)

Emit when a new session is minted.

Additional fields:

| Field | Type | Required | Example |
|-------|------|----------|---------|
| `reason` | string | yes | `first_activity`, `startup`, `post_timeout` |

Example:

```json
{
  "event": "session_start",
  "ts": "2026-04-15T07:00:00Z",
  "v": "0.8.1",
  "os": "darwin-arm64",
  "channel": "stable",
  "iid": "a1b2c3d4e5f6",
  "sid": "8f3c1e4b7d92a6ff",
  "screen": "inbox",
  "reason": "first_activity"
}
```

### 3. `session_end` (new)

Emit when a session closes due to timeout or clean shutdown.

Additional fields:

| Field | Type | Required | Example |
|-------|------|----------|---------|
| `reason` | string | yes | `timeout`, `shutdown`, `restart` |
| `duration_s` | integer | yes | `1642` |
| `active_window_m` | integer | no | `25` |

Example:

```json
{
  "event": "session_end",
  "ts": "2026-04-15T07:27:22Z",
  "v": "0.8.1",
  "os": "darwin-arm64",
  "channel": "stable",
  "iid": "a1b2c3d4e5f6",
  "sid": "8f3c1e4b7d92a6ff",
  "reason": "timeout",
  "duration_s": 1642,
  "active_window_m": 25
}
```

### 4. `tool_event` (new)

Emit once per tracked tool or extension action. This is the critical addition for flow analysis.

Additional fields:

| Field | Type | Required | Example | Notes |
|-------|------|----------|---------|-------|
| `family` | string | yes | `observe` | One of `observe`, `interact`, `generate`, `analyze`, `configure`, `ext` |
| `name` | string | yes | `errors` | Open-ended subtool/action name |
| `source` | string | yes | `mcp`, `extension` | Event origin |
| `entrypoint` | string | no | `shortcut`, `context_menu`, `popup`, `chat` | Optional acquisition/use-path hint |
| `count` | integer | no | `1` | Defaults to `1`; use only if batching identical events |
| `result` | string | no | `success`, `error`, `cancelled` | Useful for quality and friction analysis |

Example:

```json
{
  "event": "tool_event",
  "ts": "2026-04-15T07:03:14Z",
  "v": "0.8.1",
  "os": "darwin-arm64",
  "channel": "stable",
  "iid": "a1b2c3d4e5f6",
  "sid": "8f3c1e4b7d92a6ff",
  "screen": "review",
  "workspace_bucket": "2_5",
  "family": "observe",
  "name": "errors",
  "source": "mcp",
  "entrypoint": "chat",
  "count": 1,
  "result": "success"
}
```

### 5. `screen_view` (new, optional)

Emit only if the app has meaningful navigable surfaces and view-level analysis is useful.

Additional fields:

| Field | Type | Required | Example |
|-------|------|----------|---------|
| `screen` | string | yes | `inbox`, `review`, `settings`, `recording` |
| `ref_screen` | string | no | `inbox` |

Example:

```json
{
  "event": "screen_view",
  "ts": "2026-04-15T07:04:20Z",
  "v": "0.8.1",
  "os": "darwin-arm64",
  "channel": "stable",
  "iid": "a1b2c3d4e5f6",
  "sid": "8f3c1e4b7d92a6ff",
  "screen": "review",
  "ref_screen": "inbox"
}
```

### 6. Existing lifecycle events (keep)

Keep:

- `daemon_start`
- `extension_connect`
- `extension_version_mismatch`

These should also include `ts`, `channel`, and optional `screen` when meaningful.

## Allowed Families

`tool_event.family` and `usage_summary.props` families remain:

- `observe`
- `interact`
- `generate`
- `analyze`
- `configure`
- `ext`

Names remain open-ended but non-empty.

## What This Unlocks

| Analysis | Existing contract | New additions needed |
|----------|-------------------|----------------------|
| Install table | mostly yes | channel, workspace bucket improve it |
| Install detail page | partial | `session_start`, `session_end`, `tool_event` |
| Segment view | partial | channel, workspace bucket, session boundaries |
| Co-usage matrix | yes at coarse level | `tool_event` for better fidelity |
| Session flow analysis | no | `tool_event` + `ts` |
| Clustering | partial | feature-rich events + historical snapshots |

## Rollout Guidance

### Stage 1

Add to all current beacons:

- `ts`
- `channel`
- optional `screen`
- optional `workspace_bucket`

### Stage 2

Add:

- `session_start`
- `session_end`

### Stage 3

Add:

- `tool_event`

### Stage 4

Add only if useful:

- `screen_view`

## Privacy Guardrails

Do not send:

- raw prompt content
- raw page content
- file paths
- repository names
- user names
- email addresses
- project identifiers
- exact workspace/document counts if they can be sensitive

Use buckets and enumerations instead of raw values whenever a field could reveal too much detail.
