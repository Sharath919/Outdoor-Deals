import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase service role is not configured')
  }
  return createClient(url, key)
}

export async function getUserFromBearer(
  authHeader: string | undefined,
): Promise<User | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) return null

  const anonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY
  if (anonKey && token === anonKey) return null

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

export async function consumeReadingCredit(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc('use_credit', { p_user_id: userId })
  if (error) {
    console.error('[credits] use_credit RPC failed:', error.message)
    return false
  }
  return data === true
}
