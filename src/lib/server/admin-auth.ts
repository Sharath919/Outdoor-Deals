import type { SupabaseClient } from '@supabase/supabase-js'

/** Must match migration is_site_admin() bootstrap list and checkAdmin.ts */
export const BOOTSTRAP_ADMIN_EMAILS = [
  'sharathchand19141@gmail.com',
  'sharathbroyt@gmail.com',
]

export async function isAdminAccessToken(
  supabase: SupabaseClient,
  accessToken: string,
): Promise<boolean> {
  if (!accessToken) return false

  const { data: userData, error } = await supabase.auth.getUser(accessToken)
  if (error || !userData.user) return false

  const email = userData.user.email?.toLowerCase().trim()
  if (email && BOOTSTRAP_ADMIN_EMAILS.includes(email)) return true

  const { data } = await supabase
    .from('admin_users')
    .select('id')
    .eq('id', userData.user.id)
    .maybeSingle()

  return Boolean(data)
}

export function isCronSecretToken(token: string): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  return Boolean(secret && token === secret)
}
