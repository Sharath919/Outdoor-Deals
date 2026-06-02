/** Remove broken placeholder <img> tags from article HTML (e.g. Claude export stubs). */
const BROKEN_IMG_TAG =
  /<img\b[^>]*(?:placeholder|example\.com|via\.placeholder|placehold\.co|YOUR_IMAGE|INSERT_IMAGE|REPLACE\s+WITH|\[image\s*url\]|\[REPLACE)[^>]*\/?>/gi

export function stripBrokenArticleImages(html: string | null | undefined): string | null {
  if (!html) return html ?? null
  const cleaned = html.replace(BROKEN_IMG_TAG, '').trim()
  return cleaned === '' ? null : cleaned
}
