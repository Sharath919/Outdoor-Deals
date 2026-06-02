-- Outdoor Deals — initial schema (separate Supabase project)

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  email text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'writer', 'admin')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name'),
    COALESCE(NEW.email, ''),
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Admin users
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can check own admin status"
  ON public.admin_users FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.is_site_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users au WHERE au.id = auth.uid()
  )
  OR lower(trim(coalesce(
    NULLIF(trim(auth.jwt() ->> 'email'), ''),
    NULLIF(trim(auth.jwt() -> 'user_metadata' ->> 'email'), ''),
    ''
  ))) IN ('sharathchand19141@gmail.com', 'sharathbroyt@gmail.com');
$$;

REVOKE ALL ON FUNCTION public.is_site_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_site_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_article_writer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_site_admin()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('writer', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_article_writer() TO authenticated;

-- Articles
CREATE TABLE IF NOT EXISTS public.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  meta_description text,
  content_html text,
  hero_image_url text,
  atmosphere_image_url text,
  card_id text,
  template_type text CHECK (
    template_type IN (
      'roundup-under-budget',
      'best-of-category',
      'comparison',
      'buying-guide',
      'other'
    )
  ),
  category text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published')),
  author_name text,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  seo_title text,
  canonical_url text,
  prerender_status text DEFAULT 'pending' CHECK (prerender_status IN ('pending', 'done')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS articles_updated_at ON public.articles;
CREATE TRIGGER articles_updated_at
  BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE POLICY "Public read published articles"
  ON public.articles FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE POLICY "Writers read own articles"
  ON public.articles FOR SELECT TO authenticated
  USING (auth.uid() = author_id);

CREATE POLICY "Site admins read all articles"
  ON public.articles FOR SELECT TO authenticated
  USING (public.is_site_admin());

CREATE POLICY "Writers insert articles"
  ON public.articles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id AND public.is_article_writer());

CREATE POLICY "Writers update own drafts"
  ON public.articles FOR UPDATE TO authenticated
  USING (auth.uid() = author_id AND status IN ('draft', 'review') AND public.is_article_writer())
  WITH CHECK (auth.uid() = author_id AND public.is_article_writer());

CREATE POLICY "Site admins full access articles"
  ON public.articles FOR ALL TO authenticated
  USING (public.is_site_admin()) WITH CHECK (public.is_site_admin());

GRANT SELECT ON public.articles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.articles TO authenticated;

-- Publishing schedule (card_name = commercial topic for pipeline compat)
CREATE TABLE IF NOT EXISTS public.publishing_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_name text NOT NULL,
  template_type text NOT NULL,
  scheduled_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.publishing_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage publishing_schedule"
  ON public.publishing_schedule FOR ALL TO authenticated
  USING (public.is_site_admin()) WITH CHECK (public.is_site_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.publishing_schedule TO authenticated;
GRANT ALL ON public.publishing_schedule TO service_role;

-- AI config
CREATE TABLE IF NOT EXISTS public.ai_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '""'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read ai_config"
  ON public.ai_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage ai_config"
  ON public.ai_config FOR ALL TO authenticated
  USING (public.is_site_admin()) WITH CHECK (public.is_site_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_config TO authenticated;
GRANT ALL ON public.ai_config TO service_role;

INSERT INTO public.ai_config (key, value) VALUES
  ('automation_enabled', 'true'),
  ('article_machine_prompt_default', '""'),
  ('article_machine_prompt_roundup_under_budget', '""'),
  ('article_machine_prompt_best_of_category', '""'),
  ('article_machine_prompt_comparison', '""'),
  ('article_machine_prompt_buying_guide', '""'),
  ('wp_enabled', 'true'),
  ('wp_system_prompt', '""')
ON CONFLICT (key) DO NOTHING;

-- API usage log
CREATE TABLE IF NOT EXISTS public.api_usage_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  schedule_id uuid REFERENCES public.publishing_schedule(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('claude', 'replicate', 'gemini')),
  model text NOT NULL,
  operation text NOT NULL,
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  total_tokens integer DEFAULT 0,
  cost_usd numeric(10, 6) DEFAULT 0,
  duration_ms integer DEFAULT 0,
  success boolean DEFAULT true,
  error_text text,
  prompt_key text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read api_usage_log" ON public.api_usage_log FOR SELECT TO authenticated USING (public.is_site_admin());
GRANT ALL ON public.api_usage_log TO service_role;
GRANT SELECT ON public.api_usage_log TO authenticated;

-- Products catalog
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asin text,
  title text NOT NULL,
  image_url text,
  affiliate_url text NOT NULL,
  category text,
  tags jsonb DEFAULT '[]'::jsonb,
  last_price_cents integer,
  last_checked_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read products" ON public.products FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage products" ON public.products FOR ALL TO authenticated
  USING (public.is_site_admin()) WITH CHECK (public.is_site_admin());

CREATE TABLE IF NOT EXISTS public.article_products (
  article_id uuid REFERENCES public.articles(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  rank integer DEFAULT 0,
  quiz_weight jsonb DEFAULT '{}'::jsonb,
  PRIMARY KEY (article_id, product_id)
);

ALTER TABLE public.article_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read article_products" ON public.article_products FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage article_products" ON public.article_products FOR ALL TO authenticated
  USING (public.is_site_admin()) WITH CHECK (public.is_site_admin());

-- Price alerts & subscribers
CREATE TABLE IF NOT EXISTS public.price_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  target_price_cents integer,
  active boolean DEFAULT true,
  last_notified_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone insert price_alerts" ON public.price_alerts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins read price_alerts" ON public.price_alerts FOR SELECT TO authenticated USING (public.is_site_admin());

CREATE TABLE IF NOT EXISTS public.subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  source_article_slug text,
  utm jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone insert subscribers" ON public.subscribers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins read subscribers" ON public.subscribers FOR SELECT TO authenticated USING (public.is_site_admin());

-- Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('article-images', 'article-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read article images" ON storage.objects FOR SELECT USING (bucket_id = 'article-images');
CREATE POLICY "Writers upload article images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'article-images' AND public.is_article_writer());

GRANT ALL ON public.articles TO service_role;
GRANT ALL ON public.products TO service_role;
