import type { SupabaseClient } from '@supabase/supabase-js'
import { buildAffiliateProductUrl, buildAmazonSearchUrl } from '@/utils/amazonAffiliateConfig'
import { readAmazonAffiliateServerConfig } from '@/lib/server/amazon-affiliate-config'
import type { AmazonAffiliateServerConfig } from '@/types/amazonAffiliate'
import type { ArticleProductSpec, HydratedProduct } from './types'
import { isCacheStale, loadPaapiCache, mergeCache, savePaapiCache } from './cache'

type PaapiItem = Record<string, unknown>

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

async function fetchBatchFromPaapi(
  asins: string[],
  config: AmazonAffiliateServerConfig,
): Promise<Record<string, PaapiItem>> {
  const paapi = await getPaapiClient(config)
  if (!paapi || asins.length === 0) return {}

  const allItems: Record<string, PaapiItem> = {}
  for (let i = 0; i < asins.length; i += 10) {
    const batch = asins.slice(i, i + 10)
    try {
      const response = await paapi.client.GetItems({
        ...paapi.commonParams,
        ItemIds: batch,
        Resources: [
          'Images.Primary.Large',
          'Images.Primary.Medium',
          'ItemInfo.Title',
          'ItemInfo.Features',
          'ItemInfo.ProductInfo',
          'ItemInfo.ByLineInfo',
          'Offers.Listings.Price',
        ],
      })

      const items = (response as { ItemsResult?: { Items?: PaapiItem[] } }).ItemsResult?.Items ?? []
      for (const item of items) {
        const asin = String((item as { ASIN?: string }).ASIN ?? '')
        if (asin) allItems[asin] = item
      }
      await new Promise((r) => setTimeout(r, 1100))
    } catch (err) {
      console.error('[affiliate-pipeline] PA-API batch failed:', err)
    }
  }
  return allItems
}

function shapePaapiProduct(
  asin: string,
  item: PaapiItem | undefined,
  associateTag: string,
): Pick<HydratedProduct, 'affiliate_url' | 'image_url' | 'image_alt' | 'name' | 'price_range' | 'brand'> {
  const affiliate_url = buildAffiliateProductUrl(asin, associateTag)
  if (!item) {
    return {
      affiliate_url,
      image_url: null,
      image_alt: `Product ${asin}`,
      name: '',
      price_range: null,
    }
  }
  const info = item.ItemInfo as Record<string, unknown> | undefined
  const titleObj = info?.Title as { DisplayValue?: string } | undefined
  const brandObj = (info?.ByLineInfo as { Brand?: { DisplayValue?: string } } | undefined)?.Brand
  const images = item.Images as { Primary?: { Large?: { URL?: string }; Medium?: { URL?: string } } } | undefined
  const offers = item.Offers as { Listings?: Array<{ Price?: { DisplayAmount?: string } }> } | undefined

  const title = titleObj?.DisplayValue ?? ''
  const image =
    images?.Primary?.Large?.URL ?? images?.Primary?.Medium?.URL ?? null
  const price = offers?.Listings?.[0]?.Price?.DisplayAmount ?? null

  return {
    affiliate_url,
    image_url: image,
    image_alt: title || `Product ${asin}`,
    name: title,
    brand: brandObj?.DisplayValue,
    price_range: price,
  }
}

function shapeManualProduct(product: ArticleProductSpec, associateTag: string): HydratedProduct {
  const asin = product.asin?.trim() ?? ''
  const searchUrl = buildAmazonSearchUrl(product.name ?? '', associateTag)
  const affiliateFromAsin = asin ? buildAffiliateProductUrl(asin, associateTag) : ''
  return {
    ...product,
    asin,
    affiliate_url:
      product.affiliate_url?.trim() ||
      affiliateFromAsin ||
      searchUrl,
    image_url: product.image_url ?? null,
    image_alt: product.image_alt ?? product.name ?? `Product ${asin}`,
    name: product.name?.trim() ?? '',
    price_range: product.price_range ?? null,
    specs: product.specs ?? {},
    pros: product.pros ?? [],
    cons: product.cons ?? [],
  }
}

export async function hydrateProducts(
  supabase: SupabaseClient,
  products: ArticleProductSpec[],
): Promise<{ products: HydratedProduct[]; warnings: string[] }> {
  const config = await readAmazonAffiliateServerConfig()
  const warnings: string[] = []
  const associateTag = config.associateTag

  if (!associateTag) {
    warnings.push('No associate tag configured — affiliate URLs may be incomplete')
  }

  let cache = await loadPaapiCache(supabase)
  const asinsToFetch = products
    .map((p) => p.asin?.trim())
    .filter(Boolean)
    .filter((asin) => !cache[asin] || isCacheStale(cache[asin]))

  if (asinsToFetch.length > 0 && config.paapiAccessKey && config.paapiSecretKey) {
    const fresh = await fetchBatchFromPaapi(asinsToFetch, config)
    for (const [asin, item] of Object.entries(fresh)) {
      cache = mergeCache(cache, asin, item)
    }
    await savePaapiCache(supabase, cache)
    if (Object.keys(fresh).length === 0) {
      warnings.push('PA-API returned no product data — using manual fields where available')
    }
  } else if (asinsToFetch.length > 0) {
    warnings.push('PA-API not configured — manual product fields required')
  }

  const hydrated = products.map((product) => {
    const asin = product.asin?.trim()
    if (!asin) {
      warnings.push('Product missing ASIN — skipped hydration')
      return shapeManualProduct({ ...product, asin: 'UNKNOWN' }, associateTag)
    }

    const cached = cache[asin]
    if (cached && !isCacheStale(cached)) {
      const shaped = shapePaapiProduct(asin, cached, associateTag)
      return {
        ...product,
        ...shaped,
        name: product.name?.trim() || shaped.name,
        image_url: product.image_url ?? shaped.image_url,
        price_range: product.price_range ?? shaped.price_range,
        affiliate_url: product.affiliate_url?.trim() || shaped.affiliate_url,
        specs: product.specs ?? {},
        pros: product.pros ?? [],
        cons: product.cons ?? [],
        body: product.body,
        bottom_line: product.bottom_line,
      } satisfies HydratedProduct
    }

    const manual = shapeManualProduct(product, associateTag)
    if (!manual.image_url) warnings.push(`Missing image for ${manual.name || asin}`)
    if (!manual.price_range) warnings.push(`Missing price for ${manual.name || asin}`)
    return manual
  })

  return { products: hydrated, warnings }
}
