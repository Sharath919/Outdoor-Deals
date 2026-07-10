import { createClient } from '@supabase/supabase-js'
import { readAmazonAffiliateServerConfig } from '@/lib/server/amazon-affiliate-config'
import { isAdminAccessToken } from '@/lib/server/admin-auth'
import { testPaapiConnection } from '@/lib/server/affiliate-pipeline/paapi-client'
import { resolvePaapiPartnerTag } from '@/utils/amazonAffiliateConfig'

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

export async function handleTestPaapi(request: Request): Promise<Response> {
  const supabase = getServerSupabase()
  if (!supabase) return jsonResponse({ error: 'Server configuration error' }, 500)

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token || !(await isAdminAccessToken(supabase, token))) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const config = await readAmazonAffiliateServerConfig()
  if (!config.paapiAccessKey || !config.paapiSecretKey || !resolvePaapiPartnerTag(config)) {
    return jsonResponse({
      success: false,
      configured: false,
      message:
        'PA-API not fully configured — save access key, secret key, and PA-API partner tag first',
    })
  }

  const result = await testPaapiConnection(config)

  if (result.ok) {
    const info = result.item.ItemInfo as Record<string, unknown> | undefined
    const titleObj = info?.Title as { DisplayValue?: string } | undefined
    const images = result.item.Images as
      | { Primary?: { Large?: { URL?: string }; Medium?: { URL?: string } } }
      | undefined
    const imageUrl = images?.Primary?.Large?.URL ?? images?.Primary?.Medium?.URL ?? null

    return jsonResponse({
      success: true,
      configured: true,
      message: 'PA-API connected — test search returned a product with image data',
      asin: result.asin,
      title: titleObj?.DisplayValue ?? null,
      image_url: imageUrl,
    })
  }

  const detail = Array.isArray(result.errors) && result.errors.length
    ? result.errors.slice(0, 2).join('; ')
    : ''

  return jsonResponse({
    success: false,
    configured: true,
    fatal: result.fatal,
    errors: result.errors,
    message: result.fatal
      ? `PA-API credentials or associate eligibility failed${detail ? ` — ${detail}` : ''}`
      : detail
        ? `PA-API search failed — ${detail}`
        : 'PA-API request completed but test search returned no product',
  })
}

export { corsHeaders }
