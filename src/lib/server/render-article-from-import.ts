import { buildAffiliateProductUrl } from '@/utils/amazonAffiliateConfig'
import type { ArticleProductSpec } from '@/lib/server/affiliate-pipeline/types'
import { productSpecsFromImportJson } from '@/utils/claudeImportJson'

const PLACEHOLDER_IMAGE = 'PLACEHOLDER'

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function paragraphsToHtml(text: string | undefined | null, maxParagraphs?: number): string {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return ''
  const parts = trimmed
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const limited = maxParagraphs != null ? parts.slice(0, maxParagraphs) : parts
  return limited.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n')
}

function awardClass(color?: string): string {
  if (color === 'gold') return 'gold'
  if (color === 'value') return 'value'
  if (color === 'versatile') return 'versatile'
  return color?.trim() ?? ''
}

function productHeadingLink(
  headingText: string,
  affiliateUrl: string,
  id: string,
): string {
  const safeUrl = affiliateUrl.replace(/"/g, '&quot;')
  return `<h2 id="${id}"><a href="${safeUrl}" target="_blank" rel="nofollow sponsored noopener">${headingText}<span class="heading-link-icon" aria-hidden="true">↗</span></a></h2>`
}

function renderProduct(
  product: Record<string, unknown>,
  index: number,
  associateTag: string,
): string {
  const name = String(product.name ?? '').trim()
  const asin = String(product.asin ?? '').trim().toUpperCase()
  const tagline = String(product.tagline ?? '').trim()
  const awardLabel = String(product.award_label ?? '').trim()
  const awardColor = awardClass(String(product.award_color ?? ''))
  const priceRange = String(product.price_range ?? 'See on Amazon').trim()
  const pros = Array.isArray(product.pros) ? product.pros.map(String) : []
  const cons = Array.isArray(product.cons) ? product.cons.map(String) : []
  const bodyHtml = paragraphsToHtml(String(product.body ?? ''), 2)
  const bottomLine = String(product.bottom_line ?? '').trim()

  const specs = product.specs as Record<string, string> | undefined
  const specsHtml = specs
    ? Object.entries(specs)
        .map(
          ([key, value]) =>
            `<div class="spec-item"><span class="spec-label">${escapeHtml(key)}</span><span class="spec-value">${escapeHtml(String(value))}</span></div>`,
        )
        .join('')
    : ''

  const prosHtml = pros.map((p) => `<li>${escapeHtml(p)}</li>`).join('')
  const consHtml = cons.map((c) => `<li>${escapeHtml(c)}</li>`).join('')

  const affiliateUrl = /^[A-Z0-9]{10}$/.test(asin)
    ? buildAffiliateProductUrl(asin, associateTag)
    : '#'

  const headingSuffix = awardLabel ? ` — ${escapeHtml(awardLabel)}` : ''
  const headingText = `${escapeHtml(name)}${headingSuffix}`

  return `${productHeadingLink(headingText, affiliateUrl, `product-${index + 1}`)}
<div class="product-review">
  <div class="product-review-header">
    <div class="product-image-wrap">
      <span class="award-badge ${awardColor}">${escapeHtml(awardLabel)}</span>
      <img src="${PLACEHOLDER_IMAGE}" alt="${escapeHtml(name)}" loading="lazy">
    </div>
    <div class="product-info">
      <h3 class="product-name">${escapeHtml(name)}</h3>
      ${tagline ? `<p class="product-tagline">${escapeHtml(tagline)}</p>` : ''}
      ${specsHtml ? `<div class="spec-strip">${specsHtml}</div>` : ''}
    </div>
  </div>
  ${
    prosHtml || consHtml
      ? `<div class="proscons">
    <div class="proscons-col">
      <h4 class="pros-h">What we like</h4>
      <ul class="pros">${prosHtml}</ul>
    </div>
    <div class="proscons-col">
      <h4 class="cons-h">What we don't</h4>
      <ul class="cons">${consHtml}</ul>
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
      <div class="bottom-line-text">${escapeHtml(bottomLine)}</div>
    </div>`
        : ''
    }
  </div>
  <div class="review-cta">
    <div class="price-display">
      <span class="price-label">Price at time of writing</span>
      <span class="price-value">${escapeHtml(priceRange)}</span>
    </div>
    <a href="${affiliateUrl.replace(/"/g, '&quot;')}" class="btn btn-large" target="_blank" rel="nofollow sponsored noopener">
      <span class="btn-icon">→</span> Check ${escapeHtml(name)} on Amazon
    </a>
  </div>
</div>`
}

function renderFaq(faq: unknown): string {
  if (!Array.isArray(faq) || faq.length === 0) return ''
  const items = faq
    .map((entry) => {
      const row = entry as Record<string, unknown>
      const q = String(row.q ?? row.question ?? '').trim()
      const a = String(row.a ?? row.answer ?? '').trim()
      if (!q && !a) return ''
      return `<h3>${escapeHtml(q)}</h3>\n${paragraphsToHtml(a)}`
    })
    .filter(Boolean)
    .join('\n')

  if (!items) return ''
  return `<h2>Frequently Asked Questions</h2>\n${items}`
}

function renderTips(tips: unknown): string {
  if (!Array.isArray(tips) || tips.length === 0) return ''
  const items = tips.map(String).filter(Boolean)
  if (items.length === 0) return ''
  return `<h2>Quick Tips</h2>\n<ul>\n${items.map((t) => `<li>${escapeHtml(t)}</li>`).join('\n')}\n</ul>`
}

/** Render full article HTML from simplified Claude import JSON. */
export function renderArticleFromImportJson(
  importJson: Record<string, unknown>,
  options?: { associateTag?: string },
): string {
  const associateTag = options?.associateTag?.trim() ?? ''
  const parts: string[] = []

  const intro = paragraphsToHtml(String(importJson.intro ?? ''))
  if (intro) parts.push(intro)

  const tipsHtml = renderTips(importJson.tips)
  if (tipsHtml) parts.push(tipsHtml)

  const products = importJson.products
  if (Array.isArray(products)) {
    products.forEach((raw, index) => {
      if (raw && typeof raw === 'object') {
        parts.push(renderProduct(raw as Record<string, unknown>, index, associateTag))
      }
    })
  }

  const whatToLookFor = String(importJson.what_to_look_for ?? '').trim()
  if (whatToLookFor) {
    parts.push(`<h2>What to Look For</h2>\n${paragraphsToHtml(whatToLookFor)}`)
  }

  const whoShouldSkip = String(importJson.who_should_skip ?? '').trim()
  if (whoShouldSkip) {
    parts.push(`<h2>Who Should Skip This</h2>\n${paragraphsToHtml(whoShouldSkip)}`)
  }

  const community = String(importJson.community ?? '').trim()
  if (community) {
    parts.push(`<h2>What the Community Actually Uses</h2>\n${paragraphsToHtml(community)}`)
  }

  const faqHtml = renderFaq(importJson.faq)
  if (faqHtml) parts.push(faqHtml)

  const buyingGuide = paragraphsToHtml(String(importJson.buying_guide ?? ''))
  if (buyingGuide) {
    parts.push(`<h2>Buying Guide</h2>\n${buyingGuide}`)
  }

  return parts.filter(Boolean).join('\n\n')
}

export { productSpecsFromImportJson as extractProductSpecsFromImportJson }

export type { ArticleProductSpec }
