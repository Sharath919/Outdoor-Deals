import type { AmazonAffiliateServerConfig } from '@/types/amazonAffiliate'

export type PaapiItem = Record<string, unknown>

export type PaapiCommonParams = {
  AccessKey: string
  SecretKey: string
  PartnerTag: string
  PartnerType: 'Associates'
  Marketplace: string
}

const PAAPI_SEARCH_RESOURCES = [
  'Images.Primary.Large',
  'Images.Primary.Medium',
  'ItemInfo.Title',
  'ItemInfo.ByLineInfo',
]

const PAAPI_GET_RESOURCES = [
  ...PAAPI_SEARCH_RESOURCES,
  'OffersV2.Listings.Price',
]

/** Valid US marketplace SearchIndex values (see PA-API locale reference). */
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
  const partnerTag = config.paapiPartnerTag?.trim() || config.associateTag?.trim()
  if (!config.paapiAccessKey || !config.paapiSecretKey || !partnerTag) return null
  return {
    AccessKey: config.paapiAccessKey,
    SecretKey: config.paapiSecretKey,
    PartnerTag: partnerTag,
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

function formatThrownPaapiError(err: unknown): string[] {
  const message = err instanceof Error ? err.message : String(err)
  const body = (err as { response?: { body?: unknown } })?.response?.body
  const amazonErrors = extractPaapiErrors(body)
  if (amazonErrors.length) return amazonErrors
  return [message]
}

async function runSearchItems(
  client: PaapiClient,
  common: PaapiCommonParams,
  request: Record<string, unknown>,
): Promise<PaapiLookupResult> {
  try {
    const response = await client.SearchItemsV2(common, request)
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
    return { ok: false, errors: formatThrownPaapiError(err), fatal: false }
  }
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
  const namesProductType =
    /\b(headlamp|headlight|tent|backpack|sleeping bag|stove|cooler|hat|cap|bucket|beanie|gloves?|jacket|shirt|pants|shorts|socks|boots?|shoes?)\b/i.test(
      base,
    )
  if (!namesProductType) {
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
      const result = await runSearchItems(client, common, {
        Keywords: query,
        SearchIndex: searchIndex,
        ItemCount: 3,
        Resources: PAAPI_SEARCH_RESOURCES,
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
  const client = await getPaapiClient()
  if (!common || !client || !asin) {
    return { ok: false, errors: ['PA-API client unavailable — check access key, secret key, and associate tag'], fatal: false }
  }

  try {
    const response = await client.GetItemsV2(common, {
      ItemIds: [asin],
      Resources: PAAPI_GET_RESOURCES,
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
    const errors = formatThrownPaapiError(err)
    console.error(`[affiliate-pipeline] GetItems ${asin} failed:`, errors.join('; '))
    return { ok: false, errors, fatal: isFatalPaapiError(errors) }
  }
}

const PRICE_CHECK_RESOURCES = ['Offers.Listings.Price', 'OffersV2.Listings.Price']

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
  const client = await getPaapiClient()
  if (!common || !client || asins.length === 0) {
    return asins.map((asin) => ({
      asin,
      item: null,
      errors: ['PA-API client unavailable'],
    }))
  }

  const batchSize = options?.batchSize ?? 10
  const delayMs = options?.delayMs ?? 1200
  const results: PaapiBatchItemResult[] = []

  for (let i = 0; i < asins.length; i += batchSize) {
    if (i > 0) await sleep(delayMs)

    const batch = asins.slice(i, i + batchSize)
    try {
      const response = await client.GetItemsV2(common, {
        ItemIds: batch,
        Resources: PRICE_CHECK_RESOURCES,
      })

      const errors = extractPaapiErrors(response)
      const items =
        (response as { ItemsResult?: { Items?: PaapiItem[] } })?.ItemsResult?.Items ?? []
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
  const client = await getPaapiClient()
  if (!common || !client) {
    return {
      ok: false,
      errors: ['PA-API client unavailable — check access key, secret key, and associate tag'],
      fatal: false,
    }
  }

  const result = await runSearchItems(client, common, {
    Keywords: 'Petzl Tikka headlamp',
    SearchIndex: 'All',
    ItemCount: 1,
    Resources: PAAPI_SEARCH_RESOURCES,
  })

  if (result.ok) return result

  return {
    ok: false,
    errors: result.errors,
    fatal: result.fatal || isFatalPaapiError(result.errors),
  }
}
