/** Editorial article spec — input to the affiliate pipeline. */

export type ArticleProductSpec = {
  /** Resolved by PA-API — never trust Claude-supplied values */
  asin?: string
  /** PA-API SearchItems query — preferred over display name */
  search_keywords?: string
  award_label?: string
  award_color?: 'gold' | 'versatile' | 'value' | string
  tagline?: string
  best_for?: string
  specs?: Record<string, string>
  pros?: string[]
  cons?: string[]
  /** Markdown or plain text paragraphs */
  body?: string
  bottom_line?: string
  /** Manual overrides when PA-API unavailable */
  name?: string
  image_url?: string
  image_alt?: string
  price_range?: string
  affiliate_url?: string
}

export type ArticleSpec = {
  slug?: string
  title?: string
  deck?: string
  eyebrow?: string
  breadcrumb?: string
  intro?: string
  /** Markdown */
  buyers_guide?: string
  products: ArticleProductSpec[]
  /** FAQ, related reads, etc. — appended after product reviews */
  tail_html?: string
}

export type HydratedProduct = Omit<ArticleProductSpec, 'image_url' | 'price_range' | 'affiliate_url' | 'name'> & {
  affiliate_url: string
  image_url: string | null
  image_alt: string
  name: string
  price_range: string | null
  brand?: string
}

export type HydratedArticleSpec = Omit<ArticleSpec, 'products'> & {
  products: HydratedProduct[]
}

export type PipelineRenderResult = {
  contentHtml: string
  compareTableHtml: string
  introHtml: string
  buyersGuideHtml: string
  reviewsHtml: string
}

export type PipelineResult = {
  spec: HydratedArticleSpec
  render: PipelineRenderResult
  warnings: string[]
}
