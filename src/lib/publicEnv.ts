/** Runtime public env — server reads process.env; browser reads window.__OUTDOOR_DEALS_ENV__. */

export type OutdoorDealsPublicEnv = {
  supabaseUrl: string
  supabaseAnonKey: string
  siteUrl: string
}

declare global {
  interface Window {
    __OUTDOOR_DEALS_ENV__?: OutdoorDealsPublicEnv
  }
}

export function readPublicEnvFromProcess(): OutdoorDealsPublicEnv {
  return {
    supabaseUrl: (
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      process.env.VITE_SUPABASE_URL ??
      ''
    ).trim(),
    supabaseAnonKey: (
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.VITE_SUPABASE_ANON_KEY ??
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
      ''
    ).trim(),
    siteUrl: (
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.VITE_SITE_URL ??
      ''
    ).trim(),
  }
}

export function readPublicEnv(): OutdoorDealsPublicEnv {
  if (typeof window !== 'undefined' && window.__OUTDOOR_DEALS_ENV__) {
    const runtime = window.__OUTDOOR_DEALS_ENV__
    if (runtime.supabaseUrl && runtime.supabaseAnonKey) return runtime
  }
  return readPublicEnvFromProcess()
}

export function publicEnvScript(env: OutdoorDealsPublicEnv): string {
  return `window.__OUTDOOR_DEALS_ENV__=${JSON.stringify(env)};`
}
