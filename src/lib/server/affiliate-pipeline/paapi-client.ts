import type { AmazonAffiliateServerConfig } from '@/types/amazonAffiliate'

export type PaapiItem = Record<string, unknown>

export type PaapiCommonParams = {
  AccessKey: string
  SecretKey: string
  PartnerTag: string
  PartnerType: 'Associates'
  Marketplace: string
  Version: string
}

const CREATORS_SEARCH_RESOURCES = [
  'images.primary.large',
  'images.primary.medium',
  'itemInfo.title',
  'itemInfo.byLineInfo',
]

const CREATORS_GET_RESOURCES = [...CREATORS_SEARCH_RESOURCES, 'offersV2.listings.price']

/** Valid US marketplace SearchIndex values (see catalog SearchItems docs). */
const SEARCH_INDEXES = ['All', 'SportsAndOutdoors', 'Apparel', 'GardenAndOutdoor'] as const

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

type TokenCache = {
  accessToken: string
  expiresAtMs: number
  cacheKey: string
}

let tokenCache: TokenCache | null = null

function tokenEndpointForVersion(version: string): string {
  const majorMinor = version.trim()
  if (majorMinor.startsWith('3.2')) return 'https://api.amazon.co.uk/auth/o2/token'
  if (majorMinor.startsWith('3.3')) return 'https://api.amazon.co.jp/auth/o2/token'
  // v3.1 (NA) and unknown fallbacks
  return 'https://api.amazon.com/auth/o2/token'
}

export function buildPaapiCommonParams(
  config: AmazonAffiliateServerConfig,
): PaapiCommonParams | null {
  const partnerTag = config.paapiPartnerTag?.trim() || config.associateTag?.trim()
  if (!config.paapiAccessKey || !config.paapiSecretKey || !partnerTag) return null
  return {
    AccessKey: config.paapiAccessKey,
    SecretKey: config.paapiSecretKey,
    PartnerTag: partnerTag,
    PartnerType: 'Associates',
    Marketplace: config.marketplace || 'www.amazon.com',
    Version: config.creatorsApiVersion?.trim() || '3.1',
  }
}

export function extractPaapiErrors(response: unknown): string[] {
  const errors =
    (response as { Errors?: Array<{ Code?: string; Message?: string }> })?.Errors ??
    (response as { errors?: Array<{ code?: string; message?: string }> })?.errors ??
    []
  return errors
    .map((e) => {
      const code = ('Code' in e ? e.Code : e.code) ?? 'Error'
      const message = ('Message' in e ? e.Message : e.message) ?? 'Unknown Creators API error'
      return `${code}: ${message}`
    })
    .filter(Boolean)
}

function isFatalPaapiError(errors: string[]): boolean {
  return errors.some((e) =>
    /Invalid|Access|Signature|Credential|Associate|NotEligible|Quota|Unauthorized|Forbidden|deprecate/i.test(
      e,
    ),
  )
}

function formatThrownPaapiError(err: unknown): string[] {
  if (err instanceof Error && err.message) return [err.message]
  return [String(err)]
}

/** Normalize Creators API camelCase items into the PascalCase shape used by hydration. */
export function normalizeCreatorsItem(raw: Record<string, unknown>): PaapiItem {
  const images = raw.images as
    | {
        primary?: {
          large?: { url?: string; height?: number; width?: number }
          medium?: { url?: string; height?: number; width?: number }
        }
      }
    | undefined
  const itemInfo = raw.itemInfo as
    | {
        title?: { displayValue?: string }
        byLineInfo?: { brand?: { displayValue?: string } }
      }
    | undefined
  const offersV2 = raw.offersV2 as
    | {
        listings?: Array<{
          price?: {
            displayAmount?: string
            money?: { displayAmount?: string; amount?: number; currency?: string }
          }
        }>
      }
    | undefined

  const listings =
    offersV2?.listings?.map((listing) => {
      const displayAmount =
        listing.price?.money?.displayAmount ?? listing.price?.displayAmount ?? undefined
      return {
        Price: {
          DisplayAmount: displayAmount,
          Money: displayAmount
            ? {
                DisplayAmount: displayAmount,
                Amount: listing.price?.money?.amount,
                Currency: listing.price?.money?.currency,
              }
            : undefined,
        },
      }
    }) ?? []

  return {
    ASIN: raw.asin,
    DetailPageURL: raw.detailPageURL,
    Images: {
      Primary: {
        Large: images?.primary?.large?.url
          ? {
              URL: images.primary.large.url,
              Height: images.primary.large.height,
              Width: images.primary.large.width,
            }
          : undefined,
        Medium: images?.primary?.medium?.url
          ? {
              URL: images.primary.medium.url,
              Height: images.primary.medium.height,
              Width: images.primary.medium.width,
            }
          : undefined,
      },
    },
    ItemInfo: {
      Title: itemInfo?.title?.displayValue
        ? { DisplayValue: itemInfo.title.displayValue }
        : undefined,
      ByLineInfo: itemInfo?.byLineInfo?.brand?.displayValue
        ? { Brand: { DisplayValue: itemInfo.byLineInfo.brand.displayValue } }
        : undefined,
    },
    OffersV2: listings.length ? { Listings: listings } : undefined,
  }
}

export function extractSearchItems(response: unknown): PaapiItem[] {
  const camel =
    (response as { searchResult?: { items?: Record<string, unknown>[] } })?.searchResult?.items ??
    []
  if (camel.length) return camel.map((item) => normalizeCreatorsItem(item))

  return (
    (response as { SearchResult?: { Items?: PaapiItem[] } })?.SearchResult?.Items ?? []
  ).map((item) =>
    item.Images || item.ItemInfo ? item : normalizeCreatorsItem(item as Record<string, unknown>),
  )
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
  const namesProductType =
    /\b(headlamp|headlight|tent|backpack|sleeping bag|stove|cooler|hat|cap|bucket|beanie|gloves?|jacket|shirt|pants|shorts|socks|boots?|shoes?)\b/i.test(
      base,
    )
  if (!namesProductType) {
    queries.add(`${base} camping`)
  }

  return [...queries]
}

async function getAccessToken(common: PaapiCommonParams): Promise<string> {
  const cacheKey = `${common.AccessKey}:${common.Version}`
  const now = Date.now()
  if (tokenCache && tokenCache.cacheKey === cacheKey && tokenCache.expiresAtMs > now + 60_000) {
    return tokenCache.accessToken
  }

  const endpoint = tokenEndpointForVersion(common.Version)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: common.AccessKey,
      client_secret: common.SecretKey,
      scope: 'creatorsapi::default',
    }),
  })

  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }

  if (!response.ok || !json.access_token) {
    const detail = json.error_description || json.error || `HTTP ${response.status}`
    throw new Error(`Creators API token failed: ${detail}`)
  }

  const expiresInSec = typeof json.expires_in === 'number' ? json.expires_in : 3600
  tokenCache = {
    accessToken: json.access_token,
    expiresAtMs: now + expiresInSec * 1000,
    cacheKey,
  }
  return json.access_token
}

async function creatorsRequest(
  common: PaapiCommonParams,
  path: '/catalog/v1/searchItems' | '/catalog/v1/getItems',
  payload: Record<string, unknown>,
): Promise<unknown> {
  const accessToken = await getAccessToken(common)
  const response = await fetch(`https://creatorsapi.amazon${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-marketplace': common.Marketplace,
    },
    body: JSON.stringify({
      ...payload,
      partnerTag: common.PartnerTag,
      partnerType: common.PartnerType,
      marketplace: common.Marketplace,
    }),
  })

  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    const errors = extractPaapiErrors(json)
    if (errors.length) {
      const error = new Error(errors.join('; ')) as Error & { response?: { body: unknown } }
      error.response = { body: json }
      throw error
    }
    throw new Error(`Creators API ${path} failed (HTTP ${response.status})`)
  }

  return json
}

async function runSearchItems(
  common: PaapiCommonParams,
  request: Record<string, unknown>,
): Promise<PaapiLookupResult> {
  try {
    const response = await creatorsRequest(common, '/catalog/v1/searchItems', request)
    const errors = extractPaapiErrors(response)
    if (errors.length) {
      return { ok: false, errors, fatal: isFatalPaapiError(errors) }
    }

    const items = extractSearchItems(response)
    const match = items.find(isValidPaapiItem)
    if (!match) {
      return { ok: false, errors: ['No matching catalog items in search response'], fatal: false }
    }

    const asin = String((match as { ASIN?: string }).ASIN ?? '')
    if (!asin) {
      return { ok: false, errors: ['Search response missing ASIN'], fatal: false }
    }
    return { ok: true, asin, item: match }
  } catch (err) {
    const errors = formatThrownPaapiError(err)
    const body = (err as { response?: { body?: unknown } })?.response?.body
    const amazonErrors = extractPaapiErrors(body)
    return {
      ok: false,
      errors: amazonErrors.length ? amazonErrors : errors,
      fatal: isFatalPaapiError(amazonErrors.length ? amazonErrors : errors),
    }
  }
}

export async function searchProductByKeywords(
  keywords: string,
  config: AmazonAffiliateServerConfig,
  category?: string | null,
): Promise<PaapiLookupResult> {
  const common = buildPaapiCommonParams(config)
  if (!common) {
    return {
      ok: false,
      errors: [
        'Creators API unavailable — check credential ID, credential secret, and partner tag',
      ],
      fatal: false,
    }
  }

  const queries = buildSearchQueries(keywords, category)
  let lastErrors: string[] = []

  for (const query of queries) {
    for (const searchIndex of SEARCH_INDEXES) {
      const result = await runSearchItems(common, {
        keywords: query,
        searchIndex,
        itemCount: 3,
        resources: CREATORS_SEARCH_RESOURCES,
      })

      if (result.ok) return result

      lastErrors = result.errors
      console.warn(
        `[affiliate-pipeline] SearchItems ${searchIndex} "${query}":`,
        result.errors.join('; '),
      )
      if (result.fatal) return result
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
  if (!common || !asin) {
    return {
      ok: false,
      errors: [
        'Creators API unavailable — check credential ID, credential secret, and partner tag',
      ],
      fatal: false,
    }
  }

  try {
    const response = await creatorsRequest(common, '/catalog/v1/getItems', {
      itemIds: [asin],
      itemIdType: 'ASIN',
      resources: CREATORS_GET_RESOURCES,
    })

    const errors = extractPaapiErrors(response)
    if (errors.length) {
      console.warn(`[affiliate-pipeline] GetItems ${asin}:`, errors.join('; '))
      return { ok: false, errors, fatal: isFatalPaapiError(errors) }
    }

    const camelItems =
      (response as { itemsResult?: { items?: Record<string, unknown>[] } })?.itemsResult?.items ??
      []
    const items = camelItems.length
      ? camelItems.map((item) => normalizeCreatorsItem(item))
      : ((response as { ItemsResult?: { Items?: PaapiItem[] } })?.ItemsResult?.Items ?? [])

    const match = items.find(isValidPaapiItem)
    if (!match) {
      return { ok: false, errors: [`No catalog item returned for ASIN ${asin}`], fatal: false }
    }
    return { ok: true, asin, item: match }
  } catch (err) {
    const body = (err as { response?: { body?: unknown } })?.response?.body
    const amazonErrors = extractPaapiErrors(body)
    const errors = amazonErrors.length ? amazonErrors : formatThrownPaapiError(err)
    console.error(`[affiliate-pipeline] GetItems ${asin} failed:`, errors.join('; '))
    return { ok: false, errors, fatal: isFatalPaapiError(errors) }
  }
}

const PRICE_CHECK_RESOURCES = ['offersV2.listings.price']

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type PaapiBatchItemResult = {
  asin: string
  item: PaapiItem | null
  errors: string[]
}

/** Batch GetItems for price polling — sequential batches with delay (never parallel). */
export async function getItemsByAsinsBatched(
  asins: string[],
  config: AmazonAffiliateServerConfig,
  options?: { batchSize?: number; delayMs?: number },
): Promise<PaapiBatchItemResult[]> {
  const common = buildPaapiCommonParams(config)
  if (!common || asins.length === 0) {
    return asins.map((asin) => ({
      asin,
      item: null,
      errors: ['Creators API client unavailable'],
    }))
  }

  const batchSize = options?.batchSize ?? 10
  const delayMs = options?.delayMs ?? 1200
  const results: PaapiBatchItemResult[] = []

  for (let i = 0; i < asins.length; i += batchSize) {
    if (i > 0) await sleep(delayMs)

    const batch = asins.slice(i, i + batchSize)
    try {
      const response = await creatorsRequest(common, '/catalog/v1/getItems', {
        itemIds: batch,
        itemIdType: 'ASIN',
        resources: PRICE_CHECK_RESOURCES,
      })

      const errors = extractPaapiErrors(response)
      const camelItems =
        (response as { itemsResult?: { items?: Record<string, unknown>[] } })?.itemsResult
          ?.items ?? []
      const items = camelItems.map((item) => normalizeCreatorsItem(item))
      const byAsin = new Map(
        items.map((item) => [String((item as { ASIN?: string }).ASIN ?? '').toUpperCase(), item]),
      )

      for (const asin of batch) {
        const key = asin.toUpperCase()
        const item = byAsin.get(key) ?? null
        results.push({
          asin: key,
          item,
          errors: item ? [] : errors.length ? errors : [`No item returned for ${key}`],
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      for (const asin of batch) {
        results.push({ asin: asin.toUpperCase(), item: null, errors: [message] })
      }
    }
  }

  return results
}

/** Lightweight connectivity check for Admin settings. */
export async function testPaapiConnection(
  config: AmazonAffiliateServerConfig,
): Promise<PaapiLookupResult> {
  const common = buildPaapiCommonParams(config)
  if (!common) {
    return {
      ok: false,
      errors: [
        'Creators API unavailable — check credential ID, credential secret, and partner tag',
      ],
      fatal: false,
    }
  }

  const result = await runSearchItems(common, {
    keywords: 'Petzl Tikka headlamp',
    searchIndex: 'All',
    itemCount: 1,
    resources: CREATORS_SEARCH_RESOURCES,
  })

  if (result.ok) return result

  return {
    ok: false,
    errors: result.errors,
    fatal: result.fatal || isFatalPaapiError(result.errors),
  }
}
