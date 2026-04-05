# Custom Events for Counterscale

> Add named custom event tracking to Counterscale for websites, CLI tools, plugins, and other applications, while keeping pageview analytics separate.

## Problem

Counterscale currently centers on pageviews. That works for websites, but it does not cover the kinds of telemetry needed for developer tools and applications, such as:

- plugin installs
- CLI command usage
- feature usage
- version distribution

We want Counterscale to handle those events through the existing `/collect` endpoint and Analytics Engine dataset, without introducing cookies, consent banners, or new Cloudflare resources.

## Goals

1. Track custom events through the existing `/collect` endpoint.
2. Keep event analytics separate from pageview analytics in the dashboard.
3. Support named event properties instead of positional `prop1`/`prop2` APIs.
4. Allow different event types to use different property names.
5. Support both browser and server-side tracking.
6. Preserve existing core pageview metrics and collection behavior.

## Non-Goals

- Event funnels
- Cohort analysis
- Event-to-pageview correlation
- Cross-event global property schemas
- Numeric aggregations beyond counts and trends
- More than 3 named properties per event in v1

## Product Decisions

### Events Are Separate From Pageviews

Events are for application telemetry. They should not appear in pageview counts, visitor counts, bounce rate, or pageview dimension tables.

The dashboard should therefore have:

- the existing pageview analytics section
- a separate events section

### Named Properties Are Event-Scoped

Properties do not need to be common across event types.

Examples:

```typescript
trackEvent("plugin_install", {
    version: "0.1.2",
    project_id: "abc123",
});

trackEvent("skill_used", {
    skill_name: "feature",
    version: "0.1.2",
});
```

This is valid. `plugin_install` and `skill_used` do not need to share the same property names.

### One Row Represents One Event Occurrence

Do not model one logical event by firing multiple `trackEvent()` calls.

Bad:

```typescript
trackEvent("plugin_install", { version: "0.1.2" });
trackEvent("plugin_install", { project_id: "abc123" });
```

That records two installs, not one install with two properties.

## Constraints

Cloudflare Analytics Engine gives Counterscale 20 blob columns and 20 double columns.

Current logical blob usage in Counterscale:

- `blob1`: `host`
- `blob2`: `userAgent`
- `blob3`: `path`
- `blob4`: `country`
- `blob5`: `referrer`
- `blob6`: `browserName`
- `blob7`: `deviceModel`
- `blob8`: `siteId`
- `blob9`: `browserVersion`
- `blob10`: `deviceType`
- `blob11`: `utmSource`
- `blob12`: `utmMedium`
- `blob13`: `utmCampaign`
- `blob14`: `utmTerm`
- `blob15`: `utmContent`

Current logical double usage:

- `double1`: `newVisitor`
- `double2`: `newSession` (dead column today)
- `double3`: `bounce`

Important product choice for this feature:

- `browserVersion` is removed as a pageview analytics dimension and `blob9` is reclaimed
- `deviceModel` stays as-is for pageview rows, but `blob7` is reused on event rows
- `double2` is repurposed from dead `newSession` to `isEvent`

This gives v1 enough room for named event properties without needing a new dataset.

## Data Model

### Event Row Semantics

Event rows and pageview rows share the same dataset but interpret some columns differently.

| Physical Column | Pageview Row Meaning | Event Row Meaning |
|----------------|----------------------|-------------------|
| `blob7` | `deviceModel` | `eventPropKey3` |
| `blob9` | unused in v1 | `eventPropValue3` |
| `blob16` | unused | `eventName` |
| `blob17` | unused | `eventPropKey1` |
| `blob18` | unused | `eventPropValue1` |
| `blob19` | unused | `eventPropKey2` |
| `blob20` | unused | `eventPropValue2` |
| `double2` | `0` | `1` (`isEvent`) |

Pageview rows continue using the existing columns for host, path, site, referrer, browser, country, device type, and UTM data.

### New Logical Schema

Update `packages/server/app/analytics/schema.ts` to add logical names for event storage:

```typescript
eventName: "blob16",
eventPropKey1: "blob17",
eventPropValue1: "blob18",
eventPropKey2: "blob19",
eventPropValue2: "blob20",
eventPropKey3: "blob7",
eventPropValue3: "blob9",
isEvent: "double2",
```

Also remove `browserVersion` from the active logical schema and remove the old `newSession` meaning from `double2`.

### Event Property Budget

V1 supports up to 3 named properties per event.

That means this is valid:

```typescript
trackEvent("skill_used", {
    skill_name: "feature",
    version: "0.1.2",
    project_id: "abc123",
});
```

This is not valid in v1:

```typescript
trackEvent("skill_used", {
    skill_name: "feature",
    version: "0.1.2",
    project_id: "abc123",
    agent: "codex",
});
```

## Tracker API

### Public API Shape

Both browser and server trackers expose:

```typescript
trackEvent(
    eventName: string,
    properties?: Record<
        string,
        string | number | boolean | null | undefined
    >,
): Promise<void> | void;
```

Requirements:

- `eventName` must be a non-empty string
- property names are preserved as provided
- values may be `string`, `number`, or `boolean`
- `null` and `undefined` values are ignored
- arrays and nested objects are rejected in v1
- at most 3 valid properties may be sent

Overflow behavior:

- browser tracker: `console.warn()` and skip sending the event
- server tracker: throw an error

Reason: silent truncation makes telemetry hard to trust.

### Example Usage

Browser:

```typescript
import * as Counterscale from "@counterscale/tracker";

Counterscale.trackEvent("cta_click", {
    button: "install",
    section: "hero",
});
```

Server:

```typescript
import { init, trackEvent } from "@counterscale/tracker/server";

init({
    siteId: "upfront-plugin",
    reporterUrl: "https://analytics.example.dev/collect",
});

await trackEvent("plugin_install", {
    version: "0.1.2",
    project_id: "abc123",
});
```

## Collect Endpoint Contract

### Event Query Parameters

Events use key/value query params instead of positional `prop1`/`prop2` params.

| Param | Meaning | Required |
|-------|---------|----------|
| `e` | event name | yes |
| `k1` | property key 1 | no |
| `v1` | property value 1 | no |
| `k2` | property key 2 | no |
| `v2` | property value 2 | no |
| `k3` | property key 3 | no |
| `v3` | property value 3 | no |

Example:

```text
/collect?sid=upfront-plugin&e=skill_used&k1=skill_name&v1=feature&k2=version&v2=0.1.2&k3=project_id&v3=abc123
```

### `collectRequestHandler()` Behavior

If `e` is present:

- treat the row as a custom event
- set `isEvent = 1`
- write `eventName`
- write up to 3 event key/value pairs
- skip cache/session/bounce logic entirely
- do not derive `newVisitor` or `bounce` for the event row
- still write contextual fields when available:
  - `siteId`
  - `host`
  - `path`
  - `country`
  - `referrer`
  - `userAgent`
  - `browserName`
  - `deviceType`
  - UTM fields

If `e` is absent:

- treat the row as a normal pageview
- set `isEvent = 0`
- keep existing pageview collection behavior

The response contract of `/collect` stays unchanged.

## Query Layer

### Pageview Queries Must Exclude Events

All existing pageview-oriented queries must explicitly filter to pageview rows:

```sql
AND double2 != 1
```

or equivalent.

This applies to:

- total counts
- time series
- path tables
- referrer tables
- browser tables
- country tables
- device tables
- UTM tables
- earliest-event logic used to determine whether bounce data is trustworthy

Without this, event traffic would inflate pageview metrics.

### Site Dropdown Behavior

`getSitesOrderedByHits()` should continue counting both pageviews and events.

Reason: some projects may emit only custom events and should still appear in the site picker.

### New Event Queries

Add event-specific query helpers in `packages/server/app/analytics/query.ts`:

#### `getEventCounts(siteId, interval, tz)`

Returns:

- `eventName`
- event occurrence count

#### `getEventCountsOverTime(siteId, interval, tz, eventName?)`

Returns time buckets for event counts.

Use cases:

- overall event activity
- trend for a selected event

#### `getEventPropertyKeys(siteId, interval, tz, eventName)`

Returns the distinct property names used by a selected event.

Implementation detail:

- read all 3 key columns
- merge and dedupe in application code

#### `getEventPropertyBreakdown(siteId, interval, tz, eventName, propertyKey)`

Returns value counts for a selected property name on a selected event.

Implementation detail:

- search across all 3 key/value slot pairs
- merge matching rows in application code

This is required because the same logical property name may land in different slots on different rows.

## Dashboard

### Pageview Section

The existing pageview section remains the main dashboard entry point for web analytics.

Changes:

- pageview metrics explicitly exclude event rows
- the browser-version drilldown is removed in v1

### Events Section

Add a separate Events section below the pageview analytics cards.

#### Events List

Add an `Events` card that shows:

- `Event`
- `Count`

Clicking an event selects it.

#### Selected Event Detail

When an event is selected, show:

- occurrence count
- event trend chart
- one property breakdown card per discovered property key

Property breakdown cards must use the real property names as labels, for example:

- `version`
- `skill_name`
- `project_id`

Not:

- `prop1`
- `prop2`
- `prop3`

#### Dashboard State

Use a dedicated query param for selected event state, for example:

```text
?site=upfront-plugin&interval=7d&event=skill_used
```

Do not merge event selection into the existing generic pageview `SearchFilters`.

The event selection UI should be separate from pageview filter badges.

## Implementation Notes

### Browser Version Removal

The browser-version drilldown is intentionally removed to reclaim storage for events.

This means:

- remove browser-version dashboard surface
- remove browser-version query helpers
- stop relying on `browserVersion` as an active pageview dimension

Core pageview analytics remain intact:

- visitors
- views
- bounce rate
- path/referrer/browser/device/country/UTM breakdowns

### Property Value Types

In v1, property values are stored as strings.

That means:

- numbers are stringified
- booleans are stringified
- dashboard breakdowns are count-based

This is acceptable because numeric aggregations are explicitly out of scope for v1.

## Testing Requirements

### Tracker Tests

Add tests for:

- valid event encoding into `e`, `k1`, `v1`, etc.
- invalid empty event names
- rejection of nested objects and arrays
- ignored `null` and `undefined` values
- overflow behavior when more than 3 properties are provided

### Collect Tests

Add tests for:

- event rows setting `isEvent = 1`
- event rows skipping cache/bounce logic
- event properties landing in the expected columns
- pageview rows keeping current behavior

### Query Tests

Add tests for:

- pageview queries excluding event rows
- event count queries returning correct totals
- property-key discovery across all 3 key slots
- property-value breakdown across all 3 key/value pairs
- earliest-pageview logic remaining correct when old event rows exist

### Dashboard Tests

Add tests for:

- events rendering separately from pageviews
- selecting an event loading event detail
- property cards using real property names
- pageview cards remaining unaffected by event-only traffic

## Files to Change

| File | Change |
|------|--------|
| `packages/server/app/analytics/schema.ts` | Add event mappings, remove `newSession`, remove `browserVersion` from active schema |
| `packages/server/app/analytics/collect.ts` | Add event ingestion path, reuse `double2` as `isEvent`, reuse event key/value columns, skip bounce/session logic for events |
| `packages/server/app/analytics/query.ts` | Exclude events from pageview queries, add event queries, remove browser-version query surface |
| `packages/server/app/lib/types.ts` | Remove `browserVersion` from pageview filter model, optionally add dedicated event selection types |
| `packages/tracker/src/shared/types.ts` | Add event request param support |
| `packages/tracker/src/shared/request.ts` | Add event request builder support |
| `packages/tracker/src/lib/track.ts` | Add browser `trackEvent()` |
| `packages/tracker/src/server/track.ts` | Add server `trackEvent()` |
| `packages/tracker/src/index.ts` | Export browser `trackEvent()` |
| `packages/tracker/src/server/index.ts` | Export server `trackEvent()` |
| `packages/server/app/routes/dashboard.tsx` | Add separate Events section and event selection state |
| `packages/server/app/routes/resources.events.tsx` | New event counts resource |
| `packages/server/app/routes/resources.event-detail.tsx` | New selected-event detail resource |
| `packages/server/app/routes/resources.browserversion.tsx` | Remove |

## Migration

No dataset migration is required.

Reasons:

- the same Analytics Engine dataset is reused
- old rows remain valid
- pageview rows simply have `isEvent = 0`
- event rows use the new interpretation of reclaimed columns

The only intentional product-level change is that browser-version reporting is removed to make room for event analytics.
