import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildAffiliateProductUrl,
  buildAmazonSearchUrl,
} from '@/utils/amazonAffiliateConfig'
import { readAmazonAffiliateServerConfig } from '@/lib/server/amazon-affiliate-config'
import type { AmazonAffiliateServerConfig } from '@/types/amazonAffiliate'
import type { ArticleProductSpec, HydratedProduct } from './types'
import { isCacheStale, loadPaapiCache, mergeCache, savePaapiCache } from './cache'

type PaapiItem = Record<string, unknown>

const PAAPI_RESOURCES = [
  'Images.Primary.Large',
  'Images.Primary.Medium',
  'ItemInfo.Title',
  'ItemInfo.Features',
  'ItemInfo.ProductInfo',
  'ItemInfo.ByLineInfo',
  'Offers.Listings.Price',
]

const PAAPI_RATE_LIMIT_MS = 1100

function getSearchKeywords(product: ArticleProductSpec): string {
  return product.search_keywords?.trim() || product.name?.trim() || ''
}

async function getPaapiClient(config: AmazonAffiliateServerConfig) {
  if (!config.paapiAccessKey || !config.paapiSecretKey) return null
  try {
    const mod = await import('amazon-paapi')
    const amazonPaapi = mod.default ?? mod
    return {
      client: amazonPaapi,
      commonParams: {
        AccessKey: config.paapiAccessKey,
        SecretKey: config.paapiSecretKey,
        PartnerTag: config.associateTag,
        PartnerType: 'Associates',
        Marketplace: config.marketplace || 'www.amazon.com',
      },
    }
  } catch (err) {
    console.warn('[affiliate-pipeline] PA-API import failed:', err)
    return null
  }
}

function isValidPaapiItem(item: PaapiItem | undefined): boolean {
  if (!item) return false
  const info = item.ItemInfo as Record<string, unknown> | undefined
  const titleObj = info?.Title as { DisplayValue?: string } | undefined
  return Boolean(titleObj?.DisplayValue?.trim())
}

async function searchProductByKeywords(
  keywords: string,
  config: AmazonAffiliateServerConfig,
): Promise<{ asin: string; item: PaapiItem } | null> {
  const paapi = await getPaapiClient(config)
  const query = keywords.trim()
  if (!paapi || !query) return null

  try {
    const response = await paapi.client.SearchItems({
      ...paapi.commonParams,
      Keywords: query,
      SearchIndex: 'SportingGoods',
      ItemCount: 1,
      Resources: PAAPI_RESOURCES,
    })

    const items =
      (response as { SearchResult?: { Items?: PaapiItem[] } }).SearchResult?.Items ?? []
    const first = items[0]
    const asin = String((first as { ASIN?: string })?.ASIN ?? '')
    if (asin && isValidPaapiItem(first)) {
      return { asin, item: first }
    }
  } catch (err) {
    console.error('[affiliate-pipeline] PA-API SearchItems failed:', err)
  }

  return null
}

function shapePaapiProduct(
  asin: string,
  item: PaapiItem,
  associateTag: string,
  displayName: string,
): Pick<HydratedProduct, 'affiliate_url' | 'image_url' | 'image_alt' | 'name' | 'price_range' | 'brand'> {
  const affiliate_url = buildAffiliateProductUrl(asin, associateTag)
  const info = item.ItemInfo as Record<string, unknown> | undefined
  const titleObj = info?.Title as { DisplayValue?: string } | undefined
  const brandObj = (info?.ByLineInfo as { Brand?: { DisplayValue?: string } } | undefined)?.Brand
  const images = item.Images as { Primary?: { Large?: { URL?: string }; Medium?: { URL?: string } } } | undefined
  const offers = item.Offers as { Listings?: Array<{ Price?: { DisplayAmount?: string } }> } | undefined

  const catalogTitle = titleObj?.DisplayValue ?? ''
  const image = images?.Primary?.Large?.URL ?? images?.Primary?.Medium?.URL ?? null
  const price = offers?.Listings?.[0]?.Price?.DisplayAmount ?? null

  return {
    affiliate_url,
    image_url: image,
    image_alt: displayName || catalogTitle || `Product ${asin}`,
    name: displayName || catalogTitle,
    brand: brandObj?.DisplayValue,
    price_range: price,
  }
}

function shapeSearchFallbackProduct(
  product: ArticleProductSpec,
  associateTag: string,
): HydratedProduct {
  const name = product.name?.trim() ?? ''
  const keywords = getSearchKeywords(product)
  return {
    ...product,
    asin: '',
    affiliate_url: buildAmazonSearchUrl(keywords || name, associateTag),
    image_url: product.image_url ?? null,
    image_alt: product.image_alt ?? (name || 'Product'),
    name,
    price_range: product.price_range ?? null,
    specs: product.specs ?? {},
    pros: product.pros ?? [],
    cons: product.cons ?? [],
    body: product.body,
    bottom_line: product.bottom_line,
  }
}

async function resolveProduct(
  product: ArticleProductSpec,
  cache: Record<string, Record<string, unknown>>,
  config: AmazonAffiliateServerConfig,
  associateTag: string,
  paapiConfigured: boolean,
  warnings: string[],
): Promise<{ product: HydratedProduct; cache: Record<string, Record<string, unknown>> }> {
  const displayName = product.name?.trim() ?? ''
  const keywords = getSearchKeywords(product)
  let nextCache = cache

  const applyValidated = (asin: string, item: PaapiItem): HydratedProduct => {
    const shaped = shapePaapiProduct(asin, item, associateTag, displayName)
    return {
      ...product,
      asin,
      ...shaped,
      image_url: product.image_url ?? shaped.image_url,
      price_range: product.price_range ?? shaped.price_range,
      affiliate_url: shaped.affiliate_url,
      specs: product.specs ?? {},
      pros: product.pros ?? [],
      cons: product.cons ?? [],
      body: product.body,
      bottom_line: product.bottom_line,
    }
  }

  // Reuse cached PA-API result only for ASINs previously resolved by our pipeline
  const cachedAsin = product.asin?.trim()
  if (cachedAsin) {
    const cached = nextCache[cachedAsin]
    if (cached && !isCacheStale(cached) && isValidPaapiItem(cached)) {
      return { product: applyValidated(cachedAsin, cached), cache: nextCache }
    }
  }

  if (paapiConfigured && keywords) {
    const searchResult = await searchProductByKeywords(keywords, config)
    await new Promise((r) => setTimeout(r, PAAPI_RATE_LIMIT_MS))

    if (searchResult) {
      nextCache = mergeCache(nextCache, searchResult.asin, searchResult.item)
      return { product: applyValidated(searchResult.asin, searchResult.item), cache: nextCache }
    }

    warnings.push(
      `PA-API found no match for "${keywords}" — using Amazon search link`,
    )
  } else if (!keywords) {
    warnings.push('Product missing name and search_keywords — skipped resolution')
    return {
      product: shapeSearchFallbackProduct(product, associateTag),
      cache: nextCache,
    }
  } else {
    warnings.push('PA-API not configured — using Amazon search links')
  }

  return { product: shapeSearchFallbackProduct(product, associateTag), cache: nextCache }
}

export async function hydrateProducts(
  supabase: SupabaseClient,
  products: ArticleProductSpec[],
): Promise<{ products: HydratedProduct[]; warnings: string[] }> {
  const config = await readAmazonAffiliateServerConfig()
  const warnings: string[] = []
  const associateTag = config.associateTag
  const paapiConfigured = Boolean(config.paapiAccessKey && config.paapiSecretKey)

  if (!associateTag) {
    warnings.push('No associate tag configured — affiliate URLs may be incomplete')
  }

  let cache = await loadPaapiCache(supabase)

  const hydrated: HydratedProduct[] = []
  for (const product of products) {
    const result = await resolveProduct(
      product,
      cache,
      config,
      associateTag,
      paapiConfigured,
      warnings,
    )
    cache = result.cache
    hydrated.push(result.product)
  }

  await savePaapiCache(supabase, cache)
  return { products: hydrated, warnings }
}
