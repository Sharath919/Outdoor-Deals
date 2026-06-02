import { SITE_URL } from '@/config/site'
import {
  AMAZON_CONFIG_KEYS,
  DEFAULT_AMAZON_AFFILIATE_CONFIG,
  type AmazonAffiliateConfig,
  type AmazonConfigKey,
} from '@/types/amazonAffiliate'

function configValue(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  return String(raw)
}

function pick(map: Record<string, unknown>, key: AmazonConfigKey, fallback: string): string {
  const v = configValue(map[key]).trim()
  return v || fallback
}

export function buildAmazonAffiliateConfigFromRows(
  rows: { key: string; value: unknown }[],
): AmazonAffiliateConfig {
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const d = {
    ...DEFAULT_AMAZON_AFFILIATE_CONFIG,
    siteUrl: SITE_URL,
  }

  const accessKey = configValue(map.amazon_paapi_access_key).trim()
  const secretKey = configValue(map.amazon_paapi_secret_key).trim()

  return {
    associateTag: pick(map, 'amazon_associate_tag', d.associateTag),
    marketplace: pick(map, 'amazon_marketplace', d.marketplace),
    siteName: pick(map, 'amazon_site_name', d.siteName),
    siteUrl: pick(map, 'amazon_site_url', d.siteUrl),
    accentColor: pick(map, 'amazon_accent_color', d.accentColor),
    authorName: pick(map, 'amazon_author_name', d.authorName),
    authorInitials: pick(map, 'amazon_author_initials', d.authorInitials),
    disclosureText: pick(map, 'amazon_disclosure_text', d.disclosureText),
    hasPaapiAccessKey: accessKey.length > 0,
    hasPaapiSecretKey: secretKey.length > 0,
  }
}

export type AmazonAffiliateDraft = Omit<
  AmazonAffiliateConfig,
  'hasPaapiAccessKey' | 'hasPaapiSecretKey'
> & {
  paapiAccessKeyInput: string
  paapiSecretKeyInput: string
}

export function draftFromConfig(config: AmazonAffiliateConfig): AmazonAffiliateDraft {
  const { hasPaapiAccessKey: _a, hasPaapiSecretKey: _s, ...rest } = config
  return {
    ...rest,
    paapiAccessKeyInput: '',
    paapiSecretKeyInput: '',
  }
}

export function configToUpsertRows(
  draft: AmazonAffiliateDraft,
  existing: Pick<AmazonAffiliateConfig, 'hasPaapiAccessKey' | 'hasPaapiSecretKey'>,
): { key: AmazonConfigKey; value: string }[] {
  const rows: { key: AmazonConfigKey; value: string }[] = [
    { key: 'amazon_associate_tag', value: draft.associateTag.trim() },
    { key: 'amazon_marketplace', value: draft.marketplace.trim() || 'www.amazon.com' },
    { key: 'amazon_site_name', value: draft.siteName.trim() },
    { key: 'amazon_site_url', value: draft.siteUrl.trim() },
    { key: 'amazon_accent_color', value: draft.accentColor.trim() },
    { key: 'amazon_author_name', value: draft.authorName.trim() },
    { key: 'amazon_author_initials', value: draft.authorInitials.trim() },
    { key: 'amazon_disclosure_text', value: draft.disclosureText.trim() },
  ]

  if (draft.paapiAccessKeyInput.trim()) {
    rows.push({ key: 'amazon_paapi_access_key', value: draft.paapiAccessKeyInput.trim() })
  } else if (existing.hasPaapiAccessKey) {
    // preserve — omit from upsert batch (handled by caller)
  }

  if (draft.paapiSecretKeyInput.trim()) {
    rows.push({ key: 'amazon_paapi_secret_key', value: draft.paapiSecretKeyInput.trim() })
  }

  return rows
}

export function isPaapiConfigured(config: AmazonAffiliateConfig): boolean {
  return config.hasPaapiAccessKey && config.hasPaapiSecretKey && Boolean(config.associateTag)
}

export function buildAffiliateProductUrl(asin: string, associateTag: string): string {
  const tag = associateTag.trim()
  if (!tag) return `https://www.amazon.com/dp/${asin}`
  return `https://www.amazon.com/dp/${asin}?tag=${tag}&linkCode=ogi&th=1&psc=1`
}

export { AMAZON_CONFIG_KEYS }
