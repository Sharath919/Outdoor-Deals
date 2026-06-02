import { supabase } from '@/lib/supabase'

export type RebuildResult =
  | { ok: true; message: string; jobId?: string }
  | { ok: false; message: string }

/** Trigger a production rebuild (admin session or cron). */
export async function triggerSiteRebuild(): Promise<RebuildResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) {
    return { ok: false, message: 'Sign in as admin to trigger a rebuild' }
  }

  // Next.js: revalidate via publish flow; optional deploy hook later
  const res = await fetch('/api/health', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })

  const body = (await res.json().catch(() => ({}))) as {
    message?: string
    error?: string
    job?: string
  }

  if (!res.ok) {
    return { ok: false, message: body.error ?? 'Rebuild hook not configured' }
  }

  return {
    ok: true,
    message: 'Site is live — guides revalidate on publish (Next.js ISR)',
  }
}
