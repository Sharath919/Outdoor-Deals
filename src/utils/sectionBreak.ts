/** Markers embedded in article HTML content. */

export const SECTION_BREAK_CARD = 'card'

export function sectionBreakMarkerCard(): string {
  return `\n<!-- SECTION BREAK: ${SECTION_BREAK_CARD} -->\n`
}

export function sectionBreakMarkerUrl(imageUrl: string): string {
  return `\n<!-- SECTION BREAK: ${imageUrl.trim()} -->\n`
}

/** Legacy marker without payload — rendered as card image when available. */
export const LEGACY_SECTION_BREAK_MARKER = '<!-- SECTION BREAK -->'
