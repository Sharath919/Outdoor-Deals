-- Global toggle for displaying Amazon product images.
-- Seeded to 'false' so images stay hidden until an admin enables them
-- (e.g. after Amazon Associates approval and once first-party API keys are live).
INSERT INTO public.ai_config (key, value) VALUES
  ('show_product_images', 'false')
ON CONFLICT (key) DO NOTHING;
