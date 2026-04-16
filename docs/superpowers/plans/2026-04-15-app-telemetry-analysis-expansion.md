# App Telemetry Analysis Expansion Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Kaboom telemetry analysis from aggregate usage into install-level behavior, workflow analysis, and behavioral clustering.

**Architecture:** Keep the current `usage_summary` ingest path for cheap aggregate reporting, then add richer event types and derived rollups so the product can support install drilldown, session analysis, co-usage, flow analysis, and segmentation without overloading the dashboard queries. Use the current `APP_TELEMETRY_AE` dataset for raw events and add derived materializations for expensive analysis.

**Tech Stack:** React Router 7, TypeScript, Cloudflare Analytics Engine, Cloudflare R2 for long-term derived exports, Vitest, existing `/app` dashboard

---

## File Structure

- Create: `docs/contracts/kaboom-app-telemetry-analysis-contract.md`
  - Additive telemetry contract for richer behavior analysis.
- Modify: `packages/server/app/telemetry/query.ts`
  - Add install-level, co-usage, and segment queries.
- Create: `packages/server/app/routes/app.installs.tsx`
  - Install table / index view.
- Create: `packages/server/app/routes/app.install.$installId.tsx`
  - Install-level detail page.
- Create: `packages/server/app/routes/app.segments.tsx`
  - Segment / cohort summary page.
- Create: `packages/server/app/routes/app.flows.tsx`
  - Session flow and co-usage analysis page.
- Create: `packages/server/app/telemetry/features.ts`
  - Derived per-install feature calculations.
- Create: `packages/server/app/telemetry/clustering.ts`
  - Cluster assignment logic or clustering job glue.
- Create: `packages/server/app/telemetry/__tests__/features.test.ts`
- Create: `packages/server/app/telemetry/__tests__/clustering.test.ts`

## Dependency Notes

- Phase 1 can ship with the existing dataset.
- Phase 2 is partially possible now, but gets materially better with explicit session start/end and per-tool event records.
- Phase 3 depends on derived per-install feature tables.
- Phase 4 can start with session-level co-usage from `usage_summary`, but richer pairings benefit from per-tool events.
- Phase 5 requires ordered event data; `usage_summary` alone is not enough.
- Phase 6 requires feature extraction, enough retained history, and probably R2-backed rollups because Analytics Engine raw retention is limited.

## Phase 1: Install Table

**Outcome:** A searchable install index that shows who exists in the telemetry set and how active each install is.

**Questions answered:**
- How many installs do we have?
- Which installs are active this week/month?
- Which installs are power users versus one-time evaluators?

**Primary metrics per install:**
- first seen
- last seen
- active days
- sessions
- total events
- top tool family
- current version / OS / channel when available

**Implementation notes:**
- Can be built from current rows using `install_id`, `session_id`, `event_name`, `version`, and `os`.
- Add filters for date range, version, OS, and activity band.
- Default sort should be `last_seen desc`.

## Phase 2: Install Detail Page

**Outcome:** A per-install drilldown page.

**Questions answered:**
- What did a specific install do?
- How often do they return?
- Which tools do they actually use?
- Did they activate once and disappear, or adopt the product?

**Views:**
- install summary card
- recent sessions table
- daily/weekly activity sparkline
- family and subtool usage
- recent event timeline
- optional screen/view timeline if available

**Implementation notes:**
- Current data supports summary + family/subtool usage + coarse session activity.
- Add `session_start`, `session_end`, and `tool_call` to make this page materially more useful.

## Phase 3: Segment View

**Outcome:** Deterministic behavioral segments before ML.

**Questions answered:**
- How many installs are new, casual, repeat, power, dormant?
- What behavior separates retained installs from evaluators?

**Initial rule-based segments:**
- `new`
- `casual`
- `repeat`
- `power`
- `dormant`
- `automation-heavy`
- `observe-heavy`
- `extension-heavy`

**Implementation notes:**
- Build a per-install feature table first.
- Segment rules should be transparent and editable.
- Show segment counts, example installs, and top distinguishing metrics.

## Phase 4: Co-Usage Matrix

**Outcome:** Understand which tools and subtools are used together.

**Questions answered:**
- Which tool families are commonly used by the same installs?
- Which specific subtools co-occur in the same session?
- Which combinations correlate with repeat usage?

**Views:**
- family-by-family heatmap
- subtool co-usage table
- “users of X also use Y” side panel

**Implementation notes:**
- Start with session-level co-usage from current session-grouped metric rows.
- Upgrade later to finer co-usage with `tool_call`.

## Phase 5: Session Flow Analysis

**Outcome:** Ordered workflow analysis instead of just totals.

**Questions answered:**
- What sequence of actions do people take in a session?
- What flows precede retention or drop-off?
- Which actions are typical session entry points and exit points?

**Views:**
- top transition pairs
- top 3-step flows
- session entry/exit distributions
- filter by family, version, channel, and segment

**Implementation notes:**
- This phase is blocked on ordered event capture.
- `usage_summary` does not preserve action order, so add `tool_call` with timestamps first.

## Phase 6: Feature Table and Clustering

**Outcome:** Data-driven behavioral clusters over time.

**Questions answered:**
- What latent behavior groups exist in the install base?
- Are there distinct adoption patterns or usage archetypes?
- Which clusters are growing, retained, or churning?

**Per-install features to compute:**
- active days in range
- sessions per active day
- average and median session duration
- usage share by family
- unique subtools used
- days between first and last use
- burstiness / recency
- time-of-day usage pattern
- share of extension-driven versus MCP-driven activity
- screen/view diversity if captured

**Implementation notes:**
- Start with rule-based segments, then layer clustering on top.
- Prefer simple, explainable clustering first: k-means or hierarchical clustering on normalized features.
- Persist daily feature snapshots to R2 so clustering is not trapped inside the 90-day AE raw retention window.

## Contract Rollout Order

1. Add the shared envelope to all beacons.
2. Add `session_start` and `session_end`.
3. Add `tool_call` and `first_tool_call`.
4. Add structured `usage_summary` and `app_error`.

This order keeps the current dashboards stable while unlocking deeper analysis incrementally.

## Recommended Query/Storage Strategy

- Keep raw event ingestion in `APP_TELEMETRY_AE`.
- Add derived daily install feature snapshots to R2 or another durable store.
- Use raw AE for near-real-time dashboards.
- Use derived snapshots for long-range trends, clustering, and retained historical analysis.

## Verification Expectations

- Add route tests for install, segment, and flow pages.
- Add deterministic tests for feature extraction and clustering assignments.
- Validate that current `/app` summary numbers remain stable after contract expansion.
- Verify no personally identifying data is introduced.
