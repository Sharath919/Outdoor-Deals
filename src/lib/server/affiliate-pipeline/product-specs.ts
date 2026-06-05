import type { ArticleProductSpec, ArticleSpec, HydratedProduct } from './types'
import { filterProductSpecs } from './product-parse-utils'

export function mergeStoredProductSpecs(
  htmlSpec: ArticleSpec,
  storedSpecs: ArticleProductSpec[] | null | undefined,
): ArticleSpec {
  if (!storedSpecs?.length) return htmlSpec

  const storedByName = new Map(
    storedSpecs.map((p) => [p.name?.toLowerCase().trim() ?? '', p]),
  )

  const products = htmlSpec.products.map((htmlProduct) => {
    const key = htmlProduct.name?.toLowerCase().trim() ?? ''
    const stored = storedByName.get(key)
    if (!stored) return htmlProduct

    return {
      ...htmlProduct,
      search_keywords: stored.search_keywords?.trim() || htmlProduct.search_keywords,
      asin: stored.asin?.trim() || htmlProduct.asin,
      image_url: stored.image_url || htmlProduct.image_url,
      price_range: stored.price_range || htmlProduct.price_range,
      affiliate_url: stored.affiliate_url || htmlProduct.affiliate_url,
      tagline: stored.tagline || htmlProduct.tagline,
      award_label: stored.award_label || htmlProduct.award_label,
      award_color: stored.award_color || htmlProduct.award_color,
    } satisfies ArticleProductSpec
  })

  return { ...htmlSpec, products: filterProductSpecs(products) }
}

export function serializeProductSpecs(products: HydratedProduct[]): ArticleProductSpec[] {
  return products.map((p) => ({
    name: p.name,
    search_keywords: p.search_keywords?.trim() || p.name,
    asin: p.asin?.trim() || undefined,
    image_url: p.image_url ?? undefined,
    image_alt: p.image_alt,
    price_range: p.price_range ?? undefined,
    affiliate_url: p.affiliate_url,
    tagline: p.tagline,
    award_label: p.award_label,
    award_color: p.award_color,
    best_for: p.best_for,
    specs: p.specs,
    pros: p.pros,
    cons: p.cons,
    body: p.body,
    bottom_line: p.bottom_line,
  }))
}

export function parseStoredProductSpecs(raw: unknown): ArticleProductSpec[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((row): row is ArticleProductSpec => {
    if (!row || typeof row !== 'object') return false
    const name = String((row as ArticleProductSpec).name ?? '').trim()
    const keywords = String((row as ArticleProductSpec).search_keywords ?? '').trim()
    return name.length >= 3 || keywords.length >= 3
  })
}
