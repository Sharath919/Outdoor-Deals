import type { SupabaseClient } from '@supabase/supabase-js'
import { hydrateProducts } from './fetch-products'
import { buildSpecFromClaudeOutput } from './parse-spec'
import { repairCorruptedPipelineHtml } from './repair-html'
import { renderArticleBody } from './render'
import { linkProductsToArticle } from './link-products'
import type { ArticleSpec, HydratedArticleSpec, PipelineResult } from './types'

export async function runAffiliatePipeline(
  supabase: SupabaseClient,
  input: {
    contentHtml: string
    articleJson?: Record<string, unknown>
    spec?: ArticleSpec
  },
): Promise<PipelineResult> {
  const contentHtml = repairCorruptedPipelineHtml(input.contentHtml)
  const spec =
    input.spec ??
    buildSpecFromClaudeOutput(contentHtml, input.articleJson ?? {})

  const warnings: string[] = []
  if (spec.products.length === 0) {
    warnings.push(
      'No products found — add a products JSON array with name and search_keywords fields',
    )
  }

  const { products, warnings: hydrateWarnings } = await hydrateProducts(supabase, spec.products)
  warnings.push(...hydrateWarnings)

  const hydrated: HydratedArticleSpec = {
    ...spec,
    products,
  }

  const render = renderArticleBody(hydrated)

  return { spec: hydrated, render, warnings }
}

export async function applyPipelineToArticle(
  supabase: SupabaseClient,
  articleId: string,
  input: {
    contentHtml: string
    articleJson?: Record<string, unknown>
    category?: string | null
  },
): Promise<PipelineResult> {
  const result = await runAffiliatePipeline(supabase, input)

  if (result.render.contentHtml.trim()) {
    const { error } = await supabase
      .from('articles')
      .update({
        content_html: result.render.contentHtml,
        updated_at: new Date().toISOString(),
      })
      .eq('id', articleId)

    if (error) throw new Error(`Failed to update article HTML: ${error.message}`)
  }

  if (result.spec.products.length > 0) {
    await linkProductsToArticle(
      supabase,
      articleId,
      result.spec.products,
      input.category ?? null,
    )
  }

  return result
}

export { hydrateProducts } from './fetch-products'
export { buildSpecFromClaudeOutput, parseHtmlToArticleSpec } from './parse-spec'
export { renderArticleBody, renderCompareTable } from './render'
export { linkProductsToArticle } from './link-products'
