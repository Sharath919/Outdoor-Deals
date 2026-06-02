import type { GuideProduct } from '@/lib/articles-server'
import { prepareArticleContentHtml } from '@/utils/articleContentHtml'

export type GuideArticleSegments = {
  introHtml: string
  comparisonTableHtml: string | null
  bodyHtml: string
}

const PRODUCT_H3_RE = /<h3\b[^>]*>([\s\S]*?)<\/h3>/gi
const TABLE_RE = /<table\b[\s\S]*?<\/table>/i
const AFFILIATE_LINK_RE =
  /<a\b([^>]*)\bclass="affiliate-link"([^>]*)>([\s\S]*?)<\/a>/gi
const EMPTY_AFFILIATE_CTA_RE = /<div[^>]*\baffiliate-cta\b[^>]*>\s*<\/div>/gi

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim()
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function parseProductHeading(raw: string): { name: string; tagline: string } {
  const text = stripHtml(raw)
  const parts = text.split(/\s*[—–]\s*/)
  if (parts.length >= 2) {
    return { name: parts[0].trim(), tagline: parts.slice(1).join(' — ').trim() }
  }
  return { name: text, tagline: '' }
}

function parseSpecList(ulHtml: string): {
  specs: Array<{ label: string; value: string }>
  bestFor: string[]
  notIdealFor: string[]
} {
  const specs: Array<{ label: string; value: string }> = []
  const bestFor: string[] = []
  const notIdealFor: string[] = []

  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi
  let match: RegExpExecArray | null
  while ((match = liRe.exec(ulHtml)) !== null) {
    const inner = match[1]
    const labelMatch = inner.match(/<strong\b[^>]*>([^<]+):<\/strong>\s*([\s\S]*)/i)
    if (!labelMatch) continue
    const label = labelMatch[1].trim()
    const value = stripHtml(labelMatch[2])
    if (/^best for$/i.test(label)) {
      bestFor.push(...value.split(/,\s*/))
    } else if (/^not ideal for$/i.test(label)) {
      notIdealFor.push(...value.split(/,\s*/))
    } else {
      specs.push({ label, value })
    }
  }

  return { specs, bestFor, notIdealFor }
}

function findProductImage(title: string, products: GuideProduct[]): string | null {
  const normalized = title.toLowerCase()
  const match = products.find((p) => p.title.toLowerCase().includes(normalized.split(' ')[0]))
  return match?.image_url ?? null
}

function findProductUrl(title: string, products: GuideProduct[], fallbackHref: string): string {
  const normalized = title.toLowerCase()
  const match = products.find((p) => {
    const pt = p.title.toLowerCase()
    return pt.includes(normalized.split(' ')[0]) || normalized.includes(pt.split(' ')[0])
  })
  return match?.affiliate_url ?? fallbackHref
}

function awardBadgeClass(index: number): string {
  if (index === 0) return 'gold'
  if (index === 2) return 'value'
  return ''
}

function awardBadgeLabel(index: number, tagline: string): string {
  if (index === 0) return 'Top Pick'
  if (/value|budget/i.test(tagline)) return 'Budget'
  if (/versatile/i.test(tagline)) return 'Versatile'
  return tagline.split(' ').slice(0, 2).join(' ')
}

function buildProductReviewCard(
  sectionHtml: string,
  headingRaw: string,
  index: number,
  products: GuideProduct[],
): string {
  const { name, tagline } = parseProductHeading(headingRaw)
  const id = slugify(name)

  const ulMatch = sectionHtml.match(/<ul\b[\s\S]*?<\/ul>/i)
  const ulHtml = ulMatch?.[0] ?? ''
  const { specs, bestFor, notIdealFor } = parseSpecList(ulHtml)

  const affiliateMatch = sectionHtml.match(
    /<a\b[^>]*\bclass="affiliate-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i,
  )
  const affiliateHref = affiliateMatch?.[1] ?? '#'
  const affiliateText = stripHtml(affiliateMatch?.[2] ?? `Check ${name} Price on Amazon`)
  const productUrl = findProductUrl(name, products, affiliateHref)

  let bodyHtml = sectionHtml
    .replace(/<ul\b[\s\S]*?<\/ul>/i, '')
    .replace(/<a\b[^>]*\bclass="affiliate-link"[^>]*>[\s\S]*?<\/a>/i, '')
    .trim()

  const paragraphs = bodyHtml.match(/<p\b[\s\S]*?<\/p>/gi) ?? []
  let bottomLine = ''
  if (paragraphs.length > 0) {
    const last = paragraphs[paragraphs.length - 1]
    if (/limitation|downside|tradeoff|catch|honest/i.test(stripHtml(last))) {
      bottomLine = stripHtml(last)
      bodyHtml = bodyHtml.replace(last, '')
    }
  }

  const priceSpec = specs.find((s) => /^price$/i.test(s.label))
  const badgeClass = awardBadgeClass(index)
  const badgeLabel = awardBadgeLabel(index, tagline)
  const imageUrl = findProductImage(name, products)

  const specItems = specs
    .filter((s) => !/^price$/i.test(s.label))
    .slice(0, 4)
    .map(
      (s) =>
        `<div class="spec-item"><span class="spec-label">${s.label}</span><span class="spec-value">${s.value}</span></div>`,
    )
    .join('')

  const prosList = bestFor.map((item) => `<li>${item}</li>`).join('')
  const consList = notIdealFor.map((item) => `<li>${item}</li>`).join('')

  const imageInner = imageUrl
    ? `<img src="${imageUrl}" alt="${name}" />`
    : `<span class="product-image-placeholder">${name}</span>`

  return `<h2 id="${id}">${name}${tagline ? ` — ${tagline}` : ''}</h2>
<div class="product-review">
  <div class="product-review-header">
    <div class="product-image">
      <span class="award-badge${badgeClass ? ` ${badgeClass}` : ''}">${badgeLabel}</span>
      ${imageInner}
    </div>
    <div class="product-info">
      <div>
        <h3 class="product-name">${name}</h3>
        ${tagline ? `<p class="product-tagline">${tagline}</p>` : ''}
        ${specItems ? `<div class="spec-strip">${specItems}</div>` : ''}
      </div>
    </div>
  </div>
  ${
    prosList || consList
      ? `<div class="proscons">
    <div class="proscons-col">
      <h4 class="pros-h">What we like</h4>
      <ul class="pros">${prosList}</ul>
    </div>
    <div class="proscons-col">
      <h4 class="cons-h">What we don't</h4>
      <ul class="cons">${consList}</ul>
    </div>
  </div>`
      : ''
  }
  <div class="review-body">
    ${bodyHtml}
    ${
      bottomLine
        ? `<div class="bottom-line">
      <div class="bottom-line-label">Bottom line</div>
      <div class="bottom-line-text">${bottomLine}</div>
    </div>`
        : ''
    }
  </div>
  <div class="review-cta">
    ${
      priceSpec
        ? `<div class="price-display">
      <span class="price-label">Price at time of writing</span>
      <span class="price-value">${priceSpec.value}</span>
    </div>`
        : ''
    }
    <a href="${productUrl}" class="btn btn-large" target="_blank" rel="noopener noreferrer sponsored"><span class="btn-icon">→</span> ${affiliateText}</a>
  </div>
</div>`
}

function transformProductSections(html: string, products: GuideProduct[]): string {
  const h3Matches: Array<{ index: number; length: number; heading: string }> = []
  let match: RegExpExecArray | null
  const re = new RegExp(PRODUCT_H3_RE.source, 'gi')
  while ((match = re.exec(html)) !== null) {
    const heading = match[1]
    if (!/—|–|-/.test(stripHtml(heading))) continue
    if (/worth it\?|difference between|how long|reddit|lumens/i.test(stripHtml(heading))) continue
    h3Matches.push({ index: match.index, length: match[0].length, heading })
  }

  if (h3Matches.length === 0) return html

  let out = ''
  let cursor = 0
  h3Matches.forEach((h3, i) => {
    out += html.slice(cursor, h3.index)
    const sectionStart = h3.index + h3.length
    const nextBoundary = h3Matches[i + 1]?.index ?? html.length
    const sectionHtml = html.slice(sectionStart, nextBoundary)
    out += buildProductReviewCard(sectionHtml, h3.heading, i, products)
    cursor = nextBoundary
  })
  out += html.slice(cursor)
  return out
}

function markLeadParagraph(html: string): string {
  return html.replace(/<p\b([^>]*)>/, '<p class="lead"$1>')
}

function wrapComparisonTable(html: string): string {
  return html.replace(TABLE_RE, (table) => {
    let styled = table
    if (!/\bclass="comparison"/.test(styled)) {
      styled = styled.replace(/<table\b/, '<table class="comparison"')
    }
    styled = styled.replace(
      /<td\b([^>]*)>([^<]+)<\/td>/gi,
      (full, attrs, text) => {
        if (/<td class="product-cell"/.test(full)) return full
        const trimmed = text.trim()
        if (/^(Petzl|Black Diamond|Energizer|Foxelli|[A-Z][a-z]+)/.test(trimmed) && trimmed.length < 60) {
          return `<td class="product-cell"${attrs}>${text}</td>`
        }
        return full
      },
    )
    return `<div class="comparison-wrap">${styled}</div>`
  })
}

function styleAffiliateLinks(html: string): string {
  return html.replace(
    AFFILIATE_LINK_RE,
    (_full, _pre, _post, text) =>
      `<a href="#" class="btn btn-large" target="_blank" rel="noopener noreferrer sponsored"><span class="btn-icon">→</span> ${stripHtml(text)}</a>`,
  )
}

export function segmentGuideArticleHtml(html: string): GuideArticleSegments {
  let working = html.trim()

  const tableMatch = working.match(TABLE_RE)
  const comparisonTableHtml = tableMatch ? tableMatch[0] : null
  if (comparisonTableHtml) {
    working = working.replace(TABLE_RE, '')
    // Remove orphaned comparison heading when table is lifted out
    working = working.replace(
      /<h2\b[^>]*>\s*[^<]*(?:quick comparison|comparison table)[^<]*<\/h2>\s*/i,
      '',
    )
  }

  const firstH2 = working.search(/<h2\b/i)
  const introHtml = firstH2 === -1 ? working : working.slice(0, firstH2)
  const bodyHtml = firstH2 === -1 ? '' : working.slice(firstH2)

  return {
    introHtml: markLeadParagraph(introHtml.trim()),
    comparisonTableHtml,
    bodyHtml: bodyHtml.trim(),
  }
}

export function prepareGuideArticleHtml(
  rawHtml: string,
  products: GuideProduct[] = [],
): GuideArticleSegments {
  let html = prepareArticleContentHtml(rawHtml)
  html = html.replace(EMPTY_AFFILIATE_CTA_RE, '')

  const isPipelineHtml = /\bproduct-review\b/.test(html)

  const segments = segmentGuideArticleHtml(html)

  if (!isPipelineHtml) {
    segments.bodyHtml = transformProductSections(segments.bodyHtml, products)
    segments.bodyHtml = styleAffiliateLinks(segments.bodyHtml)
  } else if (!segments.introHtml && segments.bodyHtml) {
    segments.introHtml = markLeadParagraph(
      (segments.bodyHtml.match(/^([\s\S]*?)(?=<h2\b)/i)?.[1] ?? '').trim(),
    )
  }

  if (segments.comparisonTableHtml) {
    segments.comparisonTableHtml = wrapComparisonTable(segments.comparisonTableHtml)
  }

  return segments
}

export function estimateReadMinutes(html: string): number {
  const text = stripHtml(html)
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 220))
}

export function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'OD'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
