# Cloudflare Workers Production Setup

This repo is deployed as a Cloudflare Worker.

Current production service:

- Worker: `gokaboom-metrics`
- Primary ingest URL: `https://t.gokaboom.dev/v1/event`
- Fallback workers.dev URL: `https://gokaboom-metrics.brennhill.workers.dev/v1/event`
- Cloudflare account id: `3366cf24ce29f1d6380754d51efab0cf`
- Zone: `gokaboom.dev`

## Why `t.gokaboom.dev`

`*.workers.dev` hostnames are shaped like:

`https://<worker-name>.<account-subdomain>.workers.dev`

That means the account-level subdomain appears in the URL. In this account it is `brennhill`, so the branded production hostname should be a custom domain under `gokaboom.dev`.

## Prerequisites

- `pnpm`
- `wrangler`
- `CLOUDFLARE_API_TOKEN` exported in your shell
- Cloudflare zone `gokaboom.dev` active in the same account as the Worker

Recommended token scopes:

- Workers Scripts: Edit
- Workers Routes / Domains: Edit
- Analytics Engine: Edit
- R2: Edit
- Zone: Read
- DNS: Edit

## 1. Install And Build

From the repo root:

```bash
pnpm install --frozen-lockfile --prefer-offline
pnpm --filter @counterscale/tracker build
pnpm --filter @counterscale/server copytracker
pnpm --filter @counterscale/server build
```

## 2. Create Cloudflare Resources

Create the R2 buckets:

```bash
pnpm --filter @counterscale/server exec wrangler r2 bucket create gokaboom-metrics-daily-rollups
pnpm --filter @counterscale/server exec wrangler r2 bucket create gokaboom-metrics-daily-rollups-dev
```

Create or enable the Analytics Engine datasets in the Cloudflare dashboard:

- `metricsDataset`
- `kaboomTelemetry`

The Worker uses these bindings:

- `WEB_COUNTER_AE -> metricsDataset`
- `APP_TELEMETRY_AE -> kaboomTelemetry`
- `DAILY_ROLLUPS -> gokaboom-metrics-daily-rollups`

## 3. Prepare A Production Wrangler Config

The checked-in [`wrangler.json`](/Users/brenn/dev/counterscale/packages/server/wrangler.json) stays generic. For this deployment, generate a production-specific config in `/tmp`.

```bash
cat >/tmp/gokaboom-metrics.wrangler.json <<'JSON'
{
  "main": "/Users/brenn/dev/counterscale/packages/server/workers/app.ts",
  "name": "gokaboom-metrics",
  "compatibility_flags": ["nodejs_compat_v2"],
  "compatibility_date": "2024-12-13",
  "assets": {
    "binding": "ASSETS",
    "directory": "/Users/brenn/dev/counterscale/packages/server/build/client"
  },
  "analytics_engine_datasets": [
    {
      "binding": "WEB_COUNTER_AE",
      "dataset": "metricsDataset"
    },
    {
      "binding": "APP_TELEMETRY_AE",
      "dataset": "kaboomTelemetry"
    }
  ],
  "r2_buckets": [
    {
      "bucket_name": "gokaboom-metrics-daily-rollups",
      "preview_bucket_name": "gokaboom-metrics-daily-rollups-dev",
      "binding": "DAILY_ROLLUPS"
    }
  ],
  "triggers": {
    "crons": ["0 2 * * *"]
  }
}
JSON
```

Absolute paths matter here. A `/tmp` config with relative paths will fail because Wrangler resolves them from the config location.

## 4. Upload Secrets

Prepare a temporary secrets file:

```bash
cat >/tmp/gokaboom-metrics.secrets.json <<'JSON'
{
  "CF_ACCOUNT_ID": "3366cf24ce29f1d6380754d51efab0cf",
  "CF_BEARER_TOKEN": "YOUR_CLOUDFLARE_API_TOKEN",
  "CF_AUTH_ENABLED": "true",
  "CF_PASSWORD_HASH": "YOUR_BCRYPT_HASH",
  "CF_JWT_SECRET": "YOUR_RANDOM_SECRET",
  "WORKER_NAME": "gokaboom-metrics"
}
JSON
```

Upload them:

```bash
pnpm --filter @counterscale/server exec wrangler secret bulk /tmp/gokaboom-metrics.secrets.json --config /tmp/gokaboom-metrics.wrangler.json
```

Useful helpers:

Generate a JWT secret:

```bash
openssl rand -hex 32
```

Generate a bcrypt password hash:

```bash
node -e 'const bcrypt=require("bcryptjs"); bcrypt.hash(process.argv[1], 12).then(v => console.log(v))' 'your-dashboard-password'
```

## 5. Deploy

Deploy the Worker with the current git SHA as `VERSION`:

```bash
pnpm --filter @counterscale/server exec wrangler deploy --config /tmp/gokaboom-metrics.wrangler.json --var VERSION:$(git rev-parse HEAD)
```

## 6. Attach The Branded Domain

Do not depend on the account-level `workers.dev` subdomain for branding. Attach a custom domain instead:

```bash
curl -sS "https://api.cloudflare.com/client/v4/accounts/3366cf24ce29f1d6380754d51efab0cf/workers/domains" \
  -X PUT \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --data '{
    "hostname": "t.gokaboom.dev",
    "service": "gokaboom-metrics",
    "environment": "production",
    "zone_id": "ff35cb21c4308b2f0f6289a8dce6223f",
    "zone_name": "gokaboom.dev"
  }'
```

This lets Cloudflare manage the DNS and certificate for the Worker hostname.

## 7. Verify

Check the root:

```bash
curl -i https://t.gokaboom.dev/
```

Send a lifecycle beacon:

```bash
curl -i -X POST https://t.gokaboom.dev/v1/event \
  -H 'content-type: application/json' \
  --data '{"event":"daemon_start","v":"0.8.1","os":"darwin-arm64","iid":"a1b2c3d4e5f6","sid":"8f3c1e4b7d92a6ff"}'
```

Send a usage summary beacon:

```bash
curl -i -X POST https://t.gokaboom.dev/v1/event \
  -H 'content-type: application/json' \
  --data '{"event":"usage_summary","v":"0.8.1","os":"darwin-arm64","iid":"a1b2c3d4e5f6","sid":"8f3c1e4b7d92a6ff","window_m":5,"props":{"observe:errors":5,"interact:click":2,"ext:video":1}}'
```

Expected result for both POST requests: `202 Accepted`

## 8. Verify Stored Telemetry

Cloudflare Analytics Engine SQL endpoint:

```bash
curl -sS "https://api.cloudflare.com/client/v4/accounts/3366cf24ce29f1d6380754d51efab0cf/analytics_engine/sql" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: text/plain" \
  --data "SELECT blob4 AS install_id, blob2 AS row_type, blob3 AS event_name, blob8 AS metric_key, blob12 AS beacon_id, double1 AS window_m, double2 AS metric_count, double3 AS row_count FROM kaboomTelemetry WHERE blob4 = 'a1b2c3d4e5f6' LIMIT 20"
```

Blob layout in `kaboomTelemetry`:

- `blob1`: app id
- `blob2`: row type
- `blob3`: event name
- `blob4`: install id
- `blob5`: session id
- `blob6`: app version
- `blob7`: os
- `blob8`: metric key
- `blob9`: metric source
- `blob10`: metric family
- `blob11`: metric name
- `blob12`: beacon id

Doubles:

- `double1`: `window_m`
- `double2`: metric count
- `double3`: row count

## Notes

- The Cloudflare Workers account subdomain is account-wide, not per Worker.
- Attempting to change the existing account subdomain through the API returned `Account already has an associated subdomain.`
- For branded production URLs, use a custom domain under `gokaboom.dev`.
