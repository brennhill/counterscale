# Kaboom Telemetry Ingestion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /v1/event` so Kaboom can send telemetry beacons that Counterscale stores in a dedicated app telemetry dataset.

**Architecture:** Introduce a dedicated ingestion path and Analytics Engine binding for app telemetry. Normalize `usage_summary` into one summary row plus per-metric rows, and write lifecycle beacons as single rows. Keep the existing pageview pipeline unchanged.

**Tech Stack:** React Router, Cloudflare Workers, Workers Analytics Engine, Vitest, TypeScript

---

## Chunk 1: Route Contract

### Task 1: Lock the endpoint contract with tests

**Files:**
- Create: `packages/server/app/routes/__tests__/v1.event.test.tsx`
- Create: `packages/server/app/routes/v1.event.tsx`

- [ ] **Step 1: Write failing tests for `POST /v1/event`**
- [ ] **Step 2: Run the route test file and confirm failure**
- [ ] **Step 3: Implement the route action with request parsing and response shape**
- [ ] **Step 4: Re-run the route test file and confirm pass**

## Chunk 2: Ingestion and Storage

### Task 2: Normalize Kaboom beacons into analytics datapoints

**Files:**
- Create: `packages/server/app/telemetry/ingest.ts`
- Modify: `packages/server/worker-configuration.d.ts`
- Modify: `packages/server/wrangler.json`
- Test: `packages/server/app/routes/__tests__/v1.event.test.tsx`

- [ ] **Step 1: Write failing assertions for normalized usage summary writes**
- [ ] **Step 2: Run tests and confirm failure**
- [ ] **Step 3: Implement summary, metric, and lifecycle row writers**
- [ ] **Step 4: Re-run tests and confirm pass**

## Chunk 3: Verification and Deploy

### Task 3: Build, deploy, and verify live ingestion

**Files:**
- Modify: `packages/server/app/routes/admin-redirect.tsx`
- Modify: `packages/server/app/routes/v1.event.tsx`
- Modify: `packages/server/app/telemetry/ingest.ts`
- Modify: `packages/server/wrangler.json`

- [ ] **Step 1: Run the focused route tests**
- [ ] **Step 2: Run the server build**
- [ ] **Step 3: Deploy production Worker with the updated config**
- [ ] **Step 4: Send live sample lifecycle and usage summary beacons**
- [ ] **Step 5: Confirm the endpoint accepts and stores those beacons without error**
