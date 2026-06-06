/** Remove broken placeholder <img> tags from article HTML (e.g. Claude export stubs). */
const BROKEN_IMG_TAG =
  /<img\b[^>]*(?:placeholder|example\.com|via\.placeholder|placehold\.co|YOUR_IMAGE|INSERT_IMAGE|REPLACE\s+WITH|\[image\s*url\]|\[REPLACE)[^>]*\/?>/gi

const MANUAL_PLACEHOLDER_IMG =
  /<img\b[^>]*\bsrc="PLACEHOLDER"[^>]*\/?>/gi

const PLACEHOLDER_SENTINEL_PREFIX = '__MANUAL_PLACEHOLDER_IMG_'
const PLACEHOLDER_SENTINEL_SUFFIX = '__'

export function stripBrokenArticleImages(html: string | null | undefined): string | null {
  if (!html) return html ?? null

  const preserved: string[] = []
  let work = html.replace(MANUAL_PLACEHOLDER_IMG, (tag) => {
    const index = preserved.length
    preserved.push(tag)
    return `${PLACEHOLDER_SENTINEL_PREFIX}${index}${PLACEHOLDER_SENTINEL_SUFFIX}`
  })

  let cleaned = work.replace(BROKEN_IMG_TAG, '').trim()
  preserved.forEach((tag, index) => {
    cleaned = cleaned.replace(`${PLACEHOLDER_SENTINEL_PREFIX}${index}${PLACEHOLDER_SENTINEL_SUFFIX}`, tag)
  })

  return cleaned === '' ? null : cleaned
}
