import { SITE_URL } from '@/config/site'
import {
  AMAZON_CONFIG_KEYS,
  DEFAULT_AMAZON_AFFILIATE_CONFIG,
  SITE_ASSOCIATE_TAG,
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
    paapiPartnerTag: pick(map, 'amazon_paapi_partner_tag', d.paapiPartnerTag),
    marketplace: pick(map, 'amazon_marketplace', d.marketplace),
    creatorsApiVersion: pick(map, 'amazon_creators_api_version', d.creatorsApiVersion),
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
    { key: 'amazon_paapi_partner_tag', value: draft.paapiPartnerTag.trim() },
    { key: 'amazon_marketplace', value: draft.marketplace.trim() || 'www.amazon.com' },
    {
      key: 'amazon_creators_api_version',
      value: draft.creatorsApiVersion.trim() || '3.1',
    },
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
  const partnerTag = config.paapiPartnerTag.trim() || config.associateTag.trim()
  return config.hasPaapiAccessKey && config.hasPaapiSecretKey && Boolean(partnerTag)
}

export function resolvePaapiPartnerTag(config: {
  associateTag: string
  paapiPartnerTag?: string
}): string {
  return config.paapiPartnerTag?.trim() || config.associateTag.trim()
}

/** Decode HTML entities in URLs parsed from Claude HTML before re-escaping for output. */
export function normalizeAffiliateUrl(href: string): string {
  return href
    .trim()
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/g, '&')
    .replace(/\\u0026/gi, '&')
}

/** Resolve the site link-tracking tag (never the Creators API partner tag). */
export function resolveAssociateTag(tag?: string | null): string {
  const trimmed = tag?.trim()
  return trimmed || SITE_ASSOCIATE_TAG
}

/**
 * Force `tag=` on Amazon product/search URLs to the site associate tag.
 * Leaves non-Amazon URLs unchanged.
 */
export function applyAssociateTagToUrl(
  href: string | null | undefined,
  associateTag: string = SITE_ASSOCIATE_TAG,
): string {
  const raw = normalizeAffiliateUrl(href ?? '')
  if (!raw) return raw
  const tag = resolveAssociateTag(associateTag)

  // Fast path: already the correct tag.
  if (new RegExp(`[?&]tag=${escapeRegExp(tag)}(?:[&]|$)`, 'i').test(raw) && /amazon\./i.test(raw)) {
    return raw
  }

  try {
    const url = new URL(raw)
    if (!/(^|\.)amazon\./i.test(url.hostname)) return raw
    if (url.searchParams.get('tag') === tag) return raw
    url.searchParams.set('tag', tag)
    return url.toString()
  } catch {
    // Relative or malformed — still rewrite a bare tag= query if present.
    if (/[?&]tag=/i.test(raw)) {
      return raw.replace(/([?&]tag=)[^&#"'\s]*/gi, `$1${tag}`)
    }
    return raw
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Rewrite every Amazon `tag=` occurrence in HTML (articles, tables, CTAs). */
export function rewriteAmazonAssociateTagsInHtml(
  html: string,
  associateTag: string = SITE_ASSOCIATE_TAG,
): string {
  if (!html) return html
  const tag = resolveAssociateTag(associateTag)

  return html.replace(
    /\bhttps?:\/\/(?:www\.)?amazon\.[^\s"'<>]*/gi,
    (match) => applyAssociateTagToUrl(match, tag),
  )
}

export function isValidAsin(asin: string | null | undefined): boolean {
  return /^[A-Z0-9]{10}$/i.test(asin?.trim() ?? '')
}

export function normalizeAsin(asin: string | null | undefined): string {
  const raw = asin?.trim() ?? ''
  return isValidAsin(raw) ? raw.toUpperCase() : ''
}

export function buildAffiliateProductUrl(asin: string, associateTag: string): string {
  const id = asin.trim()
  const tag = resolveAssociateTag(associateTag)
  if (!/^[A-Z0-9]{10}$/i.test(id)) {
    return ''
  }
  return `https://www.amazon.com/dp/${id}?tag=${tag}&linkCode=ogi&th=1&psc=1`
}

export function buildAmazonSearchUrl(query: string, associateTag: string): string {
  const q = query.trim()
  if (!q) return 'https://www.amazon.com'
  const tag = resolveAssociateTag(associateTag)
  const base = `https://www.amazon.com/s?k=${encodeURIComponent(q)}`
  return `${base}&tag=${tag}`
}

export { AMAZON_CONFIG_KEYS }
