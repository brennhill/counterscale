# Kaboom Surface Restyle Design

Date: 2026-04-15

## Goal

Restyle the authenticated Counterscale surface to match the visual language of `~/dev/gasoline/gokaboom.dev` while preserving the current product behavior.

The restyle applies to:

- `/`
- `/dashboard`
- `/app`

The restyle does not change telemetry queries, auth flow semantics, or dashboard information architecture.

## Source Style System

The source of truth for the visual language is `~/dev/gasoline/gokaboom.dev`, specifically:

- warm paper background
- dark ink foreground
- orange/red accent palette
- Space Grotesk display typography
- DM Sans body typography
- IBM Plex Mono for technical labels
- rounded surfaces and pill controls
- subtle dotted paper texture

## Approach

### Recommended approach

Port the Kaboom design tokens into the app theme layer, then adapt the existing route layouts so the product feels branded without rebuilding the UI from scratch.

This means:

- update shared CSS tokens in `packages/server/app/globals.css`
- restyle existing shared primitives through theme variables where possible
- add page-level layout classes only where the current structure needs stronger visual framing

### Rejected alternatives

#### Route-only local styling

Too fragile. It would leave the shared UI primitives visually inconsistent.

#### Full component rewrite

Too much risk and churn for a brand restyle. The current product structure is already acceptable.

## Page Design

### `/`

The landing/auth page becomes a branded Kaboom entry surface:

- warm textured background
- stronger headline hierarchy
- centered auth card with rounded corners and heavier border treatment
- clearer distinction between authenticated continue state and password entry state
- pill-style primary CTA

This page should feel like a product entry screen, not a default admin login.

### `/dashboard`

The existing web analytics dashboard keeps its information hierarchy but adopts the Kaboom visual shell:

- branded top navigation and footer
- improved whitespace and grouping around filter controls
- restyled cards, selects, and content blocks
- better cohesion between stats, charts, and tables

No structural analytics rewrite is included in this restyle.

### `/app`

The app telemetry dashboard keeps the recently added interactions and data layout:

- family filters
- selectable subtools
- selected-subtool summary card
- KPI cards and trend chart

The visual treatment should align it with Kaboom:

- same page shell and spacing as `/dashboard`
- same card and control styling
- same branded palette and typography

## Shared Styling

The following should be introduced into the app theme:

- Kaboom font stack
- paper-toned backgrounds
- ink-based typography colors
- orange/red accent colors
- rounded card/button/input radii
- dotted background texture
- softer but still visible borders

The theme should remain readable and operational on desktop and mobile.

## Implementation Plan Shape

### Shared theme

- update `packages/server/app/globals.css`
- preserve Tailwind token usage by remapping the app variables to Kaboom-like values

### Shell changes

- update `packages/server/app/root.tsx` for header/footer treatment

### Route changes

- update `packages/server/app/routes/_index.tsx`
- update `packages/server/app/routes/dashboard.tsx`
- update `packages/server/app/routes/app.tsx`

### Validation

- update affected route tests for structural or copy changes
- run focused server tests
- run build
- deploy to Cloudflare after verification

## Non-Goals

- no telemetry schema changes
- no new dashboard features
- no migration of the public marketing site into this app
- no exact one-to-one Astro component reproduction
- no dark theme carryover in this pass unless required later

## Risks

### Shared primitive drift

If the theme layer is too aggressive, it can unintentionally affect lower-level UI components. Mitigation: keep changes constrained to the authenticated surface variables and validate the key routes directly.

### Layout regressions

The existing dashboards are dense. Heavier visual framing can reduce readability if spacing is overdone. Mitigation: preserve current content order and keep typography compact in data-heavy regions.

### Mobile overflow

Pill filters and dashboard controls can wrap poorly. Mitigation: verify flex wrapping and avoid fixed widths where possible.

## Success Criteria

- `/`, `/dashboard`, and `/app` clearly look like Kaboom-branded surfaces
- current auth and analytics behavior remains unchanged
- route tests and build pass
- production deploy on Cloudflare serves the updated branded UI
