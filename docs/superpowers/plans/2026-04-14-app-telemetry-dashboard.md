# App Telemetry Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an authenticated `/app` dashboard that visualizes Kaboom app telemetry with KPI cards, a daily active installs trend chart, and expandable family/subtool usage tables.

**Architecture:** Add a dedicated app telemetry query layer under `app/telemetry`, then build a new `/app` route that reuses existing auth and presentational components where they fit. Keep the existing web analytics dashboard unchanged and drive the new page entirely from `kaboomTelemetry`.

**Tech Stack:** React Router 7, TypeScript, Cloudflare Analytics Engine SQL API, existing card/table/chart UI components, Vitest

---

## File Structure

- Create: `packages/server/app/telemetry/query.ts`
  - App telemetry SQL queries and response shaping for KPI, trend, and family/subtool usage.
- Create: `packages/server/app/routes/app.tsx`
  - Authenticated app telemetry dashboard route and page UI.
- Create: `packages/server/app/routes/__tests__/app.test.tsx`
  - Route loader and UI behavior tests for `/app`.
- Create: `packages/server/app/telemetry/__tests__/query.test.ts`
  - Unit tests for telemetry aggregation and SQL result shaping.
- Modify: `packages/server/app/root.tsx`
  - Add navigation link to the new `/app` route.
- Reuse: `packages/server/app/components/TableCard.tsx`
- Reuse: `packages/server/app/routes/resources.timeseries.tsx`
- Reuse: `packages/server/app/routes/resources.stats.tsx`

## Chunk 1: Query Layer

### Task 1: Define app telemetry view models and query module

**Files:**
- Create: `packages/server/app/telemetry/query.ts`
- Test: `packages/server/app/telemetry/__tests__/query.test.ts`

- [ ] **Step 1: Write the failing query-shaping test for overview KPIs**

Test cases:
- unique installs comes from distinct `blob4`
- total events comes from metric rows `SUM(double2)`
- total sessions comes from distinct `(blob4, blob5)`

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @counterscale/server exec vitest run app/telemetry/__tests__/query.test.ts`
Expected: FAIL because query module does not exist yet

- [ ] **Step 3: Write the failing trend-shaping test**

Test cases:
- daily active installs groups by day
- activity counts distinct installs
- includes both `metric` and `lifecycle` activity rows

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @counterscale/server exec vitest run app/telemetry/__tests__/query.test.ts`
Expected: FAIL on missing implementation

- [ ] **Step 5: Write the failing family/subtool aggregation test**

Test cases:
- family rows aggregate `SUM(double2)` and `COUNT(DISTINCT blob4)`
- subtools are nested under the right family
- family rows sort by highest total usage first

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @counterscale/server exec vitest run app/telemetry/__tests__/query.test.ts`
Expected: FAIL on missing implementation

- [ ] **Step 7: Implement minimal query module**

Implement:
- a small app telemetry query client in `packages/server/app/telemetry/query.ts`
- focused methods:
  - `getAppTelemetryOverview(range)`
  - `getDailyActiveInstalls(range)`
  - `getToolFamilyUsage(range)`
- a shared date-range-to-SQL helper for app telemetry
- query response shaping into UI-ready objects

- [ ] **Step 8: Run query tests to verify they pass**

Run: `pnpm --filter @counterscale/server exec vitest run app/telemetry/__tests__/query.test.ts`
Expected: PASS

## Chunk 2: Route And Page

### Task 2: Add the authenticated `/app` route

**Files:**
- Create: `packages/server/app/routes/app.tsx`
- Modify: `packages/server/app/root.tsx`
- Test: `packages/server/app/routes/__tests__/app.test.tsx`

- [ ] **Step 1: Write the failing route-loader test**

Test cases:
- route requires auth
- route defaults to `"this month"` when range is absent
- route returns overview, trend, and family usage in one loader payload

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @counterscale/server exec vitest run app/routes/__tests__/app.test.tsx`
Expected: FAIL because route does not exist yet

- [ ] **Step 3: Write the failing UI-render test**

Test cases:
- KPI cards render values
- chart section renders
- family rows render
- subtools render when expanded

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @counterscale/server exec vitest run app/routes/__tests__/app.test.tsx`
Expected: FAIL on missing UI

- [ ] **Step 5: Implement minimal `/app` route**

Implement:
- auth guard using `requireAuth`
- date-range parsing with default `"this month"`
- parallel loader fetches for overview, trend, and family usage
- clear empty/error states

- [ ] **Step 6: Implement page UI**

Implement:
- date-range controls
- KPI cards
- daily active installs chart
- expandable family/subtool table
- link to `/app` in top nav

- [ ] **Step 7: Run route tests to verify they pass**

Run: `pnpm --filter @counterscale/server exec vitest run app/routes/__tests__/app.test.tsx`
Expected: PASS

## Chunk 3: Regression Verification

### Task 3: Verify the integrated dashboard

**Files:**
- Test: `packages/server/app/routes/__tests__/app.test.tsx`
- Test: `packages/server/app/telemetry/__tests__/query.test.ts`
- Verify: `packages/server/app/routes/dashboard.tsx`

- [ ] **Step 1: Run focused app telemetry tests**

Run: `pnpm --filter @counterscale/server exec vitest run app/telemetry/__tests__/query.test.ts app/routes/__tests__/app.test.tsx`
Expected: PASS

- [ ] **Step 2: Run adjacent dashboard regressions**

Run: `pnpm --filter @counterscale/server exec vitest run app/routes/__tests__/dashboard.test.tsx app/routes/__tests__/resources.timeseries.test.tsx app/routes/__tests__/resources.stats.test.tsx`
Expected: PASS

- [ ] **Step 3: Build the server**

Run: `pnpm --filter @counterscale/server build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/server/app/telemetry/query.ts \
  packages/server/app/telemetry/__tests__/query.test.ts \
  packages/server/app/routes/app.tsx \
  packages/server/app/routes/__tests__/app.test.tsx \
  packages/server/app/root.tsx
git commit -m "Add app telemetry dashboard"
```

