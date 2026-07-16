import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { isAdminAccessToken } from '@/lib/server/admin-auth'
import { SHOW_PRODUCT_IMAGES_KEY } from '@/types/amazonAffiliate'
import { parseAiConfigBoolean } from '@/utils/aiConfigBoolean'

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
  return createClient(url, serviceKey)
}

async function requireAdmin(request: Request) {
  const supabase = getServerSupabase()
  if (!supabase) return { error: jsonResponse({ error: 'Server configuration error' }, 500) }

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token || !(await isAdminAccessToken(supabase, token))) {
    return { error: jsonResponse({ error: 'Unauthorized' }, 401) }
  }
  return { supabase }
}

export async function handleGetShowProductImages(request: Request): Promise<Response> {
  const auth = await requireAdmin(request)
  if ('error' in auth && auth.error) return auth.error
  const { supabase } = auth as { supabase: NonNullable<ReturnType<typeof getServerSupabase>> }

  const { data, error } = await supabase
    .from('ai_config')
    .select('value')
    .eq('key', SHOW_PRODUCT_IMAGES_KEY)
    .maybeSingle()

  if (error) return jsonResponse({ error: error.message }, 500)

  return jsonResponse({
    showProductImages: parseAiConfigBoolean(data?.value, false),
  })
}

export async function handleSetShowProductImages(request: Request): Promise<Response> {
  const auth = await requireAdmin(request)
  if ('error' in auth && auth.error) return auth.error
  const { supabase } = auth as { supabase: NonNullable<ReturnType<typeof getServerSupabase>> }

  const body = (await request.json().catch(() => ({}))) as { enabled?: unknown }
  const enabled = Boolean(body.enabled)

  const { error } = await supabase.from('ai_config').upsert(
    {
      key: SHOW_PRODUCT_IMAGES_KEY,
      value: enabled ? 'true' : 'false',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )

  if (error) return jsonResponse({ error: error.message }, 500)

  // Bust ISR caches so public guide/deal pages pick up the new flag immediately.
  revalidatePath('/', 'layout')
  revalidatePath('/guides', 'layout')
  revalidatePath('/deals', 'layout')

  return jsonResponse({
    success: true,
    showProductImages: enabled,
    message: enabled ? 'Product images are now visible' : 'Product images are now hidden',
  })
}
