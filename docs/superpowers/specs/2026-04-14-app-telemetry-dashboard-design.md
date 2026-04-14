# App Telemetry Dashboard Design

## Goal

Add an authenticated online dashboard for Kaboom app telemetry so the user can:

- see unique installs over a selected date range
- see change over time over that range
- see which tool families and subtools are used
- see both total usage and unique installs per family and subtool

This dashboard is for app telemetry only. It does not replace or merge with the existing web analytics dashboard.

## Scope

### In Scope

- New authenticated route for app telemetry
- Date-range driven dashboard with default `"this month"`
- KPI cards for:
  - unique installs
  - total tool events
  - total sessions
- Trend chart for daily active installs over the selected range
- Expandable tool-family table showing:
  - total usage count
  - unique installs
- Inline subtool breakdown per family

### Out of Scope

- Retention/cohort analysis
- Tool co-usage matrix
- Export/download
- Multi-app selector
- Mixing app telemetry and web analytics on the same page

## Route And UX

### Route

- Add a new authenticated route: `/app`
- Reuse existing dashboard auth/session behavior

### Default View

- Date picker defaults to `"this month"`
- Presets:
  - `7d`
  - `30d`
  - `this month`
- Also support a custom start/end range

### Page Layout

1. Controls row
   - date-range controls
2. KPI row
   - unique installs
   - total tool events
   - total sessions
3. Trend chart
   - daily active installs across the selected range
4. Usage table
   - family rows sorted by highest total usage first
   - inline expansion to show subtools

## Data Model

Use `kaboomTelemetry` only.

Current row model:

- `blob2`: row type
- `blob3`: event name
- `blob4`: install id
- `blob5`: session id
- `blob8`: metric key
- `blob10`: metric family
- `blob11`: metric name
- `double1`: window minutes
- `double2`: metric count
- `double3`: row count

Relevant row types:

- `metric`
- `summary`
- `lifecycle`

## Metric Definitions

### Unique Installs

- distinct `blob4` over the selected range

### Total Tool Events

- sum of `double2` for rows where `blob2 = 'metric'`

### Total Sessions

- distinct `(blob4, blob5)` pairs over the selected range

### Daily Active Installs

- per day, count distinct `blob4`
- source rows:
  - `metric`
  - `lifecycle`

This ensures activity is counted even if a session emitted lifecycle rows before any tool metrics.

### Family Usage Table

For rows where `blob2 = 'metric'`, grouped by `blob10`:

- total usage = `SUM(double2)`
- unique installs = `COUNT(DISTINCT blob4)`

### Subtool Breakdown

For rows where `blob2 = 'metric'`, grouped by family + name:

- family = `blob10`
- name = `blob11`
- key = `blob8`
- total usage = `SUM(double2)`
- unique installs = `COUNT(DISTINCT blob4)`

## Allowed Families

The dashboard should expect these families:

- `observe`
- `interact`
- `generate`
- `analyze`
- `configure`
- `ext`

Unknown families should not appear because ingestion rejects them.

## Architecture

### Separation

Do not force app telemetry into the existing web analytics query layer.

Add a dedicated app telemetry query module that:

- speaks to the existing Cloudflare Analytics Engine SQL endpoint
- knows the `kaboomTelemetry` schema
- returns dashboard-shaped view models for `/app`

### Recommended Files

- `packages/server/app/routes/app.tsx`
- `packages/server/app/telemetry/query.ts`
- `packages/server/app/telemetry/types.ts`

Reuse existing UI components where they fit:

- cards
- chart primitives
- table primitives

## Query Responsibilities

The app telemetry query layer should expose focused functions such as:

- `getAppTelemetryOverview(range)`
- `getDailyActiveInstalls(range)`
- `getToolFamilyUsage(range)`

Each function should return already-shaped data for UI rendering, instead of leaking raw SQL response structures into the route component.

## Error Handling

- Require auth before querying
- Reuse existing Cloudflare credential checks
- Surface a clear dashboard-level error if Analytics Engine query execution fails
- Empty states should render valid cards/chart/table shells with zero-data messaging

## Testing

### Query Tests

- verify KPI aggregation logic
- verify daily active installs grouping
- verify family grouping and subtool grouping
- verify empty-range behavior

### Route Tests

- authenticated access path
- redirect/deny when unauthenticated
- correct default date range behavior

### UI Tests

- KPI cards render returned values
- family rows render sorted by total usage
- family expansion shows subtools

## Implementation Notes

- Keep v1 read-only
- Keep sorting server-side or view-model-side, not ad hoc in JSX
- Prefer one route loader that fetches all app-dashboard data in parallel
- Preserve the existing `/dashboard` page unchanged

## Acceptance Criteria

1. Visiting `/app` after authentication shows an app telemetry dashboard.
2. The default range is `"this month"`.
3. The page shows unique installs, total tool events, and total sessions.
4. The page shows a daily active installs trend chart over the selected range.
5. The page shows families grouped by total usage with unique installs alongside.
6. Expanding a family shows subtools with both total usage and unique installs.
7. The dashboard reads only from `kaboomTelemetry`.
8. Existing web analytics dashboard behavior remains unchanged.
