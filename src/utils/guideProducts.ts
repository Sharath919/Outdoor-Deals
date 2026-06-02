import type { GuideProduct } from '@/lib/articles-server'
import type { HydratedProduct } from '@/lib/server/affiliate-pipeline/types'

export function guideProductsToHydrated(products: GuideProduct[]): HydratedProduct[] {
  return products.map((p) => ({
    asin: p.asin ?? '',
    name: p.title,
    image_url: p.image_url ?? undefined,
    image_alt: p.title,
    affiliate_url: p.affiliate_url,
    price_range: p.price_range ?? null,
    award_label: p.award_label,
    award_color: p.award_color,
    tagline: p.tagline,
    specs: {},
    pros: [],
    cons: [],
  }))
}
