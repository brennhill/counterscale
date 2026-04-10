# Workers Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the existing Counterscale Worker to production on a clean `workers.dev` hostname and verify the public dashboard, tracker, and collection endpoints.

**Architecture:** Reuse the existing Cloudflare Worker deployment path already implemented in `packages/server` and the CLI. Keep runtime behavior unchanged, choose a production worker name, configure required secrets, deploy with Wrangler, and verify the emitted public URL.

**Tech Stack:** Cloudflare Workers, Wrangler, Workers Analytics Engine, R2, React Router, pnpm

---

## Chunk 1: Preflight and Naming

### Task 1: Confirm local deployment prerequisites

**Files:**
- Reference: `README.md`
- Reference: `packages/server/wrangler.json`
- Reference: `packages/cli/src/commands/install.ts`

- [ ] **Step 1: Confirm Node and pnpm are available**

Run: `node -v`
Expected: Node 20 or newer

- [ ] **Step 2: Confirm pnpm dependencies are present or install them if missing**

Run: `pnpm install`
Expected: workspace dependencies installed successfully

- [ ] **Step 3: Confirm Wrangler authentication state**

Run: `npx wrangler whoami`
Expected: authenticated Cloudflare account details or a clear auth error

- [ ] **Step 4: Choose the production worker name**

Set worker name to `gokaboom-metrics` unless Cloudflare naming conflicts require a close variant.

## Chunk 2: Production Deploy

### Task 2: Build and deploy the Worker

**Files:**
- Reference: `packages/server/package.json`
- Reference: `packages/server/wrangler.json`

- [ ] **Step 1: Build the server package**

Run: `pnpm --filter @counterscale/server build`
Expected: Worker client/server build artifacts created successfully

- [ ] **Step 2: Ensure tracker asset is available if the build expects it**

Run: `pnpm --filter @counterscale/server copytracker`
Expected: `packages/server/public/tracker.js` present

- [ ] **Step 3: Stage deployment config or use advanced installer flow**

Preferred run path:
`pnpm --filter @counterscale/cli exec tsx src/index.ts install --advanced --verbose`

Expected inputs:
- target Cloudflare account
- worker name `gokaboom-metrics`
- analytics dataset name
- API token
- dashboard password protection enabled

- [ ] **Step 4: Deploy with Wrangler**

If the installer deploys successfully, capture the emitted URL.

Fallback run:
`pnpm --filter @counterscale/server deploy`

Expected: a live `https://<worker-name>.<workers-subdomain>.workers.dev` URL

## Chunk 3: Verification

### Task 3: Verify public production endpoints

**Files:**
- Reference: `packages/server/app/routes/collect.tsx`
- Reference: `packages/server/app/routes/$script.ts`

- [ ] **Step 1: Verify the dashboard origin responds**

Run: `curl -I https://<deployed-url>/`
Expected: HTTP 200 or auth redirect/login response

- [ ] **Step 2: Verify the tracker script is publicly served**

Run: `curl -I https://<deployed-url>/tracker.js`
Expected: HTTP 200 with JavaScript content type

- [ ] **Step 3: Verify the collect endpoint is reachable**

Run: `curl -i 'https://<deployed-url>/collect?site=test&path=/health'`
Expected: non-5xx response from the collection handler

- [ ] **Step 4: Record the production URLs**

Record:
- dashboard URL
- tracker script URL
- collect URL

## Chunk 4: Closeout

### Task 4: Summarize deployment outcome

**Files:**
- Create: `docs/superpowers/specs/2026-04-08-workers-production-deployment-design.md`
- Create: `docs/superpowers/plans/2026-04-08-workers-production-deployment.md`

- [ ] **Step 1: Summarize final production hostname and auth posture**

Expected: one clear production URL and whether password auth is enabled

- [ ] **Step 2: Note any manual follow-up**

Expected: custom domain setup is optional, not required for production
