import { parsePriceMidpoint } from '@/lib/price-utils'

function escapeAttr(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
}

/** Placeholder div for client-side PriceWatchWidget mounting. */
export function priceWatchSlotHtml(input: {
  asin?: string | null
  productName: string
  priceRange?: string | null
}): string {
  const asin = input.asin?.trim().toUpperCase() ?? ''
  if (!/^[A-Z0-9]{10}$/.test(asin)) return ''

  const price = parsePriceMidpoint(input.priceRange) ?? ''
  return `<div class="price-watch-slot" data-asin="${escapeAttr(asin)}" data-product-name="${escapeAttr(input.productName)}" data-price="${price}"></div>`
}
