const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}

export function escapeEditorialHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => HTML_ESCAPE[char] ?? char)
}

export const PRODUCT_CTA_LABEL = 'Check Price on Amazon'

export const PRODUCT_CTA_BUTTON_HTML = `<span class="btn-icon">→</span> ${PRODUCT_CTA_LABEL}`

export const PRODUCT_PRICE_LABEL = 'Estimated price'

function splitSentences(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  return trimmed
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function groupSentences(sentences: string[], maxPerParagraph = 2): string[] {
  const groups: string[] = []
  for (let i = 0; i < sentences.length; i += maxPerParagraph) {
    groups.push(sentences.slice(i, i + maxPerParagraph).join(' '))
  }
  return groups
}

/** Split plain text into max-2-sentence paragraph blocks. */
export function textToSentenceParagraphsHtml(text: string): string {
  const normalized = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\n\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return ''

  const groups = groupSentences(splitSentences(normalized), 2)
  return groups.map((group) => `<p>${escapeEditorialHtml(group)}</p>`).join('\n')
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim()
}

/** Reformat HTML body copy into max-2-sentence paragraph blocks. */
export function htmlToSentenceParagraphsHtml(html: string): string {
  const trimmed = html.trim()
  if (!trimmed) return ''

  const paragraphs = trimmed.match(/<p\b[\s\S]*?<\/p>/gi) ?? []
  const sourceText =
    paragraphs.length > 0
      ? paragraphs.map((paragraph) => stripHtml(paragraph)).join(' ')
      : stripHtml(trimmed)

  return textToSentenceParagraphsHtml(sourceText)
}

/** Keep the section H2 and reformat following paragraph content. */
export function reformatSectionToSentenceParagraphs(sectionHtml: string): string {
  const trimmed = sectionHtml.trim()
  if (!trimmed) return ''

  const h2Match = trimmed.match(/^<h2\b[^>]*>[\s\S]*?<\/h2>/i)
  if (!h2Match) return htmlToSentenceParagraphsHtml(trimmed)

  const body = trimmed.slice(h2Match[0].length).trim()
  if (!body) return h2Match[0]

  return `${h2Match[0]}\n${htmlToSentenceParagraphsHtml(body)}`
}

export function parseHeadingNameTagline(raw: string): { name: string; tagline: string } {
  const text = stripHtml(raw).replace(/\s*↗\s*$/, '').trim()
  const parts = text.split(/\s*[—–]\s*/)
  if (parts.length >= 2) {
    return { name: parts[0].trim(), tagline: parts.slice(1).join(' — ').trim() }
  }
  return { name: text, tagline: '' }
}

export function productHeadingBlockHtml(options: {
  id: string
  name: string
  tagline?: string
  affiliateUrl: string
  escape?: boolean
}): string {
  const { id, name, tagline = '', affiliateUrl, escape = true } = options
  const safeUrl = affiliateUrl.replace(/"/g, '&quot;')
  const safeName = escape ? escapeEditorialHtml(name) : name
  const taglineBlock = tagline
    ? `<p class="product-tagline-sub">${escape ? escapeEditorialHtml(tagline) : tagline}</p>`
    : ''

  return `<h2 id="${id}"><a href="${safeUrl}" target="_blank" rel="nofollow sponsored noopener">${safeName}<span class="heading-link-icon" aria-hidden="true">↗</span></a></h2>${taglineBlock}`
}
