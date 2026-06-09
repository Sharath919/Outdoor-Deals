import type { GuideProduct } from '@/lib/articles-server'
import type { ArticleProductSpec, HydratedProduct } from '@/lib/server/affiliate-pipeline/types'

export function guideProductsToHydrated(
  products: GuideProduct[],
  productSpecs?: ArticleProductSpec[] | null,
): HydratedProduct[] {
  return products.map((p, index) => {
    const spec = productSpecs?.[index]
    return {
      asin: p.asin ?? spec?.asin ?? '',
      name: p.title,
      image_url: p.image_url ?? spec?.image_url ?? null,
      image_alt: p.title,
      affiliate_url: p.affiliate_url,
      price_range: p.price_range ?? spec?.price_range ?? null,
      award_label: p.award_label ?? spec?.award_label,
      award_color: p.award_color ?? spec?.award_color,
      tagline: p.tagline ?? spec?.tagline ?? spec?.best_for,
      specs: spec?.specs ?? {},
      pros: spec?.pros ?? [],
      cons: spec?.cons ?? [],
      body: spec?.body,
      bottom_line: spec?.bottom_line,
    }
  })
}
