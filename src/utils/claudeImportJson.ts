import type { ArticleProductSpec } from '@/lib/server/affiliate-pipeline/types'

export const JSON_IMPORT_FIELD_KEYS = [
  'title',
  'slug',
  'meta_description',
  'seo_title',
  'template_type',
  'category',
  'topic',
  'canonical_url',
] as const

export type JsonImportFieldKey = (typeof JSON_IMPORT_FIELD_KEYS)[number]

export type ClaudeImportParseResult =
  | { kind: 'invalid' }
  | { kind: 'empty' }
  | {
      kind: 'ok'
      fields: Partial<Record<JsonImportFieldKey, string>>
      fullImport?: Record<string, unknown>
      productCount?: number
    }

function unwrapJsonText(raw: string): string {
  let text = raw.trim()
  if (!text) return text
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  }
  return text
}

export function parseClaudeImportJson(raw: string): ClaudeImportParseResult {
  const text = unwrapJsonText(raw)
  if (!text) return { kind: 'empty' }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { kind: 'invalid' }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { kind: 'invalid' }
  }

  const source = parsed as Record<string, unknown>
  const fields: Partial<Record<JsonImportFieldKey, string>> = {}

  for (const key of JSON_IMPORT_FIELD_KEYS) {
    let value = source[key]
    if (value === undefined || value === null) {
      if (key === 'topic') value = source.primary_topic ?? source.card_id
      else continue
    }
    if (typeof value === 'string' && value.trim() !== '') {
      fields[key] = value.trim()
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      fields[key] = String(value)
    }
  }

  const products = source.products
  const hasProducts = Array.isArray(products) && products.length > 0

  if (Object.keys(fields).length === 0 && !hasProducts) {
    return { kind: 'empty' }
  }

  return {
    kind: 'ok',
    fields,
    fullImport: hasProducts ? source : undefined,
    productCount: hasProducts ? products.length : undefined,
  }
}

export function importMetadataFromJson(
  importJson: Record<string, unknown>,
): { reddit_welcome?: string; display_name?: string } {
  const meta: { reddit_welcome?: string; display_name?: string } = {}
  const welcome = String(importJson.reddit_welcome ?? '').trim()
  if (welcome) meta.reddit_welcome = welcome
  const displayName = String(importJson.display_name ?? '').trim()
  if (displayName) meta.display_name = displayName
  return meta
}

export function productSpecsFromImportJson(
  importJson: Record<string, unknown>,
): ArticleProductSpec[] {
  const products = importJson.products
  if (!Array.isArray(products)) return []

  return products
    .map((raw, index) => {
      const row = raw as Record<string, unknown>
      const name = String(row.name ?? row.title ?? '').trim()
      const asin = String(row.asin ?? '').trim().toUpperCase()
      if (!name && !asin) return null

      return {
        name: name || undefined,
        search_keywords: name,
        asin: /^[A-Z0-9]{10}$/.test(asin) ? asin : undefined,
        award_label: String(row.award_label ?? ''),
        award_color: String(
          row.award_color ?? (index === 0 ? 'gold' : index === 1 ? 'versatile' : 'value'),
        ),
        tagline: String(row.tagline ?? ''),
        specs: (row.specs as Record<string, string>) ?? {},
        pros: Array.isArray(row.pros) ? row.pros.map(String) : [],
        cons: Array.isArray(row.cons) ? row.cons.map(String) : [],
        body: String(row.body ?? ''),
        bottom_line: String(row.bottom_line ?? ''),
        price_range: String(row.price_range ?? ''),
      } satisfies ArticleProductSpec
    })
    .filter((p): p is ArticleProductSpec => p !== null)
}
