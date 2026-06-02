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

export function extractSearchItems(response: unknown): PaapiItem[] {
  return (response as { SearchResult?: { Items?: PaapiItem[] } })?.SearchResult?.Items ?? []
}

export function isValidPaapiItem(item: PaapiItem | undefined): boolean {
  if (!item) return false
  const info = item.ItemInfo as Record<string, unknown> | undefined
  const titleObj = info?.Title as { DisplayValue?: string } | undefined
  return Boolean(titleObj?.DisplayValue?.trim())
}

function buildSearchQueries(keywords: string): string[] {
  const base = keywords.trim()
  if (!base) return []
  const queries = new Set<string>([base])
  if (!/\b(headlamp|headlight|tent|backpack|sleeping bag|stove|cooler)\b/i.test(base)) {
    queries.add(`${base} camping`)
  }
  return [...queries]
}

export async function searchProductByKeywords(
  keywords: string,
  config: AmazonAffiliateServerConfig,
): Promise<{ asin: string; item: PaapiItem; errors: string[] } | null> {
  const common = buildPaapiCommonParams(config)
  const client = await getPaapiClient()
  if (!common || !client) return null

  const queries = buildSearchQueries(keywords)
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
          if (errors.some((e) => /Invalid|Access|Signature|Credential|Associate/i.test(e))) {
            return null
          }
          continue
        }

        const items = extractSearchItems(response)
        const match = items.find(isValidPaapiItem)
        if (match) {
          const asin = String((match as { ASIN?: string }).ASIN ?? '')
          if (asin) return { asin, item: match, errors: [] }
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
  return null
}

export async function getItemByAsin(
  asin: string,
  config: AmazonAffiliateServerConfig,
): Promise<{ asin: string; item: PaapiItem } | null> {
  const common = buildPaapiCommonParams(config)
  const client = await getPaapiClient()
  if (!common || !client || !asin) return null

  try {
    const response = await client.GetItemsV2(common, {
      ItemIds: [asin],
      Resources: PAAPI_RESOURCES,
    })

    const errors = extractPaapiErrors(response)
    if (errors.length) {
      console.warn(`[affiliate-pipeline] GetItems ${asin}:`, errors.join('; '))
      return null
    }

    const items =
      (response as { ItemsResult?: { Items?: PaapiItem[] } })?.ItemsResult?.Items ?? []
    const match = items.find(isValidPaapiItem)
    if (!match) return null
    return { asin, item: match }
  } catch (err) {
    console.error(`[affiliate-pipeline] GetItems ${asin} failed:`, err)
    return null
  }
}
