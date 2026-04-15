# Kaboom Surface Restyle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the authenticated Counterscale surface to match the Kaboom brand language across `/`, `/dashboard`, and `/app`, then deploy the updated UI to Cloudflare.

**Architecture:** Port the Kaboom token system into the app-wide theme layer so shared primitives inherit the new look, then adjust the root shell and route layouts to use that branded surface without changing analytics behavior. Keep all data flows intact and use route-level tests to lock down the revised visible structure.

**Tech Stack:** React Router, Tailwind CSS utility classes, existing shadcn-style UI primitives, Vitest, Cloudflare Workers/Wrangler

---

## Chunk 1: Theme and Shell

### Task 1: Document and verify the current shell routes

**Files:**
- Modify: `packages/server/app/__tests__/root.test.tsx`

- [ ] **Step 1: Write failing test for branded shell text**

Add an assertion that the root layout renders Kaboom-branded navigation text rather than the old Counterscale heading.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @counterscale/server exec vitest run app/__tests__/root.test.tsx`
Expected: FAIL because the current shell still renders Counterscale branding.

- [ ] **Step 3: Write minimal shell implementation**

Update `packages/server/app/root.tsx` to use the Kaboom brand labels, navigation framing, and footer treatment required by the spec.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @counterscale/server exec vitest run app/__tests__/root.test.tsx`
Expected: PASS

### Task 2: Port shared Kaboom design tokens

**Files:**
- Modify: `packages/server/app/globals.css`
- Modify: `packages/server/app/components/ui/card.tsx`
- Modify: `packages/server/app/components/ui/button.tsx`
- Modify: `packages/server/app/components/ui/select.tsx`

- [ ] **Step 1: Write failing route test for visible branded shell class/text behavior**

Use the route tests from Task 1 as the visible signal and confirm they fail before global style changes.

- [ ] **Step 2: Implement shared token/theme changes**

Port the Kaboom palette, fonts, background texture, and radius values into `globals.css`, then tighten the shared primitives so cards and controls inherit the new surface style cleanly.

- [ ] **Step 3: Run root test again**

Run: `pnpm --filter @counterscale/server exec vitest run app/__tests__/root.test.tsx`
Expected: PASS

## Chunk 2: Entry Route

### Task 3: Restyle `/` with TDD

**Files:**
- Modify: `packages/server/app/routes/_index.tsx`
- Modify: `packages/server/app/routes/__tests__/_index.test.tsx`

- [ ] **Step 1: Write failing test for Kaboom-branded login content**

Add assertions for Kaboom-branded copy and the revised continue/sign-in surface.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @counterscale/server exec vitest run app/routes/__tests__/_index.test.tsx`
Expected: FAIL because the route still renders the old Counterscale welcome copy.

- [ ] **Step 3: Write minimal implementation**

Restyle `packages/server/app/routes/_index.tsx` into the branded entry page while preserving auth behavior and button targets.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @counterscale/server exec vitest run app/routes/__tests__/_index.test.tsx`
Expected: PASS

## Chunk 3: Dashboard Surfaces

### Task 4: Restyle `/dashboard` without changing analytics behavior

**Files:**
- Modify: `packages/server/app/routes/dashboard.tsx`
- Modify: `packages/server/app/routes/__tests__/dashboard.test.tsx`

- [ ] **Step 1: Write failing test for branded dashboard framing**

Add an assertion for the updated dashboard heading/filter framing that reflects the new brand surface.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @counterscale/server exec vitest run app/routes/__tests__/dashboard.test.tsx`
Expected: FAIL because the old dashboard framing is still present.

- [ ] **Step 3: Write minimal implementation**

Update `packages/server/app/routes/dashboard.tsx` to use the branded workspace header and tighter layout treatment while keeping all cards and query parameters intact.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @counterscale/server exec vitest run app/routes/__tests__/dashboard.test.tsx`
Expected: PASS

### Task 5: Restyle `/app` without changing telemetry behavior

**Files:**
- Modify: `packages/server/app/routes/app.tsx`
- Modify: `packages/server/app/routes/__tests__/app.test.tsx`

- [ ] **Step 1: Write failing test for branded telemetry framing**

Add assertions for the updated telemetry header copy/surface that reflect the Kaboom visual system.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @counterscale/server exec vitest run app/routes/__tests__/app.test.tsx`
Expected: FAIL because the route still uses the previous framing.

- [ ] **Step 3: Write minimal implementation**

Adjust `packages/server/app/routes/app.tsx` so the KPI cards, filters, and tool usage sections sit inside the branded page shell without changing loader data or interaction behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @counterscale/server exec vitest run app/routes/__tests__/app.test.tsx`
Expected: PASS

## Chunk 4: Verification and Deployment

### Task 6: Run focused verification

**Files:**
- Test: `packages/server/app/__tests__/root.test.tsx`
- Test: `packages/server/app/routes/__tests__/_index.test.tsx`
- Test: `packages/server/app/routes/__tests__/dashboard.test.tsx`
- Test: `packages/server/app/routes/__tests__/app.test.tsx`
- Test: `packages/server/app/routes/__tests__/resources.timeseries.test.tsx`
- Test: `packages/server/app/routes/__tests__/resources.stats.test.tsx`

- [ ] **Step 1: Run focused test suite**

Run: `pnpm --filter @counterscale/server exec vitest run app/__tests__/root.test.tsx app/routes/__tests__/_index.test.tsx app/routes/__tests__/dashboard.test.tsx app/routes/__tests__/app.test.tsx app/routes/__tests__/resources.timeseries.test.tsx app/routes/__tests__/resources.stats.test.tsx`
Expected: PASS

- [ ] **Step 2: Run production build**

Run: `pnpm --filter @counterscale/server build`
Expected: PASS

### Task 7: Commit, push, and deploy

**Files:**
- Modify: verified implementation files above

- [ ] **Step 1: Commit**

Run:
```bash
git add packages/server/app/globals.css \
  packages/server/app/root.tsx \
  packages/server/app/components/ui/card.tsx \
  packages/server/app/components/ui/button.tsx \
  packages/server/app/components/ui/select.tsx \
  packages/server/app/routes/_index.tsx \
  packages/server/app/routes/dashboard.tsx \
  packages/server/app/routes/app.tsx \
  packages/server/app/__tests__/root.test.tsx \
  packages/server/app/routes/__tests__/_index.test.tsx \
  packages/server/app/routes/__tests__/dashboard.test.tsx \
  packages/server/app/routes/__tests__/app.test.tsx
git commit -m "Restyle dashboards to match Kaboom branding"
```

- [ ] **Step 2: Push**

Run: `git push kaboom main`
Expected: remote updates successfully

- [ ] **Step 3: Deploy**

Run: `pnpm --filter @counterscale/server exec wrangler deploy --config /tmp/gokaboom-metrics.wrangler.json --var VERSION:<git-sha>`
Expected: Worker deploy succeeds

- [ ] **Step 4: Verify live**

Check the authenticated pages on `https://t.gokaboom.dev/`, `https://t.gokaboom.dev/dashboard`, and `https://t.gokaboom.dev/app`
Expected: branded Kaboom surface is live
