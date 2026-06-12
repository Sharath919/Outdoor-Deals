# Outdoor Deals (Next.js)

Self-contained affiliate gear site on **Next.js App Router** + **Railway**.

## Stack

- Next.js 15 (App Router, SSG/ISR for `/guides/[slug]`)
- Supabase (auth, articles, schedule, products)
- Claude + Replicate (article machine)
- Railway (`next build` → `next start`)

## Setup

1. Create Supabase project → run `supabase/migrations/20260602120000_outdoor_deals_initial.sql`
2. Copy `.env.example` → `.env.local`
3. `npm install && npm run dev`

## Admin

`/login` → `/admin` — schedule, article machine, articles, products

## Cron (Railway)

Second service, cron schedule, command:

```bash
npm run cron:publishing
```

## Deploy (Railway)

The repo includes a **Dockerfile** (Next.js standalone) so Railway skips the flaky Nixpacks builder.

Required env vars in Railway (Settings → Variables):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `CRON_SECRET`, `ANTHROPIC_API_KEY`, `REPLICATE_API_TOKEN`

If a build still fails with `$NIXPACKS_PATH` errors, add `NIXPACKS_NO_CACHE=1` or ensure Railway is using the Dockerfile builder.

## Env

Use `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, `REPLICATE_API_TOKEN`, `NEXT_PUBLIC_SITE_URL`.

See `.env.example` for the full list including price-alert vars (`PAAPI_*`, `RESEND_API_KEY`, `ALERT_FROM_EMAIL`).

## Price drop alerts

Daily cron polls Amazon PA-API for tracked ASINs and emails users when a watched product drops ≥5% and ≥$5.

### Database

Apply `supabase/migrations/20260613120000_price_drop_alerts.sql` after the initial migrations. Tables: `tracked_products`, `price_watches`, `price_history`.

### Env vars

| Variable | Purpose |
|----------|---------|
| `PAAPI_ACCESS_KEY` / `PAAPI_SECRET_KEY` | PA-API credentials (same as hydration) |
| `PAAPI_PARTNER_TAG` | Amazon Associates tag — **never hardcode** |
| `RESEND_API_KEY` | Resend API key for alert emails |
| `ALERT_FROM_EMAIL` | Sender, e.g. `GearAndSteer Alerts <alerts@mail.gearandsteer.com>` |
| `CRON_SECRET` | Bearer token protecting `/api/cron/price-check` |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL for email links |

### Resend DNS (mail.gearandsteer.com)

In the Resend dashboard, add domain `mail.gearandsteer.com` and create the DNS records Resend provides:

- **SPF** — TXT record authorizing Resend to send
- **DKIM** — CNAME/TXT records for domain signing
- **Return-Path** (if shown) — CNAME for bounce handling

Verify the domain before sending production emails.

### Railway cron (price check)

Add a second Railway cron service (or extend the existing cron service) with schedule **daily at 11:00 UTC**:

```bash
npm run cron:price-check
```

This runs `scripts/price-check-trigger.mjs`, which POSTs to:

```
https://gearandsteer.com/api/cron/price-check
```

with `Authorization: Bearer $CRON_SECRET`.

Alternatively, call the endpoint directly:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://gearandsteer.com/api/cron/price-check
```

### Run price check locally

With the dev server running and env vars set:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/price-check
```

Or trigger via the script (uses `NEXT_PUBLIC_SITE_URL`):

```bash
npm run cron:price-check
```
