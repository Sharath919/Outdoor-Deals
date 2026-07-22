import { createServerSupabase } from '@/lib/supabase'
import { outdoorCategoryLabel } from '@/config/outdoorCategories'
import type { Article } from '@/types/article'
import { SITE_ASSOCIATE_TAG } from '@/types/amazonAffiliate'
import { applyAssociateTagToUrl } from '@/utils/amazonAffiliateConfig'

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
        affiliate_url: applyAssociateTagToUrl(product.affiliate_url, SITE_ASSOCIATE_TAG),
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

export const GUIDES_PAGE_SIZE = 12

export type GuideListItem = Pick<
  Article,
  'id' | 'slug' | 'title' | 'meta_description' | 'hero_image_url' | 'published_at' | 'category'
>

export type GuideCategoryCount = {
  value: string
  label: string
  count: number
}

export type PublishedGuidesQueryResult = {
  articles: GuideListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  categories: GuideCategoryCount[]
}

export async function queryPublishedGuides(options?: {
  page?: number
  pageSize?: number
  category?: string | null
}): Promise<PublishedGuidesQueryResult> {
  const supabase = createServerSupabase()
  const pageSize = options?.pageSize ?? GUIDES_PAGE_SIZE
  const page = Math.max(1, options?.page ?? 1)
  const category = options?.category?.trim() || null

  if (!supabase) {
    return {
      articles: [],
      total: 0,
      page,
      pageSize,
      totalPages: 0,
      categories: [],
    }
  }

  const { data: categoryRows } = await supabase
    .from('articles')
    .select('category')
    .eq('status', 'published')
    .not('category', 'is', null)

  const categoryCounts = new Map<string, number>()
  for (const row of categoryRows ?? []) {
    const key = String(row.category ?? '').trim()
    if (!key) continue
    categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1)
  }

  const categories: GuideCategoryCount[] = [...categoryCounts.entries()]
    .map(([value, count]) => ({
      value,
      label: outdoorCategoryLabel(value),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('articles')
    .select(
      'id, slug, title, meta_description, hero_image_url, published_at, category',
      { count: 'exact' },
    )
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .range(from, to)

  if (category) {
    query = query.eq('category', category)
  }

  const { data, error, count } = await query
  const total = count ?? 0
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0

  if (error) {
    console.error('[articles-server] queryPublishedGuides:', error.message)
    return { articles: [], total: 0, page, pageSize, totalPages: 0, categories }
  }

  return {
    articles: (data ?? []) as GuideListItem[],
    total,
    page,
    pageSize,
    totalPages,
    categories,
  }
}
