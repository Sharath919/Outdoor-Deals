/** Admin-only: article machine tests + WordPress admin helpers (no extra Vercel function). */

import { createClient } from '@supabase/supabase-js'
import { TEMPLATE_HUMAN_NAMES } from '@/config/articleMachinePrompts'
import { getBuiltInArticleMachinePrompt } from '@/config/defaultArticleMachinePrompts'

export const maxDuration = 60

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const BOOTSTRAP_ADMIN_EMAILS = [
  'sharathchand19141@gmail.com',
  'sharathbroyt@gmail.com',
]


function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function getServerSupabase() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey)
}

async function isAdmin(token: string): Promise<boolean> {
  const supabase = getServerSupabase()
  if (!supabase) return false
  const { data: userData, error } = await supabase.auth.getUser(token)
  if (error || !userData.user) return false
  const email = userData.user.email?.toLowerCase().trim()
  if (email && BOOTSTRAP_ADMIN_EMAILS.includes(email)) return true
  const { data } = await supabase
    .from('admin_users')
    .select('id')
    .eq('id', userData.user.id)
    .maybeSingle()
  return !!data
}

async function readConfigKey(key: string): Promise<string> {
  const supabase = getServerSupabase()
  if (!supabase) throw new Error('Server configuration error')
  const { data, error } = await supabase.from('ai_config').select('value').eq('key', key).maybeSingle()
  if (error) throw new Error(error.message)
  const v = data?.value
  return typeof v === 'string' ? v : JSON.stringify(v ?? '')
}

function templateTypeToPromptConfigKey(templateType: string): string {
  return `article_machine_prompt_${templateType.trim().replace(/-/g, '_')}`
}

async function resolveArticleMachinePrompt(templateType: string): Promise<string> {
  const templatePromptKey = templateTypeToPromptConfigKey(templateType)
  const templatePrompt = await readConfigKey(templatePromptKey)
  if (templatePrompt.trim()) return templatePrompt

  const builtIn = getBuiltInArticleMachinePrompt(templatePromptKey)
  if (builtIn) return builtIn

  const defaultPrompt = await readConfigKey('article_machine_prompt_default')
  if (defaultPrompt.trim()) return defaultPrompt

  const legacyPrompt = await readConfigKey('article_machine_prompt')
  if (legacyPrompt.trim()) return legacyPrompt

  return getBuiltInArticleMachinePrompt('article_machine_prompt_default')
}

async function readWpCredentials(): Promise<{
  wp_site_url: string
  wp_username: string
  wp_app_password: string
}> {
  const supabase = getServerSupabase()
  if (!supabase) throw new Error('Server configuration error')
  const { data, error } = await supabase
    .from('ai_config')
    .select('key, value')
    .in('key', ['wp_site_url', 'wp_username', 'wp_app_password'])
  if (error) throw new Error(error.message)
  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    map[row.key] = typeof row.value === 'string' ? row.value : String(row.value ?? '')
  }
  return {
    wp_site_url: map.wp_site_url || '',
    wp_username: map.wp_username || '',
    wp_app_password: map.wp_app_password || '',
  }
}

async function callClaude(params: {
  systemPrompt: string
  userMessage: string
}): Promise<string> {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      system: params.systemPrompt,
      messages: [{ role: 'user', content: params.userMessage }],
    }),
    signal: AbortSignal.timeout(40_000),
  })
  const data = (await res.json().catch(() => ({}))) as {
    content?: Array<{ type: string; text?: string }>
    error?: { message?: string }
  }
  if (!res.ok) throw new Error(data.error?.message || `Claude API error (${res.status})`)
  const text = data.content?.[0]?.text ?? ''
  if (!text.trim()) throw new Error('Empty Claude response')
  return text
}

async function handlePost(request: Request): Promise<Response> {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return jsonResponse({ error: 'Unauthorized' }, 401)
  if (!(await isAdmin(token))) return jsonResponse({ error: 'Forbidden' }, 403)

  const body = (await request.json().catch(() => ({}))) as {
    action?: string
    card_name?: string
    template_type?: string
    topic?: string
    wp_site_url?: string
    wp_username?: string
    wp_app_password?: string
  }

  const action = (body.action || 'generate').trim()

  if (action.startsWith('wp_')) {
    return jsonResponse({ error: 'WordPress actions are not used on Outdoor Deals' }, 400)
  }

  const topic = (body.topic || body.card_name || 'best camping tent under 200').trim()
  const templateType = (body.template_type || 'roundup-under-budget').trim()
  const templateHuman = TEMPLATE_HUMAN_NAMES[templateType] || templateType

  const systemPrompt = await resolveArticleMachinePrompt(templateType)
  if (!systemPrompt.trim()) throw new Error('System prompt not configured')

  const output = await callClaude({
    systemPrompt,
    userMessage: `Write a commercial affiliate buying guide about: ${topic}. Style: ${templateHuman}.`,
  })
  return jsonResponse({ output })
}

export async function handleTestArticleMachine(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(request.url)
  const isGeminiHealth =
    url.searchParams.get('route') === 'gemini-health' || url.pathname.endsWith('/gemini-health')
  if (isGeminiHealth) {
    if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405)
    const apiKey = (process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY || '').trim()
    if (!apiKey) return jsonResponse({ ok: true, configured: false, provider: 'replicate' })
    return jsonResponse({ ok: true, configured: true, reachable: true, provider: 'replicate' })
  }

  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
  try {
    return await handlePost(request)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: message }, 500)
  }
}
