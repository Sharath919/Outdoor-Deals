import type { SupabaseClient } from '@supabase/supabase-js'

const CACHE_KEY = 'amazon_paapi_cache'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export type PaapiCacheEntry = Record<string, unknown> & { _fetched_at?: string }

export async function loadPaapiCache(supabase: SupabaseClient): Promise<Record<string, PaapiCacheEntry>> {
  const { data } = await supabase.from('ai_config').select('value').eq('key', CACHE_KEY).maybeSingle()
  if (!data?.value || typeof data.value !== 'object' || Array.isArray(data.value)) return {}
  return data.value as Record<string, PaapiCacheEntry>
}

export async function savePaapiCache(
  supabase: SupabaseClient,
  cache: Record<string, PaapiCacheEntry>,
): Promise<void> {
  await supabase.from('ai_config').upsert({
    key: CACHE_KEY,
    value: cache,
    updated_at: new Date().toISOString(),
  })
}

export function isCacheStale(entry: PaapiCacheEntry | undefined, maxAgeMs = MAX_AGE_MS): boolean {
  if (!entry?._fetched_at) return true
  const age = Date.now() - new Date(entry._fetched_at).getTime()
  return age > maxAgeMs
}

export function mergeCache(
  existing: Record<string, PaapiCacheEntry>,
  asin: string,
  item: Record<string, unknown>,
): Record<string, PaapiCacheEntry> {
  return {
    ...existing,
    [asin]: { ...item, _fetched_at: new Date().toISOString() },
  }
}
