import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePublishedContent } from '@/lib/server/revalidate-published-content'
import {
  applyPipelineToArticle,
  parseStoredProductSpecs,
} from '@/lib/server/affiliate-pipeline'

export const HYDRATE_COOLDOWN_MS = 24 * 60 * 60 * 1000

export type ArticleHydrationRow = {
  id: string
  slug: string
  content_html: string | null
  category: string | null
  product_specs: unknown
  last_hydrated_at?: string | null
}

export type HydrateArticleResult = {
  success: boolean
  article_id: string
  slug: string
  products_linked: number
  warnings: string[]
  skipped: boolean
  error?: string
}

export function shouldSkipHydration(
  lastHydratedAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!lastHydratedAt) return false
  const ts = new Date(lastHydratedAt).getTime()
  if (!Number.isFinite(ts)) return false
  return now - ts < HYDRATE_COOLDOWN_MS
}

export async function hydrateArticleRecord(
  supabase: SupabaseClient,
  row: ArticleHydrationRow,
  options?: { force?: boolean },
): Promise<HydrateArticleResult> {
  const base = {
    article_id: row.id,
    slug: row.slug,
    products_linked: 0,
    warnings: [] as string[],
    skipped: false,
  }

  if (!row.content_html?.trim()) {
    return {
      ...base,
      success: false,
      error: 'Article has no content to hydrate',
    }
  }

  if (!options?.force && shouldSkipHydration(row.last_hydrated_at)) {
    return {
      ...base,
      success: true,
      skipped: true,
      warnings: ['Skipped hydration — article was hydrated within the last 24 hours'],
    }
  }

  try {
    const result = await applyPipelineToArticle(supabase, row.id, {
      contentHtml: row.content_html,
      category: row.category,
      productSpecs: parseStoredProductSpecs(row.product_specs),
    })

    revalidatePublishedContent(row.slug)

    return {
      success: true,
      article_id: row.id,
      slug: row.slug,
      products_linked: result.spec.products.length,
      warnings: result.warnings,
      skipped: false,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[article-hydration] failed for ${row.id}:`, message)
    return {
      ...base,
      success: false,
      error: message,
      warnings: [`Hydration error: ${message}`],
    }
  }
}
