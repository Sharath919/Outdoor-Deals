/**
 * Single source of truth for Amazon affiliate product URLs.
 * Partner tag must come from env — never hardcode.
 */
export function buildAffiliateUrl(asin: string): string {
  const id = asin.trim().toUpperCase()
  const tag = process.env.PAAPI_PARTNER_TAG?.trim() ?? ''
  if (!/^[A-Z0-9]{10}$/.test(id)) return ''
  if (!tag) return `https://www.amazon.com/dp/${id}`
  return `https://www.amazon.com/dp/${id}?tag=${tag}&linkCode=ogi&th=1&psc=1`
}
