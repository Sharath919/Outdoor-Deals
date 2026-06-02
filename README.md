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

## Env

Use `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, `REPLICATE_API_TOKEN`, `NEXT_PUBLIC_SITE_URL`.
