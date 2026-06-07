-- Manual Claude JSON import: store full import payload and article source.

ALTER TABLE public.articles
ADD COLUMN IF NOT EXISTS import_json jsonb;

ALTER TABLE public.articles
ADD COLUMN IF NOT EXISTS source text DEFAULT 'pipeline';
