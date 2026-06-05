-- Track when affiliate hydration last ran (skip re-hydrate on publish within 24h).
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS last_hydrated_at timestamptz;
