import type { GuideProduct } from '@/lib/articles-server'
import {
  findProductImageByTitle,
  injectReviewCardImages,
} from '@/lib/server/affiliate-pipeline/image-utils'
import { repairCorruptedPipelineHtml } from '@/lib/server/affiliate-pipeline/repair-html'
import { prepareArticleContentHtml } from '@/utils/articleContentHtml'
import { priceWatchSlotHtml } from '@/utils/priceWatchSlot'
import {
  PRODUCT_CTA_BUTTON_HTML,
  PRODUCT_PRICE_LABEL,
  extractBottomLineBlock,
  htmlToSentenceParagraphsHtml,
  parseHeadingNameTagline,
  productHeadingBlockHtml,
  reformatSectionToSentenceParagraphs,
  textToSentenceParagraphsHtml,
} from '@/utils/guideProductCopy'

export type GuideArticleSegments = {
  introHtml: string
  comparisonTableHtml: string | null
  bodyHtml: string
}

export type GuideBodySections = {
  quickTips: string
  products: string
  whatToLookFor: string
  whoShouldSkip: string
  community: string
  faq: string
  buyingGuide: string
  other: string
}

export type PreparedGuideArticle = GuideArticleSegments & {
  bodySections: GuideBodySections
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
  return findProductImageByTitle(title, products)
}

function findProductUrl(title: string, products: GuideProduct[], fallbackHref: string): string {
  const normalized = title.toLowerCase()
  const match = products.find((p) => {
    const pt = p.title.toLowerCase()
    return pt.includes(normalized.split(' ')[0]) || normalized.includes(pt.split(' ')[0])
  })
  return match?.affiliate_url ?? fallbackHref
}

function findProductUrlByIndex(index: number, products: GuideProduct[], fallbackHref: string): string {
  const ranked = products[index]
  return ranked?.affiliate_url ?? fallbackHref
}

function productHeadingHtml(
  id: string,
  name: string,
  tagline: string,
  productUrl: string,
): string {
  return productHeadingBlockHtml({ id, name, tagline, affiliateUrl: productUrl, escape: false })
}

function linkifyProductHeadings(html: string, products: GuideProduct[]): string {
  return html.replace(
    /<h2\b([^>]*)\bid="([^"]*)"([^>]*)>([\s\S]*?)<\/h2>(\s*(?:<p class="product-tagline-sub"[^>]*>[\s\S]*?<\/p>)?\s*)(<div class="product-review")/gi,
    (_full, _pre, id, _post, content, taglineBlock, after) => {
      const productIndex = /^product-(\d+)$/.exec(id)?.[1]
      const idx = productIndex ? Number(productIndex) - 1 : -1
      const url =
        idx >= 0
          ? findProductUrlByIndex(idx, products, '#')
          : findProductUrl(parseHeadingNameTagline(stripHtml(content)).name, products, '#')

      let name = ''
      let tagline = ''
      if (taglineBlock.trim()) {
        const linkInner = content.match(/<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? content
        name = parseHeadingNameTagline(stripHtml(linkInner)).name || stripHtml(linkInner)
        tagline = stripHtml(
          taglineBlock.match(/<p class="product-tagline-sub"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '',
        )
      } else {
        const linkInner = content.match(/<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? content
        const parsed = parseHeadingNameTagline(stripHtml(linkInner))
        name = parsed.name || stripHtml(linkInner)
        tagline = parsed.tagline || (idx >= 0 ? products[idx]?.tagline ?? '' : '')
      }

      if (!name && idx >= 0) name = products[idx]?.title ?? ''

      return `${productHeadingHtml(id, name, tagline, url)}${after}`
    },
  )
}

function reformatReviewBodyParagraphs(html: string): string {
  const reviewRe =
    /(<div class="review-body">)([\s\S]*?)(<\/div>\s*<div class="review-cta">)/gi
  return html.replace(reviewRe, (_full, open, body, close) => {
    const { body: bodyWithoutBottom, bottomLine } = extractBottomLineBlock(body)
    const reformatted = htmlToSentenceParagraphsHtml(bodyWithoutBottom)
    return `${open}${reformatted}${bottomLine}${close}`
  })
}

function normalizeProductCtaButtons(html: string): string {
  return html.replace(
    /(<a\b[^>]*class="[^"]*\bbtn-large\b[^"]*"[^>]*>)([\s\S]*?)(<\/a>)/gi,
    `$1${PRODUCT_CTA_BUTTON_HTML}$3`,
  )
}

function normalizePriceLabels(html: string): string {
  return html.replace(/Price at time of writing/gi, PRODUCT_PRICE_LABEL)
}

function splitIntroParagraphs(introHtml: string): { intro: string; overflow: string } {
  const trimmed = introHtml.trim()
  if (!trimmed) return { intro: '', overflow: '' }

  let paragraphs = trimmed.match(/<p\b[\s\S]*?<\/p>/gi) ?? []
  if (paragraphs.length === 0) {
    paragraphs = trimmed
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${p}</p>`)
  }

  const introParas = paragraphs.slice(0, 2).map((p) =>
    p.replace(/\bclass="[^"]*"/, '').replace(/<p\b/, '<p class="intro-paragraph"'),
  )
  const overflowParas = paragraphs.slice(2)

  return {
    intro: introParas.join('\n'),
    overflow: overflowParas.join('\n'),
  }
}

function formatIntroHtml(introHtml: string): string {
  return splitIntroParagraphs(introHtml).intro
}

function classifySectionHeading(headingText: string, h2Id: string, chunk: string): keyof GuideBodySections {
  const lower = headingText.toLowerCase()
  if (/quick tips/.test(lower)) return 'quickTips'
  if (/what to look for/.test(lower)) return 'whatToLookFor'
  if (/who should skip/.test(lower)) return 'whoShouldSkip'
  if (/community/.test(lower)) return 'community'
  if (/faq|frequently asked/.test(lower)) return 'faq'
  if (/buying guide/.test(lower)) return 'buyingGuide'
  if (/^product-\d+$/.test(h2Id) || /<div class="product-review"/.test(chunk)) return 'products'
  return 'other'
}

/** Remove watch slots wrongly placed inside headings or duplicated outside review-cta. */
function stripMisplacedPriceWatchSlots(html: string): string {
  let out = html.replace(
    /<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi,
    (_full, attrs, inner) => `<h2${attrs}>${inner.replace(/<div class="price-watch-slot"[\s\S]*?<\/div>\s*/gi, '')}</h2>`,
  )

  out = out.replace(
    /(<h2\b[^>]*\bid="product-\d+"[\s\S]*?)(<div class="price-watch-slot"[\s\S]*?<\/div>\s*)(?=<p class="product-tagline-sub"|<div class="product-review")/gi,
    '$1',
  )

  return out
}

/** Ensure exactly one watch slot per product, after the review CTA button. */
function injectPriceWatchSlotsInProducts(html: string, products: GuideProduct[]): string {
  const cleaned = stripMisplacedPriceWatchSlots(html)
  const parts = cleaned.split(/(?=<h2\b[^>]*\bid="product-\d+")/i)

  if (parts.length <= 1) return cleaned

  return parts
    .map((chunk) => {
      if (!/<h2\b[^>]*\bid="product-(\d+)"/i.test(chunk)) return chunk

      const idMatch = chunk.match(/\bid="product-(\d+)"/i)
      const idx = idMatch ? Number(idMatch[1]) - 1 : -1
      const product = idx >= 0 ? products[idx] : undefined

      const withoutSlots = chunk.replace(/<div class="price-watch-slot"[\s\S]*?<\/div>\s*/gi, '')
      const slot = priceWatchSlotHtml({
        asin: product?.asin,
        productName: product?.title ?? '',
        priceRange: product?.price_range,
      })

      if (!slot) return withoutSlots

      const withSlot = withoutSlots.replace(
        /(<div class="review-cta">[\s\S]*?<a[^>]*class="[^"]*\bbtn-large\b[^"]*"[^>]*>[\s\S]*?<\/a>)/i,
        `$1\n        ${slot}`,
      )

      return withSlot
    })
    .join('')
}

export function parseGuideBodySections(bodyHtml: string): GuideBodySections {
  const sections: GuideBodySections = {
    quickTips: '',
    products: '',
    whatToLookFor: '',
    whoShouldSkip: '',
    community: '',
    faq: '',
    buyingGuide: '',
    other: '',
  }

  const trimmed = bodyHtml.trim()
  if (!trimmed) return sections

  const chunks = trimmed.split(/(?=<h2\b)/i).filter(Boolean)
  const productParts: string[] = []

  for (const chunk of chunks) {
    const h2Match = chunk.match(/^<h2\b([^>]*)>([\s\S]*?)<\/h2>/i)
    if (!h2Match) {
      sections.other += chunk
      continue
    }

    const attrs = h2Match[1] ?? ''
    const idMatch = attrs.match(/\bid="([^"]*)"/i)
    const h2Id = idMatch?.[1] ?? ''
    const headingText = stripHtml(h2Match[2])
    const kind = classifySectionHeading(headingText, h2Id, chunk)

    if (kind === 'products') {
      productParts.push(chunk)
      continue
    }

    sections[kind] += chunk
  }

  sections.products = productParts.join('\n')

  if (
    sections.other.trim() &&
    !sections.buyingGuide.trim() &&
    /<p\b/i.test(sections.other) &&
    !/<h2\b/i.test(sections.other)
  ) {
    sections.buyingGuide = sections.other.trim()
    sections.other = ''
  }

  return sections
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
  const bodyText =
    bodyHtml.match(/<p\b[\s\S]*?<\/p>/gi)?.map((p) => stripHtml(p)).join(' ') ?? stripHtml(bodyHtml)
  bodyHtml = textToSentenceParagraphsHtml(bodyText)

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

  return productHeadingHtml(id, name, tagline, productUrl) +
`<div class="product-review">
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
      <span class="price-label">${PRODUCT_PRICE_LABEL}</span>
      <span class="price-value">${priceSpec.value}</span>
    </div>`
        : `<div class="price-display">
      <span class="price-label">${PRODUCT_PRICE_LABEL}</span>
      <span class="price-value">See on Amazon</span>
    </div>`
    }
    <a href="${productUrl}" class="btn btn-large" target="_blank" rel="noopener noreferrer sponsored">${PRODUCT_CTA_BUTTON_HTML}</a>
    ${priceWatchSlotHtml({
      asin: products[index]?.asin ?? null,
      productName: name,
      priceRange: priceSpec?.value ?? products[index]?.price_range,
    })}
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
  return html
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
    () =>
      `<a href="#" class="btn btn-large" target="_blank" rel="noopener noreferrer sponsored">${PRODUCT_CTA_BUTTON_HTML}</a>`,
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
    introHtml: formatIntroHtml(introHtml.trim()),
    comparisonTableHtml,
    bodyHtml: bodyHtml.trim(),
  }
}

function stripImgTags(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, '')
}

export type PrepareGuideArticleOptions = {
  /** When false, product images are removed server-side (URLs never ship to client). */
  showProductImages?: boolean
}

export function prepareGuideArticleHtml(
  rawHtml: string,
  products: GuideProduct[] = [],
  options: PrepareGuideArticleOptions = {},
): PreparedGuideArticle {
  const showProductImages = options.showProductImages ?? true
  let html = repairCorruptedPipelineHtml(prepareArticleContentHtml(rawHtml))
  html = html.replace(EMPTY_AFFILIATE_CTA_RE, '')
  html = injectReviewCardImages(
    html,
    products.map((p) => ({ title: p.title, image_url: p.image_url })),
  )

  const isPipelineHtml = /\bproduct-review\b/.test(html)

  const segments = segmentGuideArticleHtml(html)

  if (!isPipelineHtml) {
    segments.bodyHtml = transformProductSections(segments.bodyHtml, products)
    segments.bodyHtml = styleAffiliateLinks(segments.bodyHtml)
  } else if (!segments.introHtml && segments.bodyHtml) {
    const leading = (segments.bodyHtml.match(/^([\s\S]*?)(?=<h2\b)/i)?.[1] ?? '').trim()
    const { intro, overflow } = splitIntroParagraphs(leading)
    segments.introHtml = intro
    if (overflow) {
      segments.bodyHtml = `${overflow}\n${segments.bodyHtml.replace(/^([\s\S]*?)(?=<h2\b)/i, '').trim()}`
    } else {
      segments.bodyHtml = segments.bodyHtml.replace(/^([\s\S]*?)(?=<h2\b)/i, '').trim()
    }
  }

  segments.bodyHtml = linkifyProductHeadings(segments.bodyHtml, products)
  segments.bodyHtml = reformatReviewBodyParagraphs(segments.bodyHtml)
  segments.bodyHtml = normalizeProductCtaButtons(segments.bodyHtml)
  segments.bodyHtml = normalizePriceLabels(segments.bodyHtml)

  if (segments.comparisonTableHtml) {
    segments.comparisonTableHtml = wrapComparisonTable(segments.comparisonTableHtml)
  }

  const { intro: formattedIntro, overflow: introOverflow } = splitIntroParagraphs(
    segments.introHtml,
  )
  segments.introHtml = formattedIntro

  const bodySections = parseGuideBodySections(segments.bodyHtml)
  if (introOverflow) {
    const overflowFormatted = htmlToSentenceParagraphsHtml(introOverflow)
    if (bodySections.buyingGuide.trim()) {
      bodySections.buyingGuide = bodySections.buyingGuide.replace(
        /(<h2\b[^>]*>[\s\S]*?<\/h2>)/i,
        `$1\n${overflowFormatted}\n`,
      )
    } else {
      bodySections.buyingGuide = overflowFormatted
    }
  }

  bodySections.whatToLookFor = reformatSectionToSentenceParagraphs(bodySections.whatToLookFor)
  bodySections.whoShouldSkip = reformatSectionToSentenceParagraphs(bodySections.whoShouldSkip)
  bodySections.community = reformatSectionToSentenceParagraphs(bodySections.community)
  bodySections.buyingGuide = reformatSectionToSentenceParagraphs(bodySections.buyingGuide)
  bodySections.products = injectPriceWatchSlotsInProducts(
    normalizePriceLabels(
      normalizeProductCtaButtons(reformatReviewBodyParagraphs(bodySections.products)),
    ),
    products,
  )

  if (!showProductImages) {
    segments.introHtml = stripImgTags(segments.introHtml)
    if (segments.comparisonTableHtml) {
      segments.comparisonTableHtml = stripImgTags(segments.comparisonTableHtml)
    }
    segments.bodyHtml = stripImgTags(segments.bodyHtml)
    for (const key of Object.keys(bodySections) as Array<keyof GuideBodySections>) {
      bodySections[key] = stripImgTags(bodySections[key])
    }
  }

  return {
    ...segments,
    bodySections,
  }
}

export function estimateReadMinutes(html: string): number {
  const text = stripHtml(html)
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 220))
}

export function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'GS'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
