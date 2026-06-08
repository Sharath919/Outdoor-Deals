ALTER TABLE public.articles
ADD COLUMN IF NOT EXISTS reddit_welcome text;

ALTER TABLE public.articles
ADD COLUMN IF NOT EXISTS display_name text;
