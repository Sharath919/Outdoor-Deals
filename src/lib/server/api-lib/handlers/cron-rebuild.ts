import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const BOOTSTRAP_ADMIN_EMAILS = [
  'sharathchand19141@gmail.com',
  'sharathbroyt@gmail.com',
]

async function isAdminUser(accessToken: string): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return false

  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userData.user) return false

  const user = userData.user
  const email = user.email?.toLowerCase().trim()
  if (email && BOOTSTRAP_ADMIN_EMAILS.includes(email)) return true

  const { data } = await supabase
    .from('admin_users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  return !!data
}

export async function isCronAuthorized(req: VercelRequest): Promise<boolean> {
  if (req.headers['x-vercel-cron'] === '1') return true

  const authHeader = req.headers.authorization ?? req.headers.Authorization
  const token =
    typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '').trim() : ''

  if (!token) return false
  if (token === process.env.CRON_SECRET) return true
  return isAdminUser(token)
}

export async function handleCronRebuild(req: VercelRequest, res: VercelResponse) {
  if (!(await isCronAuthorized(req))) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const deployHook = process.env.VERCEL_DEPLOY_HOOK_URL
  if (!deployHook) {
    return res.status(500).json({ error: 'Deploy hook not configured' })
  }

  try {
    const response = await fetch(deployHook, { method: 'POST' })
    const data = (await response.json()) as { job?: { id?: string } }
    if (!response.ok) {
      return res.status(500).json({ error: 'Deploy hook returned an error', status: response.status })
    }
    return res.status(200).json({
      message: 'Rebuild triggered successfully',
      job: data.job?.id,
    })
  } catch {
    return res.status(500).json({ error: 'Failed to trigger rebuild' })
  }
}
