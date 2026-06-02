import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readPublicEnv } from '@/lib/publicEnv'

export type Tier = 'free' | 'seeker' | 'oracle'
export type ProfileRole = 'user' | 'writer' | 'admin'

export interface Profile {
  id: string
  name: string | null
  email: string
  tier?: Tier
  role?: ProfileRole
  created_at: string
}

const authOptions = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce' as const,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
}

let browserClient: SupabaseClient | null = null
let serverClient: SupabaseClient | null = null

function resolveCredentials() {
  const env = readPublicEnv()
  return {
    url: env.supabaseUrl || 'https://placeholder.supabase.co',
    key: env.supabaseAnonKey || 'placeholder-anon-key',
  }
}

function getBrowserClient(): SupabaseClient {
  if (!browserClient) {
    const { url, key } = resolveCredentials()
    browserClient = createClient(url, key, authOptions)
  }
  return browserClient
}

function getServerAnonClient(): SupabaseClient {
  if (!serverClient) {
    const { url, key } = resolveCredentials()
    serverClient = createClient(url, key, authOptions)
  }
  return serverClient
}

function getClient(): SupabaseClient {
  return typeof window === 'undefined' ? getServerAnonClient() : getBrowserClient()
}

/** Lazy proxy so client bundle can pick up runtime env injected in layout. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient()
    const value = Reflect.get(client, prop, client)
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  },
})

export function createServerSupabase(): SupabaseClient | null {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !key) return null
  return createClient(url, key)
}
