import type { ArticleProductSpec } from '@/lib/server/affiliate-pipeline/types'

export type ArticleStatus = 'draft' | 'review' | 'published'

export type ArticleTemplate =
  | 'roundup-under-budget'
  | 'best-of-category'
  | 'comparison'
  | 'buying-guide'
  | 'other'

export interface Article {
  id: string
  slug: string
  title: string
  meta_description: string | null
  content_html: string | null
  /** Persisted PA-API product specs for re-hydrate (search_keywords, ASINs). */
  product_specs?: ArticleProductSpec[] | null
  last_hydrated_at?: string | null
  hero_image_url: string | null
  atmosphere_image_url: string | null
  card_id: string | null
  template_type: ArticleTemplate | null
  category: string | null
  cta_question: string | null
  status: ArticleStatus
  author_name: string | null
  author_id: string | null
  seo_title: string | null
  canonical_url: string | null
  published_at: string | null
  prerender_status?: 'pending' | 'done' | null
  created_at: string
  updated_at: string
}

export interface ArticleFormData {
  title: string
  slug: string
  meta_description: string
  content_html: string
  hero_image_url: string
  /** Pipeline compat — synced from hero when saving manually. */
  atmosphere_image_url: string
  /** Primary product/topic slug (stored as card_id in DB for pipeline compat). */
  topic: string
  template_type: ArticleTemplate | ''
  category: string
  seo_title: string
  canonical_url: string
  status: ArticleStatus
}
