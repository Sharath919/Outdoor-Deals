/**
 * Server-only Amazon affiliate config reader.
 * Env vars win over ai_config (for Railway overrides).
 */

import { createServerSupabase } from '@/lib/supabase'
import {
  buildAmazonAffiliateConfigFromRows,
  isPaapiConfigured,
  resolvePaapiPartnerTag,
} from '@/utils/amazonAffiliateConfig'
import {
  AMAZON_CONFIG_KEYS,
  SHOW_PRODUCT_IMAGES_KEY,
  type AmazonAffiliateServerConfig,
} from '@/types/amazonAffiliate'

function envOr(stored: string, envKey: string): string {
  const fromEnv = process.env[envKey]?.trim()
  if (fromEnv) return fromEnv
  return stored
}

export async function readAmazonAffiliateServerConfig(): Promise<AmazonAffiliateServerConfig> {
  const supabase = createServerSupabase()
  let rows: { key: string; value: unknown }[] = []

  if (supabase) {
    const { data } = await supabase
      .from('ai_config')
      .select('key, value')
      .in('key', [...AMAZON_CONFIG_KEYS])
    rows = data ?? []
  }

  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const publicConfig = buildAmazonAffiliateConfigFromRows(rows)

  // Prefer Creators env names; fall back to legacy PAAPI_* for compatibility.
  const accessKey =
    envOr(configValue(map.amazon_paapi_access_key), 'CREATORS_API_CREDENTIAL_ID') ||
    envOr(configValue(map.amazon_paapi_access_key), 'PAAPI_ACCESS_KEY')
  const secretKey =
    envOr(configValue(map.amazon_paapi_secret_key), 'CREATORS_API_CREDENTIAL_SECRET') ||
    envOr(configValue(map.amazon_paapi_secret_key), 'PAAPI_SECRET_KEY')

  return {
    associateTag:
      envOr(publicConfig.associateTag, 'ASSOCIATE_TAG') ||
      envOr(publicConfig.associateTag, 'AMAZON_ASSOCIATE_TAG'),
    paapiPartnerTag:
      envOr(publicConfig.paapiPartnerTag, 'PAAPI_PARTNER_TAG') ||
      publicConfig.paapiPartnerTag.trim() ||
      publicConfig.associateTag.trim(),
    marketplace: envOr(publicConfig.marketplace, 'MARKETPLACE') || 'www.amazon.com',
    creatorsApiVersion:
      envOr(publicConfig.creatorsApiVersion, 'CREATORS_API_VERSION') ||
      publicConfig.creatorsApiVersion ||
      '3.1',
    siteName: envOr(publicConfig.siteName, 'SITE_NAME'),
    siteUrl: envOr(publicConfig.siteUrl, 'SITE_URL'),
    accentColor: envOr(publicConfig.accentColor, 'ACCENT_COLOR'),
    authorName: envOr(publicConfig.authorName, 'AUTHOR_NAME'),
    authorInitials: envOr(publicConfig.authorInitials, 'AUTHOR_INITIALS'),
    disclosureText: publicConfig.disclosureText,
    paapiAccessKey: accessKey,
    paapiSecretKey: secretKey,
  }
}

function configValue(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  return String(raw)
}

export async function isAmazonPaapiAvailable(): Promise<boolean> {
  const config = await readAmazonAffiliateServerConfig()
  return Boolean(
    config.paapiAccessKey && config.paapiSecretKey && resolvePaapiPartnerTag(config),
  )
}

/**
 * Global toggle for displaying Amazon product images.
 * Defaults to false (hidden) so images stay off until an admin enables them
 * — e.g. after Amazon Associates approval and once our own API keys are live.
 */
export async function readShowProductImages(): Promise<boolean> {
  const supabase = createServerSupabase()
  if (!supabase) return false

  const { data } = await supabase
    .from('ai_config')
    .select('value')
    .eq('key', SHOW_PRODUCT_IMAGES_KEY)
    .maybeSingle()

  if (!data) return false
  const raw = typeof data.value === 'string' ? data.value : JSON.stringify(data.value)
  return raw.trim().toLowerCase() === 'true'
}

export { isPaapiConfigured }
