import { createClient } from '@supabase/supabase-js'
import { isCronAuthorizedRequest } from './cron-auth'

function getServerSupabase() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    .trim()
    .replace(/\/$/, '')
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey) as ReturnType<typeof createClient>
}

async function readAiConfig(supabase: ReturnType<typeof createClient>, key: string): Promise<string | null> {
  const { data, error } = await supabase.from('ai_config').select('value').eq('key', key).maybeSingle()
  if (error) throw new Error(`ai_config read failed (${key}): ${error.message}`)
  if (data?.value === null || data?.value === undefined) return null
  return typeof data.value === 'string' ? data.value : JSON.stringify(data.value)
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VITE_SITE_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')
}

export async function runCronPublishing(request: Request): Promise<Response> {
  if (!(await isCronAuthorizedRequest(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  if (!supabase) {
    return Response.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const enabled = (await readAiConfig(supabase, 'automation_enabled')) ?? 'true'
  if (enabled.trim().toLowerCase() === 'false') {
    return Response.json({ message: 'Automation is paused — no articles processed' })
  }

  await supabase
    .from('publishing_schedule')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('status', 'processing')
    .lt('updated_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())

  const today = todayIsoDate()
  const { data: scheduled, error } = await supabase
    .from('publishing_schedule')
    .select('*')
    .lte('scheduled_date', today)
    .eq('status', 'pending')
    .order('scheduled_date', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(5)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!scheduled?.length) {
    return Response.json({ message: 'No pending articles due on or before today', processed: 0 })
  }

  const siteUrl = siteOrigin()
  const cronSecret = process.env.CRON_SECRET || ''
  let succeeded = 0
  let failed = 0

  for (const item of scheduled as Array<{ id: string; card_name: string; template_type: string }>) {
    try {
      const fetchRes = await fetch(`${siteUrl}/api/generate-article`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({
          card_name: item.card_name,
          template_type: item.template_type,
          schedule_id: item.id,
        }),
        signal: AbortSignal.timeout(150_000),
      })

      if (fetchRes.ok) {
        succeeded++
      } else {
        failed++
        const body = (await fetchRes.json().catch(() => ({}))) as { error?: string }
        const errorText = body.error || `generate-article returned ${fetchRes.status}`
        await supabase
          .from('publishing_schedule')
          .update({
            status: 'failed',
            error_text: errorText,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id)
      }
    } catch (err) {
      failed++
      const timedOut =
        err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      await supabase
        .from('publishing_schedule')
        .update({
          status: 'failed',
          error_text: timedOut
            ? 'Generation timed out'
            : 'Network error calling generate-article',
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
    }
    await sleep(2000)
  }

  await supabase.from('ai_config').upsert({
    key: 'last_cron_run',
    value: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  return Response.json({
    message: 'Publishing schedule processed',
    processed: scheduled.length,
    succeeded,
    failed,
  })
}
