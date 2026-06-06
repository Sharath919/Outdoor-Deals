import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { hydrateArticleRecord } from '@/lib/server/article-hydration'
import { isAdminAccessToken } from '@/lib/server/admin-auth'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function getServerSupabase() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    .trim()
    .replace(/\/$/, '')
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey) as ReturnType<typeof createClient>
}

export async function handlePublishArticle(request: Request): Promise<Response> {
  const supabase = getServerSupabase()
  if (!supabase) return jsonResponse({ error: 'Server configuration error' }, 500)

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token || !(await isAdminAccessToken(supabase, token))) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const body = (await request.json().catch(() => ({}))) as {
    article_id?: string
    existing_published_at?: string | null
  }
  const articleId = body.article_id?.trim()
  if (!articleId) return jsonResponse({ error: 'article_id is required' }, 400)

  const { data: article, error: fetchError } = await supabase
    .from('articles')
    .select('id, slug, content_html, category, product_specs, last_hydrated_at, published_at, status')
    .eq('id', articleId)
    .maybeSingle()

  type ArticleRow = {
    id: string
    slug: string
    content_html: string | null
    category: string | null
    product_specs: unknown
    last_hydrated_at: string | null
    published_at: string | null
    status: string
  }

  const row = article as ArticleRow | null
  if (fetchError) return jsonResponse({ error: fetchError.message }, 500)
  if (!row) return jsonResponse({ error: 'Article not found' }, 404)

  const hydration = await hydrateArticleRecord(supabase, row)

  const existingPublishedAt =
    body.existing_published_at?.trim() || row.published_at?.trim() || null
  const publishedAt = existingPublishedAt || new Date().toISOString()

  const { data: published, error: publishError } = await supabase
    .from('articles')
    .update({
      status: 'published',
      published_at: publishedAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', articleId)
    .select('id, slug, status, published_at')
    .single()

  if (publishError) {
    return jsonResponse({ error: `Failed to publish article: ${publishError.message}` }, 500)
  }

  const warnings = [...hydration.warnings]
  if (hydration.error && !hydration.skipped) {
    warnings.push(`Published with hydration errors — ${hydration.error}`)
  }

  if (row.slug) {
    revalidatePath(`/guides/${row.slug}`)
  }

  return jsonResponse({
    success: true,
    article_id: row.id,
    slug: row.slug,
    published,
    hydration_skipped: hydration.skipped,
    hydration_success: hydration.success,
    products_linked: hydration.products_linked,
    warnings,
  })
}

export { corsHeaders }
