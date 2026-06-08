import { supabase } from '@/lib/supabase'
import type { Article, ArticleFormData } from '@/types/article'
import { stripBrokenArticleImages } from '@/utils/articleContent'
import { productSpecsFromImportJson, importMetadataFromJson } from '@/utils/claudeImportJson'

function emptyToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function formToInsert(
  formData: ArticleFormData,
  authorId: string,
  authorName: string,
) {
  const importJson = formData.import_json ?? null
  const productSpecs = importJson ? productSpecsFromImportJson(importJson) : null
  const importMeta = importJson ? importMetadataFromJson(importJson) : {}

  return {
    title: formData.title.trim(),
    slug: formData.slug.trim(),
    meta_description: emptyToNull(formData.meta_description),
    content_html: stripBrokenArticleImages(emptyToNull(formData.content_html)),
    hero_image_url: emptyToNull(formData.hero_image_url),
    atmosphere_image_url: emptyToNull(formData.hero_image_url),
    card_id: emptyToNull(formData.topic),
    template_type: formData.template_type || null,
    category: emptyToNull(formData.category),
    seo_title: emptyToNull(formData.seo_title),
    canonical_url: emptyToNull(formData.canonical_url),
    status: formData.status,
    author_id: authorId,
    author_name: authorName,
    reddit_welcome: importMeta.reddit_welcome ?? null,
    display_name: importMeta.display_name ?? null,
    published_at: formData.status === 'published' ? new Date().toISOString() : null,
    import_json: importJson,
    source: importJson ? 'manual_import' : 'pipeline',
    product_specs: productSpecs?.length ? productSpecs : null,
  }
}

function formToUpdate(formData: Partial<ArticleFormData>) {
  const updates: Record<string, unknown> = {}

  if (formData.title !== undefined) updates.title = formData.title.trim()
  if (formData.slug !== undefined) updates.slug = formData.slug.trim()
  if (formData.meta_description !== undefined) {
    updates.meta_description = emptyToNull(formData.meta_description)
  }
  if (formData.content_html !== undefined) {
    updates.content_html = stripBrokenArticleImages(emptyToNull(formData.content_html))
  }
  if (formData.hero_image_url !== undefined) {
    const hero = emptyToNull(formData.hero_image_url)
    updates.hero_image_url = hero
    updates.atmosphere_image_url = hero
  }
  if (formData.topic !== undefined) updates.card_id = emptyToNull(formData.topic)
  if (formData.template_type !== undefined) {
    updates.template_type = formData.template_type || null
  }
  if (formData.category !== undefined) updates.category = emptyToNull(formData.category)
  if (formData.seo_title !== undefined) updates.seo_title = emptyToNull(formData.seo_title)
  if (formData.canonical_url !== undefined) {
    updates.canonical_url = emptyToNull(formData.canonical_url)
  }
  if (formData.status !== undefined) updates.status = formData.status

  if (formData.import_json !== undefined) {
    const importJson = formData.import_json
    updates.import_json = importJson
    if (importJson) {
      updates.source = 'manual_import'
      const specs = productSpecsFromImportJson(importJson)
      if (specs.length) updates.product_specs = specs
      const importMeta = importMetadataFromJson(importJson)
      if (importMeta.reddit_welcome) updates.reddit_welcome = importMeta.reddit_welcome
      if (importMeta.display_name) updates.display_name = importMeta.display_name
    }
  }

  return updates
}

export function formatArticleError(message: string): string {
  if (
    message.includes('articles_slug_key') ||
    message.includes('duplicate key value violates unique constraint')
  ) {
    return 'This URL slug is already in use. Change the slug (e.g. add "-2") or edit the existing article from the Articles list.'
  }
  return message
}

/** True if no other article uses this slug (requires article_slug_available RPC when possible). */
export async function isSlugAvailable(
  slug: string,
  excludeArticleId?: string,
): Promise<boolean> {
  const normalized = slug.trim()
  if (!normalized) return false

  const { data, error } = await supabase.rpc('article_slug_available', {
    p_slug: normalized,
    p_exclude_id: excludeArticleId ?? null,
  })

  if (!error && typeof data === 'boolean') return data

  let query = supabase.from('articles').select('id').eq('slug', normalized)
  if (excludeArticleId) query = query.neq('id', excludeArticleId)
  const { data: row, error: qError } = await query.maybeSingle()
  if (qError) {
    console.error('[articles] isSlugAvailable:', qError.message)
    return true
  }
  return !row
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  if (error) {
    console.error('[articles] getArticleBySlug:', error.message)
    return null
  }
  return sanitizeArticleRow(data as Article)
}

function sanitizeArticleRow(article: Article | null): Article | null {
  if (!article) return null
  const content_html = stripBrokenArticleImages(article.content_html)
  if (content_html === article.content_html) return article
  return { ...article, content_html }
}

export async function getArticleById(id: string): Promise<Article | null> {
  const { data, error } = await supabase.from('articles').select('*').eq('id', id).maybeSingle()

  if (error) {
    console.error('[articles] getArticleById:', error.message)
    return null
  }
  return sanitizeArticleRow(data as Article)
}

export async function getPublishedArticles(limit = 50): Promise<Article[]> {
  const { data, error } = await supabase
    .from('articles')
    .select(
      'id, slug, title, hero_image_url, card_id, template_type, category, published_at, updated_at',
    )
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[articles] getPublishedArticles:', error.message)
    return []
  }
  return (data ?? []) as Article[]
}

const LIST_FIELDS =
  'id, slug, title, hero_image_url, card_id, template_type, category, published_at, updated_at'

export async function getPublishedArticlesByTemplate(
  templateType: string,
  limit = 500,
): Promise<Article[]> {
  const { data, error } = await supabase
    .from('articles')
    .select(LIST_FIELDS)
    .eq('status', 'published')
    .eq('template_type', templateType)
    .order('published_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[articles] getPublishedArticlesByTemplate:', error.message)
    return []
  }
  return (data ?? []) as Article[]
}

export async function getRelatedArticles(
  article: Pick<Article, 'id' | 'template_type' | 'category'>,
  limit = 4,
): Promise<Article[]> {
  if (!article.template_type) return []

  const { data, error } = await supabase
    .from('articles')
    .select(LIST_FIELDS)
    .eq('status', 'published')
    .eq('template_type', article.template_type)
    .neq('id', article.id)
    .order('published_at', { ascending: false })
    .limit(40)

  if (error) {
    console.error('[articles] getRelatedArticles:', error.message)
    return []
  }

  const rows = (data ?? []) as Article[]
  const sameCategory = rows.filter((r) => r.category && r.category === article.category)
  const other = rows.filter((r) => !r.category || r.category !== article.category)
  return [...sameCategory, ...other].slice(0, limit)
}

export async function getAllArticles(filters?: {
  status?: string
  author_id?: string
}): Promise<Article[]> {
  let query = supabase.from('articles').select('*').order('updated_at', { ascending: false })

  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.author_id) query = query.eq('author_id', filters.author_id)

  const { data, error } = await query
  if (error) {
    console.error('[articles] getAllArticles:', error.message)
    return []
  }
  return (data ?? []) as Article[]
}

export type AdminArticleSort = 'newest' | 'oldest' | 'title-asc' | 'title-desc' | 'updated'
export type AdminArticleDateRange = 'all' | 'today' | 'week' | 'month' | '30' | '90'
export type AdminArticleSource = 'all' | 'generated' | 'manual'

export interface AdminArticleQueryFilters {
  search?: string
  status?: string
  template?: string
  category?: string
  source?: AdminArticleSource
  dateRange?: AdminArticleDateRange
  sort?: AdminArticleSort
  page?: number
  pageSize?: number
}

export interface AdminArticleQueryResult {
  articles: Article[]
  total: number
  error: string | null
}

function escapeIlike(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function dateRangeFrom(range: AdminArticleDateRange): string | null {
  if (range === 'all') return null
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)

  switch (range) {
    case 'today':
      break
    case 'week':
      start.setDate(start.getDate() - start.getDay())
      break
    case 'month':
      start.setDate(1)
      break
    case '30':
      start.setDate(start.getDate() - 30)
      break
    case '90':
      start.setDate(start.getDate() - 90)
      break
  }

  return start.toISOString()
}

export async function queryAdminArticles(
  filters: AdminArticleQueryFilters = {},
): Promise<AdminArticleQueryResult> {
  const pageSize = filters.pageSize ?? 20
  const page = Math.max(1, filters.page ?? 1)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase.from('articles').select('*', { count: 'exact' })

  const search = filters.search?.trim()
  if (search) {
    const term = escapeIlike(search)
    query = query.or(
      `title.ilike.%${term}%,slug.ilike.%${term}%,card_id.ilike.%${term}%`,
    )
  }

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  if (filters.template && filters.template !== 'all') {
    query = query.eq('template_type', filters.template)
  }

  if (filters.category && filters.category !== 'all') {
    query = query.eq('category', filters.category)
  }

  const source = filters.source ?? 'all'
  if (source === 'generated') {
    query = query.eq('author_name', 'Limansa')
  } else if (source === 'manual') {
    query = query.or('author_name.is.null,author_name.neq.Limansa')
  }

  const rangeFrom = dateRangeFrom(filters.dateRange ?? 'all')
  if (rangeFrom) {
    query = query.gte('created_at', rangeFrom)
  }

  const sort = filters.sort ?? 'newest'
  switch (sort) {
    case 'oldest':
      query = query.order('created_at', { ascending: true })
      break
    case 'title-asc':
      query = query.order('title', { ascending: true })
      break
    case 'title-desc':
      query = query.order('title', { ascending: false })
      break
    case 'updated':
      query = query.order('updated_at', { ascending: false })
      break
    case 'newest':
    default:
      query = query.order('created_at', { ascending: false })
      break
  }

  query = query.range(from, to)

  const { data, count, error } = await query
  if (error) {
    console.error('[articles] queryAdminArticles:', error.message)
    return { articles: [], total: 0, error: error.message }
  }

  return {
    articles: (data ?? []) as Article[],
    total: count ?? 0,
    error: null,
  }
}

export function estimateWordCount(html: string | null): number {
  if (!html) return 0
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return 0
  return text.split(/\s+/).length
}

export async function bulkUpdateArticleStatus(
  ids: string[],
  status: Article['status'],
): Promise<{ ok: boolean; error: string | null }> {
  if (!ids.length) return { ok: true, error: null }
  const updates: Record<string, unknown> = { status }
  if (status === 'published') {
    updates.published_at = new Date().toISOString()
  }
  const { error } = await supabase.from('articles').update(updates).in('id', ids)
  if (error) return { ok: false, error: error.message }
  return { ok: true, error: null }
}

export async function bulkDeleteArticles(
  ids: string[],
): Promise<{ ok: boolean; error: string | null }> {
  if (!ids.length) return { ok: true, error: null }
  const { error } = await supabase.from('articles').delete().in('id', ids)
  if (error) return { ok: false, error: error.message }
  return { ok: true, error: null }
}

export async function createArticle(
  formData: ArticleFormData,
  authorId: string,
  authorName: string,
): Promise<{ data: Article | null; error: string | null }> {
  const slug = formData.slug.trim()
  const available = await isSlugAvailable(slug)
  if (!available) {
    return { data: null, error: formatArticleError('articles_slug_key') }
  }

  const { data, error } = await supabase
    .from('articles')
    .insert(formToInsert(formData, authorId, authorName))
    .select()
    .single()

  if (error) return { data: null, error: formatArticleError(error.message) }
  return { data: data as Article, error: null }
}

export async function updateArticle(
  id: string,
  formData: Partial<ArticleFormData>,
  options?: { existingPublishedAt?: string | null },
): Promise<{ data: Article | null; error: string | null }> {
  const updates = formToUpdate(formData)

  if (formData.slug !== undefined) {
    const available = await isSlugAvailable(formData.slug.trim(), id)
    if (!available) {
      return { data: null, error: formatArticleError('articles_slug_key') }
    }
  }

  if (formData.status === 'published' && !options?.existingPublishedAt) {
    updates.published_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('articles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return { data: null, error: formatArticleError(error.message) }
  return { data: data as Article, error: null }
}

export async function deleteArticle(id: string): Promise<boolean> {
  const { error } = await supabase.from('articles').delete().eq('id', id)
  return !error
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

/** Append -2, -3, … until slug is free (for editors only). */
export async function suggestAvailableSlug(
  baseSlug: string,
  excludeArticleId?: string,
): Promise<string> {
  const base = baseSlug.trim() || 'article'
  if (await isSlugAvailable(base, excludeArticleId)) return base

  for (let n = 2; n <= 99; n++) {
    const candidate = `${base}-${n}`
    if (await isSlugAvailable(candidate, excludeArticleId)) return candidate
  }
  return `${base}-${Date.now()}`
}

export function articleToFormData(article: Article): ArticleFormData {
  return {
    title: article.title,
    slug: article.slug,
    meta_description: article.meta_description ?? '',
    content_html: article.content_html ?? '',
    hero_image_url: article.hero_image_url ?? '',
    atmosphere_image_url: article.atmosphere_image_url ?? '',
    topic: article.card_id ?? '',
    template_type: article.template_type ?? '',
    category: article.category ?? '',
    seo_title: article.seo_title ?? '',
    canonical_url: article.canonical_url ?? '',
    status: article.status,
    import_json: article.import_json ?? null,
  }
}
