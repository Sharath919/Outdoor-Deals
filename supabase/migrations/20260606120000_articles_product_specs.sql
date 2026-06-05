-- Persist PA-API product specs so re-hydrate keeps search_keywords and ASINs.
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS product_specs jsonb NOT NULL DEFAULT '[]'::jsonb;
