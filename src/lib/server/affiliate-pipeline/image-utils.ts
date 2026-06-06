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

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim()
}

function parseProductHeadingName(raw: string): string {
  const text = stripHtml(raw)
  const parts = text.split(/\s*[—–]\s*/)
  return (parts[0]?.trim() || text).trim()
}

type ReviewImageProduct = {
  name?: string
  title?: string
  image_url: string | null | undefined
}

function productDisplayName(product: ReviewImageProduct): string {
  return (product.name ?? product.title ?? '').trim()
}

function findBlockEnd(html: string, openTagEnd: number): number {
  let depth = 1
  let i = openTagEnd
  const openDiv = /<div\b/gi
  const closeDiv = /<\/div>/gi

  while (depth > 0 && i < html.length) {
    openDiv.lastIndex = i
    closeDiv.lastIndex = i
    const nextOpen = openDiv.exec(html)
    const nextClose = closeDiv.exec(html)
    if (!nextClose) break

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++
      i = nextOpen.index + nextOpen[0].length
    } else {
      depth--
      if (depth === 0) return nextClose.index + nextClose[0].length
      i = nextClose.index + nextClose[0].length
    }
  }
  return html.length
}

function resolveReviewBlockName(blockHtml: string, precedingH2: string | null): string {
  const h3Match = blockHtml.match(
    /<h3\b[^>]*\bclass="[^"]*\bproduct-name\b[^"]*"[^>]*>([\s\S]*?)<\/h3>/i,
  )
  if (h3Match) {
    const name = stripHtml(h3Match[1])
    if (name.length >= 3) return name
  }

  const placeholderImg =
    blockHtml.match(/<img\b[^>]*\bsrc="PLACEHOLDER"[^>]*\balt="([^"]+)"/i) ??
    blockHtml.match(/<img\b[^>]*\balt="([^"]+)"[^>]*\bsrc="PLACEHOLDER"/i)
  if (placeholderImg) {
    const name = placeholderImg[1].trim()
    if (name.length >= 3) return name
  }

  if (precedingH2) {
    return parseProductHeadingName(precedingH2)
  }

  return ''
}

function findProductImageForName(
  name: string,
  products: ReviewImageProduct[],
): { name: string; image_url: string } | null {
  const match = products.find((p) => namesMatch(productDisplayName(p), name))
  if (!match) return null
  const url = match.image_url?.trim()
  if (!url || isPlaceholderImageUrl(url)) return null
  return { name: productDisplayName(match), image_url: url }
}

function patchImageContainerInner(inner: string, imageUrl: string, alt: string): string {
  const imgMatch = inner.match(/<img\b[^>]*>/i)
  const escapedAlt = alt.replace(/"/g, '&quot;')

  if (imgMatch) {
    const imgTag = imgMatch[0]
    const srcMatch = imgTag.match(/\bsrc="([^"]*)"/i)
    const currentSrc = srcMatch?.[1] ?? ''
    if (!isPlaceholderImageUrl(currentSrc)) return inner
    const newImg = imgTag.replace(/\bsrc="[^"]*"/i, `src="${imageUrl}"`)
    return inner.replace(imgTag, newImg)
  }

  const imgTag = `<img src="${imageUrl}" alt="${escapedAlt}" loading="lazy">`
  const badgeMatch = inner.match(/(<span class="award-badge[^>]*>[\s\S]*?<\/span>)/i)
  if (badgeMatch) {
    return inner.replace(badgeMatch[0], `${badgeMatch[0]}\n      ${imgTag}`)
  }
  return inner.trim() ? `${inner.trim()}\n      ${imgTag}` : imgTag
}

const IMAGE_CONTAINER_RE = /<div class="(product-image-wrap|product-image)">([\s\S]*?)<\/div>/gi

function patchReviewBlock(
  blockHtml: string,
  precedingH2: string | null,
  products: ReviewImageProduct[],
): string {
  const name = resolveReviewBlockName(blockHtml, precedingH2)
  if (!name) return blockHtml

  const product = findProductImageForName(name, products)
  if (!product) return blockHtml

  return blockHtml.replace(IMAGE_CONTAINER_RE, (full, className, inner) => {
    const patchedInner = patchImageContainerInner(inner, product.image_url, product.name)
    if (patchedInner === inner) return full
    return `<div class="${className}">${patchedInner}</div>`
  })
}

/** Inject or replace review-card images inside each .product-review block. */
export function injectReviewCardImages(html: string, products: ReviewImageProduct[]): string {
  if (!html.trim() || products.length === 0) return html

  const normalizedProducts = products.map((p) => ({
    name: productDisplayName(p),
    image_url: p.image_url ?? null,
  }))

  if (!/\bproduct-review\b/.test(html)) {
    return injectHydratedImagesIntoHtml(html, normalizedProducts)
  }

  const replacements: Array<{ start: number; end: number; replacement: string }> = []
  const reviewStartRe = /<div class="product-review">/gi
  let match: RegExpExecArray | null

  while ((match = reviewStartRe.exec(html)) !== null) {
    const start = match.index
    const openEnd = start + match[0].length
    const end = findBlockEnd(html, openEnd)
    const blockHtml = html.slice(start, end)

    const before = html.slice(0, start)
    const h2Matches = [...before.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)]
    const precedingH2 =
      h2Matches.length > 0 ? (h2Matches[h2Matches.length - 1][1] ?? null) : null

    const patched = patchReviewBlock(blockHtml, precedingH2, products)
    if (patched !== blockHtml) {
      replacements.push({ start, end, replacement: patched })
    }
  }

  let result = html
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { start, end, replacement } = replacements[i]
    result = result.slice(0, start) + replacement + result.slice(end)
  }

  return injectHydratedImagesIntoHtml(result, normalizedProducts)
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
