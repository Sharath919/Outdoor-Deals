import type { ArticleProductSpec } from './types'
import { normalizeAffiliateUrl } from '@/utils/amazonAffiliateConfig'

export function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim()
}

export function extractAsinFromHref(href: string): string | null {
  const dp = href.match(/\/dp\/([A-Z0-9]{10})/i)
  if (dp) return dp[1].toUpperCase()
  const gp = href.match(/\/gp\/product\/([A-Z0-9]{10})/i)
  if (gp) return gp[1].toUpperCase()
  return null
}

/** Split on editorial em/en dash only — not hyphens in Co-op, 2-person, etc. */
export function parseProductHeading(raw: string): { name: string; tagline: string } {
  const text = stripHtml(raw)
  const parts = text.split(/\s*[—–]\s*|\s+-\s+/)
  if (parts.length >= 2) {
    return { name: parts[0].trim(), tagline: parts.slice(1).join(' — ').trim() }
  }
  return { name: text, tagline: '' }
}

const NON_PRODUCT_HEADING =
  /what to look|who should skip|faq|frequently asked|related reads|reddit|community|what .* uses|pick one|buyer's guide|how to choose|quick comparison|comparison table|at a glance|our picks|should i buy|person or \d|worth it|difference between|how long|how much|how many|when to|where to|why /i

export function isProductHeading(text: string): boolean {
  const t = stripHtml(text).trim()
  if (!t) return false
  if (NON_PRODUCT_HEADING.test(t)) return false
  if (/\?\s*$/.test(t)) return false
  if (/^(should|how|what|when|where|why|is|are|can|do|does|will)\b/i.test(t)) return false
  // Product headings use an em/en dash or spaced hyphen between name and tagline
  return /[—–]/.test(t) || /\s+-\s+/.test(t)
}

export function extractImageFromSection(sectionHtml: string): string | undefined {
  const fromWrap =
    sectionHtml.match(/<div class="product-image-wrap"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i)?.[1] ??
    sectionHtml.match(/<div class="product-image"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i)?.[1]
  if (fromWrap) return fromWrap

  const lazyImg = sectionHtml.match(/<img[^>]+src="([^"]+)"[^>]*loading="lazy"/i)?.[1]
  if (lazyImg) return lazyImg

  const anyImg = sectionHtml.match(/<img[^>]+src="([^"]+)"/i)?.[1]
  return anyImg || undefined
}

export function extractAmazonLink(sectionHtml: string): { href: string; asin: string | null } | null {
  const linkRe = /<a\b[^>]*href="([^"]+)"[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = linkRe.exec(sectionHtml)) !== null) {
    const href = normalizeAffiliateUrl(match[1])
    if (!/amazon\.com/i.test(href)) continue
    const asin = extractAsinFromHref(href)
    if (asin) return { href, asin }
  }

  const affiliateMatch =
    sectionHtml.match(/<a\b[^>]*href="([^"]*)"[^>]*class="affiliate-link"[^>]*>/i) ??
    sectionHtml.match(/<a\b[^>]*class="affiliate-link"[^>]*href="([^"]*)"[^>]*>/i) ??
    sectionHtml.match(/<a\b[^>]*class="[^"]*btn[^"]*"[^>]*href="([^"]*amazon[^"]*)"[^>]*>/i)

  if (affiliateMatch) {
    return { href: affiliateMatch[1], asin: extractAsinFromHref(affiliateMatch[1]) }
  }

  return null
}

export function isValidProductSpec(product: ArticleProductSpec): boolean {
  const name = product.name?.trim() ?? ''
  const keywords = product.search_keywords?.trim() ?? ''
  const label = name || keywords
  if (!label || label.length < 3) return false
  if (NON_PRODUCT_HEADING.test(label)) return false
  if (/^(should|how|what|when|where|why)\b/i.test(label)) return false
  return true
}

export function filterProductSpecs(products: ArticleProductSpec[]): ArticleProductSpec[] {
  return products.filter(isValidProductSpec)
}

export function isPipelineRenderedSection(html: string): boolean {
  return /\bproduct-review\b/.test(html)
}

/** Turn editorial HTML paragraphs into plain text for markdown re-render. */
export function htmlParagraphsToText(html: string): string {
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter(Boolean)
  if (paragraphs.length > 0) return paragraphs.join('\n\n')
  return stripHtml(html)
}

export function extractListItems(ulHtml: string | undefined): string[] {
  if (!ulHtml) return []
  return [...ulHtml.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter(Boolean)
}
