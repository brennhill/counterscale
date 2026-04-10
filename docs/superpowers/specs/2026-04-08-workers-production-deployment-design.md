# Workers Production Deployment Design

> Deploy the existing Counterscale server package to Cloudflare Workers using the repo's supported `workers.dev` flow, with a clean production worker name and production auth enabled.

## Context

Counterscale is already implemented as a Cloudflare Worker backed by Workers Analytics Engine and R2. The checked-in installer and deploy code assume a Worker deployment and surface the deployed `*.workers.dev` URL after `wrangler deploy`.

The user needs a production URL that "makes sense" more than a custom domain specifically. That makes the supported `workers.dev` path the fastest way to get production live.

## Decision

Use a dedicated production Worker name, preferably `gokaboom-metrics`, and deploy to the account's Workers subdomain.

Expected public URL shape:

- `https://gokaboom-metrics.<workers-subdomain>.workers.dev/`
- `https://gokaboom-metrics.<workers-subdomain>.workers.dev/collect`
- `https://gokaboom-metrics.<workers-subdomain>.workers.dev/tracker.js`

## Alternatives Considered

### 1. Custom domain now

Use `t.gokaboom.dev` immediately by adding a Cloudflare custom domain or route.

Trade-offs:

- Cleaner public hostname
- Requires extra Cloudflare domain setup not automated by the repo today
- Slower path to production

### 2. Default checked-in worker name

Deploy as `counterscale`.

Trade-offs:

- Zero naming decisions
- Generic hostname
- More likely to collide with other deployments or be harder to identify later

### 3. Named workers.dev deployment

Deploy as `gokaboom-metrics`.

Trade-offs:

- Uses the repo's supported deployment path
- Predictable production hostname
- Can be moved behind a custom domain later if wanted

This is the recommended option.

## Architecture

No application architecture changes are required. Deployment is operational:

- build the existing `@counterscale/server` package
- use Wrangler to deploy the Worker
- provision or reuse the configured Analytics Engine dataset and R2 bucket bindings
- set required secrets for dashboard auth and Cloudflare account access

## Required Runtime Inputs

- Cloudflare account authenticated in Wrangler
- Workers subdomain already enabled on the target account
- Analytics Engine enabled on the target account
- Worker secrets:
  - `CF_ACCOUNT_ID`
  - `CF_BEARER_TOKEN`
  - `CF_AUTH_ENABLED`
  - `CF_PASSWORD_HASH`
  - `CF_JWT_SECRET`
- Optional:
  - `CF_TRACKER_SCRIPT_NAME`
  - `CF_STORAGE_ENABLED`

## Verification

Production verification must confirm:

1. the Worker deploy succeeds and emits a public URL
2. `GET /` returns the dashboard/login page
3. `GET /tracker.js` returns the tracker asset
4. the tracker can post to `/collect`
5. dashboard auth is enabled for production

## Follow-Up

If the `workers.dev` hostname is acceptable after production launch, keep it.

If not, add a manual Cloudflare custom-domain mapping later without changing the app's public route structure.
