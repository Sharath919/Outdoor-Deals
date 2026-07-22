-- Switch site affiliate link tracking tag to gearnsteer-20.
-- Creators API partner tag (amazon_paapi_partner_tag) is intentionally left unchanged.

INSERT INTO public.ai_config (key, value, updated_at)
VALUES ('amazon_associate_tag', '"gearnsteer-20"'::jsonb, now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = now();

-- Rewrite stored product affiliate URLs (any previous tag → gearnsteer-20)
UPDATE public.products
SET affiliate_url = regexp_replace(
  affiliate_url,
  '([?&]tag=)[^&#]*',
  '\1gearnsteer-20',
  'gi'
)
WHERE affiliate_url ~* '[?&]tag='
  AND affiliate_url !~* '[?&]tag=gearnsteer-20([&]|$)';

-- Rewrite Amazon tags embedded in article HTML
UPDATE public.articles
SET content_html = regexp_replace(
  content_html,
  'gearandsteer-20',
  'gearnsteer-20',
  'gi'
)
WHERE content_html IS NOT NULL
  AND content_html ~* 'gearandsteer-20';

UPDATE public.articles
SET content_html = regexp_replace(
  content_html,
  '(https?://(?:www\.)?amazon\.[^\s"''<>]*?[?&]tag=)(?!gearnsteer-20(?:[&]|[$]))[^&#"''\s<>]*',
  '\1gearnsteer-20',
  'gi'
)
WHERE content_html IS NOT NULL
  AND content_html ~* 'amazon\.[^"''<>]*[?&]tag='
  AND content_html !~* '[?&]tag=gearnsteer-20';
