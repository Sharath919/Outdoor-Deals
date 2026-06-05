import type { AmazonAffiliateServerConfig } from '@/types/amazonAffiliate'

export type PaapiItem = Record<string, unknown>

export type PaapiCommonParams = {
  AccessKey: string
  SecretKey: string
  PartnerTag: string
  PartnerType: 'Associates'
  Marketplace: string
}

const PAAPI_RESOURCES = [
  'Images.Primary.Large',
  'Images.Primary.Medium',
  'ItemInfo.Title',
  'ItemInfo.ByLineInfo',
  'OffersV2.Listings.Price',
]

const SEARCH_INDEXES = ['SportingGoods', 'Outdoors', 'All'] as const

const CATEGORY_SEARCH_TERMS: Record<string, string> = {
  camping: 'camping tent',
  hiking: 'hiking gear',
  backpacking: 'backpacking gear',
  climbing: 'climbing gear',
  fishing: 'fishing gear',
  cycling: 'cycling gear',
  'winter-sports': 'winter camping gear',
  footwear: 'hiking boots',
  'sleep-systems': 'sleeping bag',
  cooking: 'camping stove',
  'general-gear': 'outdoor gear',
}

type PaapiClient = {
  SearchItemsV2: (
    common: PaapiCommonParams,
    request: Record<string, unknown>,
  ) => Promise<unknown>
  GetItemsV2: (
    common: PaapiCommonParams,
    request: Record<string, unknown>,
  ) => Promise<unknown>
}

export type PaapiLookupSuccess = {
  ok: true
  asin: string
  item: PaapiItem
}

export type PaapiLookupFailure = {
  ok: false
  errors: string[]
  fatal: boolean
}

export type PaapiLookupResult = PaapiLookupSuccess | PaapiLookupFailure

let clientPromise: Promise<PaapiClient | null> | null = null

async function getPaapiClient(): Promise<PaapiClient | null> {
  if (!clientPromise) {
    clientPromise = import('amazon-paapi')
      .then((mod) => (mod.default ?? mod) as PaapiClient)
      .catch((err) => {
        console.warn('[affiliate-pipeline] PA-API import failed:', err)
        return null
      })
  }
  return clientPromise
}

export function buildPaapiCommonParams(
  config: AmazonAffiliateServerConfig,
): PaapiCommonParams | null {
  if (!config.paapiAccessKey || !config.paapiSecretKey || !config.associateTag) return null
  return {
    AccessKey: config.paapiAccessKey,
    SecretKey: config.paapiSecretKey,
    PartnerTag: config.associateTag,
    PartnerType: 'Associates',
    Marketplace: config.marketplace || 'www.amazon.com',
  }
}

export function extractPaapiErrors(response: unknown): string[] {
  const errors =
    (response as { Errors?: Array<{ Code?: string; Message?: string }> })?.Errors ?? []
  return errors
    .map((e) => `${e.Code ?? 'Error'}: ${e.Message ?? 'Unknown PA-API error'}`)
    .filter(Boolean)
}

function isFatalPaapiError(errors: string[]): boolean {
  return errors.some((e) => /Invalid|Access|Signature|Credential|Associate|NotEligible|Quota/i.test(e))
}

export function extractSearchItems(response: unknown): PaapiItem[] {
  return (response as { SearchResult?: { Items?: PaapiItem[] } })?.SearchResult?.Items ?? []
}

export function isValidPaapiItem(item: PaapiItem | undefined): boolean {
  if (!item) return false
  const info = item.ItemInfo as Record<string, unknown> | undefined
  const titleObj = info?.Title as { DisplayValue?: string } | undefined
  return Boolean(titleObj?.DisplayValue?.trim())
}

export function buildSearchQueries(keywords: string, category?: string | null): string[] {
  const base = keywords.trim()
  if (!base) return []

  const queries = new Set<string>([base])
  const lower = base.toLowerCase()

  const categoryTerm = category ? CATEGORY_SEARCH_TERMS[category] : null
  if (categoryTerm && !lower.includes(categoryTerm.split(' ')[0])) {
    queries.add(`${base} ${categoryTerm}`)
  }

  if (/\binflat/i.test(base) && !/\btent\b/i.test(lower)) {
    queries.add(`${base} inflatable tent`)
  }
  if (/\b(headlamp|headlight|tent|backpack|sleeping bag|stove|cooler)\b/i.test(base)) {
    // already names a product type
  } else {
    queries.add(`${base} camping`)
  }

  return [...queries]
}

export async function searchProductByKeywords(
  keywords: string,
  config: AmazonAffiliateServerConfig,
  category?: string | null,
): Promise<PaapiLookupResult> {
  const common = buildPaapiCommonParams(config)
  const client = await getPaapiClient()
  if (!common || !client) {
    return { ok: false, errors: ['PA-API client unavailable — check access key, secret key, and associate tag'], fatal: false }
  }

  const queries = buildSearchQueries(keywords, category)
  let lastErrors: string[] = []

  for (const query of queries) {
    for (const searchIndex of SEARCH_INDEXES) {
      try {
        const response = await client.SearchItemsV2(common, {
          Keywords: query,
          SearchIndex: searchIndex,
          ItemCount: 3,
          Resources: PAAPI_RESOURCES,
        })

        const errors = extractPaapiErrors(response)
        if (errors.length) {
          lastErrors = errors
          console.warn(
            `[affiliate-pipeline] SearchItems ${searchIndex} "${query}":`,
            errors.join('; '),
          )
          if (isFatalPaapiError(errors)) {
            return { ok: false, errors, fatal: true }
          }
          continue
        }

        const items = extractSearchItems(response)
        const match = items.find(isValidPaapiItem)
        if (match) {
          const asin = String((match as { ASIN?: string }).ASIN ?? '')
          if (asin) return { ok: true, asin, item: match }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        lastErrors = [message]
        console.error(`[affiliate-pipeline] SearchItems ${searchIndex} failed:`, message)
      }
    }
  }

  if (lastErrors.length) {
    console.warn('[affiliate-pipeline] SearchItems exhausted:', lastErrors.join('; '))
  }
  return { ok: false, errors: lastErrors, fatal: false }
}

export async function getItemByAsin(
  asin: string,
  config: AmazonAffiliateServerConfig,
): Promise<PaapiLookupResult> {
  const common = buildPaapiCommonParams(config)
  const client = await getPaapiClient()
  if (!common || !client || !asin) {
    return { ok: false, errors: ['PA-API client unavailable — check access key, secret key, and associate tag'], fatal: false }
  }

  try {
    const response = await client.GetItemsV2(common, {
      ItemIds: [asin],
      Resources: PAAPI_RESOURCES,
    })

    const errors = extractPaapiErrors(response)
    if (errors.length) {
      console.warn(`[affiliate-pipeline] GetItems ${asin}:`, errors.join('; '))
      return { ok: false, errors, fatal: isFatalPaapiError(errors) }
    }

    const items =
      (response as { ItemsResult?: { Items?: PaapiItem[] } })?.ItemsResult?.Items ?? []
    const match = items.find(isValidPaapiItem)
    if (!match) {
      return { ok: false, errors: [`No catalog item returned for ASIN ${asin}`], fatal: false }
    }
    return { ok: true, asin, item: match }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[affiliate-pipeline] GetItems ${asin} failed:`, message)
    return { ok: false, errors: [message], fatal: false }
  }
}

/** Lightweight connectivity check for Admin settings. */
export async function testPaapiConnection(
  config: AmazonAffiliateServerConfig,
): Promise<PaapiLookupResult> {
  return searchProductByKeywords('Petzl Tikka headlamp', config, 'camping')
}
