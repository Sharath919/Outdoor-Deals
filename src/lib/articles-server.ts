import { createServerSupabase } from '@/lib/supabase'
import type { Article } from '@/types/article'

export type GuideProduct = {
  rank: number
  title: string
  image_url: string | null
  affiliate_url: string
  asin?: string | null
  price_range?: string | null
  award_label?: string
  tagline?: string
  award_color?: string
}

const AWARD_LABELS = ['Top Pick', 'Versatile', 'Budget', 'Best Value', 'Best for Reliability']
const PICK_TAGLINES = ['Best for Reliability', 'Best for Versatility', 'Best Value']

export async function getArticleProducts(articleId: string): Promise<GuideProduct[]> {
  const supabase = createServerSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('article_products')
    .select('rank, products(title, image_url, affiliate_url, asin, last_price_cents)')
    .eq('article_id', articleId)
    .order('rank', { ascending: true })

  if (error || !data) return []

  type ArticleProductRow = {
    rank: number
    products: {
      title: string
      image_url: string | null
      affiliate_url: string
      asin: string | null
      last_price_cents: number | null
    } | null
  }

  const AWARD_COLORS = ['gold', 'versatile', 'value'] as const

  return (data as ArticleProductRow[])
    .map((row, index) => {
      const product = row.products
      if (!product?.affiliate_url) return null
      const price_range = product.last_price_cents
        ? `$${Math.round(product.last_price_cents / 100)}`
        : null
      return {
        rank: row.rank ?? index,
        title: product.title,
        image_url: product.image_url,
        affiliate_url: product.affiliate_url,
        asin: product.asin ?? null,
        price_range,
        award_label: AWARD_LABELS[index],
        tagline: PICK_TAGLINES[index],
        award_color: AWARD_COLORS[index] ?? 'gold',
      } satisfies GuideProduct
    })
    .filter((p): p is GuideProduct => p !== null)
}

export type GuideFeaturedProduct = {
  title: string
  image_url: string | null
  affiliate_url: string
}

export async function getFeaturedProductForArticle(
  articleId: string,
): Promise<GuideFeaturedProduct | null> {
  const products = await getArticleProducts(articleId)
  if (products.length === 0) return null
  const first = products[0]
  return {
    title: first.title,
    image_url: first.image_url,
    affiliate_url: first.affiliate_url,
  }
}

export async function getPublishedArticleSlugs(): Promise<string[]> {
  const supabase = createServerSupabase()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('articles')
    .select('slug')
    .eq('status', 'published')
    .limit(5000)
  if (error) {
    console.error('[articles-server] slugs:', error.message)
    return []
  }
  return (data ?? []).map((r) => r.slug).filter(Boolean)
}

export async function getPublishedArticleBySlug(slug: string): Promise<Article | null> {
  const supabase = createServerSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  if (error) {
    console.error('[articles-server] getBySlug:', error.message)
    return null
  }
  return data
}

export async function getPublishedArticlesList(): Promise<Article[]> {
  const supabase = createServerSupabase()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('articles')
    .select('id, slug, title, meta_description, hero_image_url, published_at, updated_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(100)
  if (error) return []
  return (data ?? []) as Article[]
}
