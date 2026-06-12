import { marked } from 'marked'
import { normalizeAffiliateUrl } from '@/utils/amazonAffiliateConfig'
import {
  PRODUCT_CTA_BUTTON_HTML,
  PRODUCT_PRICE_LABEL,
  productHeadingBlockHtml,
  textToSentenceParagraphsHtml,
} from '@/utils/guideProductCopy'
import { htmlParagraphsToText } from './product-parse-utils'
import { priceWatchSlotHtml } from '@/utils/priceWatchSlot'
import type { HydratedProduct, HydratedArticleSpec, PipelineRenderResult } from './types'

marked.setOptions({ gfm: true, breaks: true })

function escapeAttr(s: string): string {
  return normalizeAffiliateUrl(s)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function renderMarkdown(md: string): string {
  if (!md.trim()) return ''
  return marked.parse(md.trim()) as string
}

function renderBodyContent(body: string): string {
  const trimmed = body.trim()
  if (!trimmed) return ''

  if (/[<]/.test(trimmed)) {
    const text = htmlParagraphsToText(trimmed)
    if (!text) return ''
    return textToSentenceParagraphsHtml(text)
  }

  const mdHtml = renderMarkdown(trimmed)
  const text = mdHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return textToSentenceParagraphsHtml(text)
}

function awardClass(color?: string): string {
  if (color === 'gold') return 'gold'
  if (color === 'value') return 'value'
  if (color === 'versatile') return 'versatile'
  return color ?? ''
}

function renderComparePhoto(product: HydratedProduct): string {
  const color = awardClass(product.award_color)
  const img = product.image_url
    ? `<img class="compare-img" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.image_alt || product.name)}" loading="lazy">`
    : `<div class="compare-img-placeholder">${escapeHtml(product.name || product.asin)}<br>image pending</div>`

  return `
    <td class="col compare-img-cell">
      <div class="compare-award ${color}">${escapeHtml(product.award_label || '')}</div>
      <a href="${escapeAttr(product.affiliate_url)}" target="_blank" rel="nofollow sponsored noopener">
        ${img}
      </a>
    </td>`
}

const MAX_COMPARE_SPEC_ROWS = 4

function normalizeSpecKey(key: string): string {
  return key.toLowerCase().replace(/\s+/g, '_')
}

function findSpecKey(allKeys: string[], candidates: string[]): string | undefined {
  const byNormalized = new Map(allKeys.map((key) => [normalizeSpecKey(key), key]))
  for (const candidate of candidates) {
    const match = byNormalized.get(candidate)
    if (match) return match
  }
  return undefined
}

function uniqueSpecValueCount(products: HydratedProduct[], key: string): number {
  return new Set(
    products.map((product) => (product.specs?.[key] ?? '').trim()).filter(Boolean),
  ).size
}

/** Pick up to 4 spec rows with editorial priority and most-differentiating fallback. */
export function selectCompareSpecKeys(
  products: HydratedProduct[],
  maxRows = MAX_COMPARE_SPEC_ROWS,
): string[] {
  const allKeys = [...new Set(products.flatMap((product) => Object.keys(product.specs ?? {})))]
  if (allKeys.length <= maxRows) return allKeys

  const selected: string[] = []
  const used = new Set<string>()

  const pick = (key: string | undefined) => {
    if (!key || used.has(key) || selected.length >= maxRows) return
    selected.push(key)
    used.add(key)
  }

  pick(findSpecKey(allKeys, ['weight']))
  pick(findSpecKey(allKeys, ['capacity', 'lumens', 'temp_rating']))
  pick(findSpecKey(allKeys, ['waterproof']))

  const remaining = allKeys
    .filter((key) => !used.has(key))
    .sort((a, b) => {
      const diff = uniqueSpecValueCount(products, b) - uniqueSpecValueCount(products, a)
      if (diff !== 0) return diff
      return a.localeCompare(b)
    })

  for (const key of remaining) {
    if (selected.length >= maxRows) break
    pick(key)
  }

  return selected
}

function renderCompareSpecValue(raw: string | undefined): string {
  const value = (raw ?? '').trim()
  if (!value) return '—'
  if (value === 'Yes') return '<span class="compare-yes" aria-label="Yes">✓</span>'
  if (value === 'No') return '<span class="compare-no" aria-label="No">✗</span>'
  return escapeHtml(value)
}

export function renderCompareTable(products: HydratedProduct[]): string {
  if (products.length === 0) return ''

  const specKeys = selectCompareSpecKeys(products)
  const specRows = specKeys.map((key) => ({
    label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
    key,
  }))

  const photoRow = `
    <tr>
      <th class="row-label">Photo</th>
      ${products.map(renderComparePhoto).join('\n')}
    </tr>`

  const nameRow = `
    <tr>
      <th class="row-label">Product</th>
      ${products.map((p) => `<td class="col compare-name">${escapeHtml(p.name || '')}</td>`).join('\n')}
    </tr>`

  const specHtml = specRows
    .map(
      (row) => `
    <tr>
      <th class="row-label">${escapeHtml(row.label)}</th>
      ${products.map((p) => `<td class="col spec">${renderCompareSpecValue(p.specs?.[row.key])}</td>`).join('\n')}
    </tr>`,
    )
    .join('\n')

  const ctaRow = `
    <tr>
      <th class="row-label">Buy Now</th>
      ${products
        .map(
          (p) => `
        <td class="col compare-cta-cell">
          <a href="${escapeAttr(p.affiliate_url)}" class="compare-cta-btn" target="_blank" rel="nofollow sponsored noopener">Check Price →</a>
        </td>`,
        )
        .join('\n')}
    </tr>`

  return `
    <div class="compare-section">
      <div class="compare-wrap">
        <table class="compare">
          <tbody>
            ${photoRow}
            ${nameRow}
            ${specHtml}
            ${ctaRow}
          </tbody>
        </table>
      </div>
    </div>`
}

export function renderProductReview(product: HydratedProduct, index: number): string {
  const color = awardClass(product.award_color)
  const imageBlock = product.image_url
    ? `<img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.image_alt || product.name)}" loading="lazy">`
    : `<div class="product-image-placeholder">${escapeHtml(product.name || product.asin)}<br>image pending</div>`

  const specsHtml = Object.entries(product.specs ?? {})
    .map(
      ([key, value]) => `
    <div class="spec-item">
      <span class="spec-label">${escapeHtml(key.replace(/_/g, ' '))}</span>
      <span class="spec-value">${escapeHtml(value)}</span>
    </div>`,
    )
    .join('')

  const prosHtml = (product.pros ?? []).map((p) => `<li>${escapeHtml(p)}</li>`).join('')
  const consHtml = (product.cons ?? []).map((c) => `<li>${escapeHtml(c)}</li>`).join('')
  const bodyHtml = product.body ? renderBodyContent(product.body) : ''
  const affiliateUrl = escapeAttr(product.affiliate_url)
  const tagline = product.tagline || product.best_for || ''
  const headingBlock = productHeadingBlockHtml({
    id: `product-${index + 1}`,
    name: product.name || '',
    tagline,
    affiliateUrl: product.affiliate_url,
  })

  return `
    ${headingBlock}

    <div class="product-review">
      <div class="product-review-header">
        <div class="product-image-wrap">
          <span class="award-badge ${color}">${escapeHtml(product.award_label || '')}</span>
          ${imageBlock}
        </div>
        <div class="product-info">
          <h3 class="product-name">${escapeHtml(product.name || '')}</h3>
          <p class="product-tagline">${escapeHtml(product.tagline || '')}</p>
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
          product.bottom_line
            ? `<div class="bottom-line">
          <div class="bottom-line-label">Bottom line</div>
          <div class="bottom-line-text">${escapeHtml(product.bottom_line)}</div>
        </div>`
            : ''
        }
      </div>

      <div class="review-cta">
        <div class="price-display">
          <span class="price-label">${PRODUCT_PRICE_LABEL}</span>
          <span class="price-value">${escapeHtml(product.price_range || 'See on Amazon')}</span>
        </div>
        <a href="${affiliateUrl}" class="btn btn-large" target="_blank" rel="nofollow sponsored noopener">
          ${PRODUCT_CTA_BUTTON_HTML}
        </a>
        ${priceWatchSlotHtml({ asin: product.asin, productName: product.name || '', priceRange: product.price_range })}
      </div>
    </div>`
}

export function renderArticleBody(spec: HydratedArticleSpec): PipelineRenderResult {
  const introHtml = renderMarkdown(spec.intro ?? '')
  const buyersGuideHtml = renderMarkdown(spec.buyers_guide ?? '')
  const reviewsHtml = spec.products.map((p, i) => renderProductReview(p, i)).join('\n')
  const compareTableHtml = renderCompareTable(spec.products)
  const tailHtml = spec.tail_html?.trim() ?? ''

  const contentHtml = [introHtml, buyersGuideHtml, reviewsHtml, tailHtml].filter(Boolean).join('\n\n')

  return {
    contentHtml,
    compareTableHtml,
    introHtml,
    buyersGuideHtml,
    reviewsHtml,
  }
}
