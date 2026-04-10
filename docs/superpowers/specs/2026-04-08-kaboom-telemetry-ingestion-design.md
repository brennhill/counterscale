# Kaboom Telemetry Ingestion Design

> Add a dedicated `POST /v1/event` ingestion endpoint to Counterscale so Kaboom can send anonymous usage and lifecycle beacons that are stored in a queryable shape for later analysis.

## Goal

Accept the Kaboom beacon contract from `/Users/brenn/dev/gasoline/docs/core/app-metrics.md` and store it in a dedicated Analytics Engine dataset without overloading the pageview dataset.

## Decision

Use a separate Analytics Engine dataset for app telemetry.

Each incoming beacon is normalized into one or more rows:

- `summary` row for every `usage_summary`
- `metric` row for each `props` entry inside `usage_summary`
- `lifecycle` row for `daemon_start`, `extension_connect`, and `extension_version_mismatch`

App identity is fixed to `kaboom` for this ingestion path.

## Endpoint Contract

- Route: `POST /v1/event`
- Body: JSON
- Accepted events:
  - `usage_summary`
  - `daemon_start`
  - `extension_connect`
  - `extension_version_mismatch`

Usage summary requires:

- `event`
- `v`
- `os`
- `iid`
- `sid`
- `window_m`
- `props`

Lifecycle beacons require:

- `event`
- `v`
- `os`
- `iid`
- `sid`

## Storage Shape

Use a dedicated dataset binding, `APP_TELEMETRY_AE`.

Common stored dimensions:

- `app_id`
- `row_type`
- `event_name`
- `install_id`
- `session_id`
- `version`
- `os`
- `beacon_id`

Metric rows additionally store:

- `metric_key`
- `metric_source`
- `metric_family`
- `metric_name`
- `metric_count`

Summary rows additionally store:

- `window_m`
- `row_count`

Lifecycle rows omit `window_m` and metric fields, but still store `row_count`.

All rows store `row_count = 1` so lifecycle rows have an explicit numeric payload and future aggregate queries can count rows without relying only on raw event count.

## Why This Shape

This is the minimum shape that preserves future analysis options:

- installs: distinct `install_id`
- active installs: installs with summary rows
- session length: sum `window_m` by `session_id`
- tool usage: sum `metric_count` by `metric_key`
- tool co-usage: metric rows grouped by `session_id` or `beacon_id`

## Non-Goals

- Dashboard queries or UI for app telemetry
- Authentication on this ingestion endpoint
- Multi-app routing in v1

## Deployment

Deployment requires:

- new route file for `/v1/event`
- new ingestion/writer module
- new Analytics Engine binding in Wrangler config
- updated Worker deployment to production
