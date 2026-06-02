import { supabase } from './supabase'

const BOOTSTRAP_ADMIN_EMAILS = [
  'sharathchand19141@gmail.com',
  'sharathbroyt@gmail.com',
]

/**
 * Returns true if the user is in admin_users or the bootstrap email list
 * (fallback when table grants/RLS block the query).
 */
export async function checkIsAdmin(userId: string, email?: string | null): Promise<boolean> {
  const normalizedEmail = email?.toLowerCase().trim()

  const { data, error } = await supabase
    .from('admin_users')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (data) return true

  if (error) {
    console.error('[admin] admin_users query failed:', error.code, error.message)
    // Permission denied (42501) or missing table — try email bootstrap list
    if (
      normalizedEmail &&
      BOOTSTRAP_ADMIN_EMAILS.includes(normalizedEmail)
    ) {
      console.warn('[admin] using bootstrap email allowlist for', normalizedEmail)
      return true
    }
    return false
  }

  // No row — try app_config admin_emails, then bootstrap list
  if (normalizedEmail) {
    const { data: config } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'admin_emails')
      .maybeSingle()

    const list = config?.value as string[] | undefined
    if (Array.isArray(list) && list.map((e) => e.toLowerCase()).includes(normalizedEmail)) {
      return true
    }

    if (BOOTSTRAP_ADMIN_EMAILS.includes(normalizedEmail)) {
      return true
    }
  }

  return false
}
