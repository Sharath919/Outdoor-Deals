-- Admin read access for price drop alert tables (cron still uses service role).

ALTER TABLE public.tracked_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read tracked_products"
  ON public.tracked_products FOR SELECT TO authenticated
  USING (public.is_site_admin());

CREATE POLICY "Admins read price_watches"
  ON public.price_watches FOR SELECT TO authenticated
  USING (public.is_site_admin());

CREATE POLICY "Admins read price_history"
  ON public.price_history FOR SELECT TO authenticated
  USING (public.is_site_admin());

GRANT SELECT ON public.tracked_products TO authenticated;
GRANT SELECT ON public.price_watches TO authenticated;
GRANT SELECT ON public.price_history TO authenticated;
