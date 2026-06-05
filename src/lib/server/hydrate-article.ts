import { createClient } from '@supabase/supabase-js'
import {
  applyPipelineToArticle,
  parseStoredProductSpecs,
} from '@/lib/server/affiliate-pipeline'
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

async function isAdminUser(supabase: ReturnType<typeof createClient>, token: string): Promise<boolean> {
  return isAdminAccessToken(supabase, token)
}

export async function handleHydrateArticle(request: Request): Promise<Response> {
  const supabase = getServerSupabase()
  if (!supabase) return jsonResponse({ error: 'Server configuration error' }, 500)

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token || !(await isAdminUser(supabase, token))) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const body = (await request.json().catch(() => ({}))) as { article_id?: string }
  const articleId = body.article_id?.trim()
  if (!articleId) return jsonResponse({ error: 'article_id is required' }, 400)

  const { data: article, error: fetchError } = await supabase
    .from('articles')
    .select('id, slug, content_html, category, product_specs')
    .eq('id', articleId)
    .maybeSingle()

  type ArticleRow = {
    id: string
    slug: string
    content_html: string | null
    category: string | null
    product_specs: unknown
  }

  const row = article as ArticleRow | null
  if (fetchError) return jsonResponse({ error: fetchError.message }, 500)
  if (!row?.content_html) return jsonResponse({ error: 'Article not found or has no content' }, 404)

  try {
    const result = await applyPipelineToArticle(supabase, row.id, {
      contentHtml: row.content_html,
      category: row.category,
      productSpecs: parseStoredProductSpecs(row.product_specs),
    })

    return jsonResponse({
      success: true,
      article_id: row.id,
      slug: row.slug,
      products_linked: result.spec.products.length,
      warnings: result.warnings,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: message }, 500)
  }
}

export { corsHeaders }
