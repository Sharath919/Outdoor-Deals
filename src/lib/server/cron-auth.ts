import { createClient } from '@supabase/supabase-js'

const BOOTSTRAP_ADMIN_EMAILS = [
  'sharathchand19141@gmail.com',
  'sharathbroyt@gmail.com',
]

async function isAdminUser(accessToken: string): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return false

  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userData.user) return false

  const email = userData.user.email?.toLowerCase().trim()
  if (email && BOOTSTRAP_ADMIN_EMAILS.includes(email)) return true

  const { data } = await supabase
    .from('admin_users')
    .select('id')
    .eq('id', userData.user.id)
    .maybeSingle()

  return !!data
}

export async function isCronAuthorizedRequest(request: Request): Promise<boolean> {
  if (request.headers.get('x-vercel-cron') === '1') return true

  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!token) return false
  if (token === process.env.CRON_SECRET) return true
  return isAdminUser(token)
}
