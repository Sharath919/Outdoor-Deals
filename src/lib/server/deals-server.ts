import { createServerSupabase } from '@/lib/supabase'

export type DealProduct = {
  asin: string
  product_name: string
  image_url: string | null
  current_price: number | null
  previous_price: number | null
}

export type DealRelatedProduct = {
  asin: string
  title: string
  image_url: string | null
  affiliate_url: string
}

export async function getDealProduct(asin: string): Promise<DealProduct | null> {
  const supabase = createServerSupabase()
  if (!supabase) return null

  const normalized = asin.trim().toUpperCase()
  const { data } = await supabase
    .from('tracked_products')
    .select('asin, product_name, image_url, current_price, previous_price')
    .eq('asin', normalized)
    .maybeSingle()

  return data as DealProduct | null
}

export async function getArticleSlugForAsin(asin: string): Promise<string | null> {
  const supabase = createServerSupabase()
  if (!supabase) return null

  const normalized = asin.trim().toUpperCase()

  const { data: watch } = await supabase
    .from('price_watches')
    .select('article_slug')
    .eq('asin', normalized)
    .not('article_slug', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (watch?.article_slug) return watch.article_slug

  const { data: product } = await supabase
    .from('products')
    .select('id')
    .eq('asin', normalized)
    .maybeSingle()

  if (!product?.id) return null

  const { data: link } = await supabase
    .from('article_products')
    .select('articles(slug)')
    .eq('product_id', product.id)
    .order('rank', { ascending: true })
    .limit(1)
    .maybeSingle()

  const rawArticle = link?.articles
  const article = (Array.isArray(rawArticle) ? rawArticle[0] : rawArticle) as { slug?: string } | null | undefined
  return article?.slug ?? null
}

export async function getRelatedProductsFromArticle(
  asin: string,
  articleSlug: string,
  limit = 3,
): Promise<DealRelatedProduct[]> {
  const supabase = createServerSupabase()
  if (!supabase) return []

  const { data: article } = await supabase
    .from('articles')
    .select('id')
    .eq('slug', articleSlug)
    .eq('status', 'published')
    .maybeSingle()

  if (!article?.id) return []

  const { data: rows } = await supabase
    .from('article_products')
    .select('rank, products(asin, title, image_url, affiliate_url)')
    .eq('article_id', article.id)
    .order('rank', { ascending: true })

  const normalized = asin.trim().toUpperCase()

  type ProductRow = {
    asin: string | null
    title: string
    image_url: string | null
    affiliate_url: string
  }

  return (rows ?? [])
    .map((row) => {
      const raw = row.products
      const p = (Array.isArray(raw) ? raw[0] : raw) as ProductRow | null | undefined
      if (!p?.affiliate_url || !p.asin || p.asin.toUpperCase() === normalized) return null
      return {
        asin: p.asin,
        title: p.title,
        image_url: p.image_url,
        affiliate_url: p.affiliate_url,
      }
    })
    .filter((p): p is DealRelatedProduct => p !== null)
    .slice(0, limit)
}

export async function getTrackedPricesForAsins(
  asins: string[],
): Promise<Record<string, number>> {
  const supabase = createServerSupabase()
  if (!supabase || asins.length === 0) return {}

  const normalized = asins.map((a) => a.trim().toUpperCase()).filter(Boolean)
  const { data } = await supabase
    .from('tracked_products')
    .select('asin, current_price')
    .in('asin', normalized)

  const map: Record<string, number> = {}
  for (const row of data ?? []) {
    if (row.current_price != null) map[row.asin] = Number(row.current_price)
  }
  return map
}
