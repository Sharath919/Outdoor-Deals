import { LEGACY_SECTION_BREAK_MARKER } from './sectionBreak'
import type { AffiliateCtaPlacement } from '@/types/affiliateCta'
import type { CtaSlot1Type } from '@/types/affiliateCta'

const H2_DIVIDER = `<div class="article-h2-divider flex items-center gap-4 my-10" aria-hidden="true">
  <div class="flex-1 h-px bg-white/[0.08]"></div>
  <span class="text-amber-400/40 text-sm">✦</span>
  <div class="flex-1 h-px bg-white/[0.08]"></div>
</div>`

/** <!-- SECTION BREAK --> or <!-- SECTION BREAK: card --> or <!-- SECTION BREAK: https://... --> */
const SECTION_BREAK_RE = /<!--\s*SECTION BREAK(?:\s*:\s*([^>]*?))?\s*-->/gi

const INLINE_CTA_RE = /(<div[^>]*\binline-cta\b[^>]*>[\s\S]*?<\/div>)/i
const AFFILIATE_CTA_RE = /<div[^>]*\baffiliate-cta\b[^>]*>[\s\S]*?<\/div>/gi

export const CTA_SLOT2_MARKER = '<!-- LIMANSA_CTA_SLOT2 -->'

const SECTION_BREAK_DIVIDER = `<div class="article-section-break" style="text-align: center; padding: 2rem 0; color: rgba(201,168,76,0.4); font-size: 1.25rem; letter-spacing: 0.5rem;" aria-hidden="true">✦ ✦ ✦</div>`

function sectionBreakHtml(): string {
  return SECTION_BREAK_DIVIDER
}

/** Section break markers should appear before inline CTAs, not after them. */
function moveSectionBreakMarkersBeforeInlineCta(html: string): string {
  return html.replace(
    /(<div[^>]*\binline-cta\b[^>]*>[\s\S]*?<\/div>)\s*(<!--\s*SECTION BREAK[\s\S]*?-->)/gi,
    '$2\n$1',
  )
}

/** After rendering, move section break blocks before any following inline CTA. */
function moveSectionBreakBlocksBeforeInlineCta(html: string): string {
  return html.replace(
    /(<div[^>]*\binline-cta\b[^>]*>[\s\S]*?<\/div>)\s*(<div class="article-section-break"[\s\S]*?<\/div>)/gi,
    '$2\n$1',
  )
}

export function replaceSectionBreaks(html: string): string {
  let out = html.replace(SECTION_BREAK_RE, () => sectionBreakHtml())

  if (out.includes(LEGACY_SECTION_BREAK_MARKER)) {
    out = out.split(LEGACY_SECTION_BREAK_MARKER).join(sectionBreakHtml())
  }

  return out
}

/** Split processed HTML so the deepen CTA can render immediately after the inline-cta block. */
export function splitArticleContentAfterInlineCta(html: string): {
  before: string
  after: string
} | null {
  const match = html.match(INLINE_CTA_RE)
  if (!match || match.index === undefined) return null
  const endIndex = match.index + match[0].length
  return {
    before: html.slice(0, endIndex),
    after: html.slice(endIndex),
  }
}

export function stripInlineCtaBlock(html: string): string {
  return html.replace(INLINE_CTA_RE, '')
}

function insertAfterHeadingSection(html: string, titlePattern: RegExp): string {
  const h2Re = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi
  let match: RegExpExecArray | null
  while ((match = h2Re.exec(html)) !== null) {
    if (!titlePattern.test(match[1])) continue
    const sectionStart = match.index + match[0].length
    const rest = html.slice(sectionStart)
    const nextH2 = rest.search(/<h2\b/i)
    const insertAt = nextH2 === -1 ? html.length : sectionStart + nextH2
    return `${html.slice(0, insertAt)}${CTA_SLOT2_MARKER}${html.slice(insertAt)}`
  }
  return `${html}${CTA_SLOT2_MARKER}`
}

/** Replace raw affiliate-cta divs with a React mount marker and apply admin placement. */
export function applyAffiliateCtaPlacement(
  html: string,
  placement: AffiliateCtaPlacement,
): string {
  let out = html.replace(AFFILIATE_CTA_RE, CTA_SLOT2_MARKER)

  if (placement === 'after-this-does-not-mean') {
    if (!out.includes(CTA_SLOT2_MARKER)) {
      out = insertAfterHeadingSection(out, /does not mean/i)
    }
    return out
  }

  out = out.replace(new RegExp(CTA_SLOT2_MARKER, 'g'), '')

  if (placement === 'before-faq') {
    return out.replace(/(<h2\b[^>]*>\s*FAQ\s*<\/h2>)/i, `${CTA_SLOT2_MARKER}\n$1`)
  }

  if (placement === 'after-combinations') {
    return insertAfterHeadingSection(out, /combinations/i)
  }

  return out
}

export function splitArticleContentAtSlot2(html: string): {
  before: string
  after: string
} {
  const idx = html.indexOf(CTA_SLOT2_MARKER)
  if (idx === -1) {
    return { before: html, after: '' }
  }
  return {
    before: html.slice(0, idx),
    after: html.slice(idx + CTA_SLOT2_MARKER.length),
  }
}

export type ArticleContentSegments = {
  beforeSlot1: string
  afterSlot1BeforeSlot2: string
  afterSlot2: string
}

export function buildArticleContentSegments(
  rawHtml: string,
  options: {
    slot1Type: CtaSlot1Type
    placement: AffiliateCtaPlacement
  },
): ArticleContentSegments {
  let html = prepareArticleContentHtml(rawHtml)
  html = applyAffiliateCtaPlacement(html, options.placement)

  const stripInline =
    options.slot1Type === 'limansa' || options.slot1Type === 'affiliate'
  if (stripInline) {
    html = stripInlineCtaBlock(html)
  }

  const slot1Split = splitArticleContentAfterInlineCta(html)
  if (!slot1Split) {
    const slot2Split = splitArticleContentAtSlot2(html)
    return {
      beforeSlot1: slot2Split.before,
      afterSlot1BeforeSlot2: '',
      afterSlot2: slot2Split.after,
    }
  }

  const slot2Split = splitArticleContentAtSlot2(slot1Split.after)
  return {
    beforeSlot1: slot1Split.before,
    afterSlot1BeforeSlot2: slot2Split.before,
    afterSlot2: slot2Split.after,
  }
}

/** Insert divider before each h2 except the first. */
export function insertH2SectionDividers(html: string): string {
  let seenH2 = false
  return html.replace(/<h2\b[^>]*>/gi, (match) => {
    if (!seenH2) {
      seenH2 = true
      return match
    }
    return H2_DIVIDER + match
  })
}

/** Wrap FAQ block so h3/p can be styled as accordion-like Q&A. */
export function wrapFaqSection(html: string): string {
  const match = html.match(/<h2\b[^>]*>\s*FAQ\s*<\/h2>/i)
  if (!match || match.index === undefined) return html

  const before = html.slice(0, match.index + match[0].length)
  const after = html.slice(match.index + match[0].length)
  const styled = after.replace(/<h3\b([^>]*)>/gi, '<h3 class="article-faq-q"$1>')

  return `${before}<div class="article-faq">${styled}</div>`
}

export function prepareArticleContentHtml(html: string): string {
  let out = html
  out = insertH2SectionDividers(out)
  out = moveSectionBreakMarkersBeforeInlineCta(out)
  out = replaceSectionBreaks(out)
  out = moveSectionBreakBlocksBeforeInlineCta(out)
  out = wrapFaqSection(out)
  return out
}
