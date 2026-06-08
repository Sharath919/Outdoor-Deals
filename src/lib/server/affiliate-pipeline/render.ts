import { marked } from 'marked'
import { normalizeAffiliateUrl } from '@/utils/amazonAffiliateConfig'
import { htmlParagraphsToText } from './product-parse-utils'
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

  // Never run marked on HTML — it becomes escaped <pre><code> blocks (GFM)
  if (/[<]/.test(trimmed)) {
    const text = htmlParagraphsToText(trimmed)
    if (!text) return ''
    return text
      .split(/\n\n+/)
      .slice(0, 2)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join('\n')
  }

  const mdHtml = renderMarkdown(trimmed)
  const paragraphs = mdHtml.match(/<p\b[\s\S]*?<\/p>/gi) ?? []
  return paragraphs.slice(0, 2).join('\n')
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

export function renderCompareTable(products: HydratedProduct[]): string {
  if (products.length === 0) return ''

  const specKeys = new Set<string>()
  products.forEach((p) => Object.keys(p.specs ?? {}).forEach((k) => specKeys.add(k)))
  const specRows = [...specKeys].map((key) => ({
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
      ${products.map((p) => `<td class="col spec">${escapeHtml(p.specs?.[row.key] || '—')}</td>`).join('\n')}
    </tr>`,
    )
    .join('\n')

  const priceRow = `
    <tr>
      <th class="row-label">Price</th>
      ${products.map((p) => `<td class="col spec">${escapeHtml(p.price_range || '—')}</td>`).join('\n')}
    </tr>`

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
            ${priceRow}
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
  const headingText = `${escapeHtml(product.name)} — ${escapeHtml(product.tagline || product.best_for || '')}`
  const affiliateUrl = escapeAttr(product.affiliate_url)

  return `
    <h2 id="product-${index + 1}"><a href="${affiliateUrl}" target="_blank" rel="nofollow sponsored noopener">${headingText}<span class="heading-link-icon" aria-hidden="true">↗</span></a></h2>

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
          <span class="price-label">Price at time of writing</span>
          <span class="price-value">${escapeHtml(product.price_range || 'See on Amazon')}</span>
        </div>
        <a href="${escapeAttr(product.affiliate_url)}" class="btn btn-large" target="_blank" rel="nofollow sponsored noopener">
          <span class="btn-icon">→</span> Check ${escapeHtml(product.name || 'Price')} on Amazon
        </a>
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
