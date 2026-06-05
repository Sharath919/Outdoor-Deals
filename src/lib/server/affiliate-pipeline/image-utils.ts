import type { HydratedProduct } from './types'

/** True when src is empty or a stub/placeholder, not a real product image URL. */
export function isPlaceholderImageUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return true
  const u = url.trim()
  if (/^PLACEHOLDER$/i.test(u)) return true
  return /placeholder|example\.com|via\.placeholder|placehold\.co|YOUR_IMAGE|INSERT_IMAGE|REPLACE\s+WITH|\[image\s*url\]|\[REPLACE|image pending/i.test(
    u,
  )
}

/** Prefer a real PA-API image over a placeholder or missing existing URL. */
export function resolveHydratedImageUrl(
  existing: string | null | undefined,
  fromPaapi: string | null | undefined,
): string | null {
  if (fromPaapi?.trim() && !isPlaceholderImageUrl(fromPaapi)) return fromPaapi.trim()
  if (existing?.trim() && !isPlaceholderImageUrl(existing)) return existing.trim()
  return fromPaapi?.trim() || existing?.trim() || null
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function namesMatch(a: string, b: string): boolean {
  const left = a.toLowerCase().trim()
  const right = b.toLowerCase().trim()
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

/** Replace placeholder img src values using hydrated product name ↔ alt matching. */
export function injectHydratedImagesIntoHtml(
  html: string,
  products: Array<Pick<HydratedProduct, 'name' | 'image_url'>>,
): string {
  if (!html.trim() || products.length === 0) return html

  let result = html
  for (const product of products) {
    const imageUrl = product.image_url?.trim()
    if (!imageUrl || isPlaceholderImageUrl(imageUrl)) continue
    const name = product.name?.trim()
    if (!name) continue

    const escapedName = escapeRegExp(name)

    result = result.replace(
      new RegExp(`(<img\\b[^>]*\\bsrc=")[^"]*("[^>]*\\balt="${escapedName}"[^>]*>)`, 'gi'),
      `$1${imageUrl}$2`,
    )
    result = result.replace(
      new RegExp(`(<img\\b[^>]*\\balt="${escapedName}"[^>]*\\bsrc=")[^"]*(")`, 'gi'),
      `$1${imageUrl}$2`,
    )
  }

  return result
}

export function findProductImageByTitle(
  title: string,
  products: Array<{ title: string; image_url: string | null }>,
): string | null {
  const normalized = title.trim()
  if (!normalized) return null

  const match = products.find((p) => namesMatch(p.title, normalized))
  const url = match?.image_url?.trim()
  if (!url || isPlaceholderImageUrl(url)) return null
  return url
}

export function logPaapiItemSample(asin: string, item: Record<string, unknown>): void {
  const images = item.Images as Record<string, unknown> | undefined
  const info = item.ItemInfo as Record<string, unknown> | undefined
  const title = (info?.Title as { DisplayValue?: string } | undefined)?.DisplayValue

  console.log(
    '[affiliate-pipeline] PA-API sample response:',
    JSON.stringify(
      {
        asin,
        title,
        Images: images,
        imageLargeUrl: (images?.Primary as { Large?: { URL?: string } } | undefined)?.Large?.URL,
        imageMediumUrl: (images?.Primary as { Medium?: { URL?: string } } | undefined)?.Medium?.URL,
      },
      null,
      2,
    ),
  )
}
