import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildAffiliateProductUrl,
  buildAmazonSearchUrl,
} from '@/utils/amazonAffiliateConfig'
import { readAmazonAffiliateServerConfig } from '@/lib/server/amazon-affiliate-config'
import type { AmazonAffiliateServerConfig } from '@/types/amazonAffiliate'
import type { ArticleProductSpec, HydratedProduct } from './types'
import { isCacheStale, loadPaapiCache, mergeCache, savePaapiCache } from './cache'
import {
  getItemByAsin,
  isValidPaapiItem,
  searchProductByKeywords,
  type PaapiItem,
  type PaapiLookupFailure,
} from './paapi-client'

const PAAPI_RATE_LIMIT_MS = 1100

function getSearchKeywords(product: ArticleProductSpec): string {
  return product.search_keywords?.trim() || product.name?.trim() || ''
}

function formatPaapiFailureWarning(
  context: string,
  keywords: string,
  failure: PaapiLookupFailure,
): string {
  const detail = failure.errors.length ? failure.errors.join('; ') : 'no catalog match'
  if (failure.fatal) {
    return `PA-API error for ${context} "${keywords}": ${detail}`
  }
  return `PA-API found no match for "${keywords}" (${detail}) — using Amazon search link`
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
  const offersV2 = item.OffersV2 as
    | { Listings?: Array<{ Price?: { DisplayAmount?: string; Money?: { DisplayAmount?: string } } }> }
    | undefined

  const catalogTitle = titleObj?.DisplayValue ?? ''
  const image = images?.Primary?.Large?.URL ?? images?.Primary?.Medium?.URL ?? null
  const price =
    offers?.Listings?.[0]?.Price?.DisplayAmount ??
    offersV2?.Listings?.[0]?.Price?.DisplayAmount ??
    offersV2?.Listings?.[0]?.Price?.Money?.DisplayAmount ??
    null

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
  category: string | null | undefined,
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

  const cachedAsin = product.asin?.trim()
  if (cachedAsin) {
    const cached = nextCache[cachedAsin]
    if (cached && !isCacheStale(cached) && isValidPaapiItem(cached)) {
      return { product: applyValidated(cachedAsin, cached), cache: nextCache }
    }

    if (paapiConfigured) {
      const fetched = await getItemByAsin(cachedAsin, config)
      await new Promise((r) => setTimeout(r, PAAPI_RATE_LIMIT_MS))
      if (fetched.ok) {
        nextCache = mergeCache(nextCache, fetched.asin, fetched.item)
        return { product: applyValidated(fetched.asin, fetched.item), cache: nextCache }
      }
      warnings.push(formatPaapiFailureWarning(`ASIN ${cachedAsin}`, displayName || cachedAsin, fetched))
    }
  }

  if (paapiConfigured && keywords) {
    const searchResult = await searchProductByKeywords(keywords, config, category)
    await new Promise((r) => setTimeout(r, PAAPI_RATE_LIMIT_MS))

    if (searchResult.ok) {
      nextCache = mergeCache(nextCache, searchResult.asin, searchResult.item)
      return { product: applyValidated(searchResult.asin, searchResult.item), cache: nextCache }
    }

    warnings.push(formatPaapiFailureWarning('search', keywords, searchResult))
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
  category?: string | null,
): Promise<{ products: HydratedProduct[]; warnings: string[] }> {
  const config = await readAmazonAffiliateServerConfig()
  const warnings: string[] = []
  const associateTag = config.associateTag
  const paapiConfigured = Boolean(
    config.paapiAccessKey && config.paapiSecretKey && config.associateTag,
  )

  if (!associateTag) {
    warnings.push('No associate tag configured — affiliate URLs may be incomplete')
  } else if (!paapiConfigured) {
    warnings.push(
      'PA-API not fully configured — save access key, secret key, and associate tag in Admin → Amazon Affiliate',
    )
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
      category,
      warnings,
    )
    cache = result.cache
    hydrated.push(result.product)
  }

  await savePaapiCache(supabase, cache)
  return { products: hydrated, warnings }
}
