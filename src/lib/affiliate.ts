/**
 * Single source of truth for Amazon affiliate product URLs.
 * Uses the site tracking tag (ASSOCIATE_TAG), not the PA-API partner tag.
 */
export function buildAffiliateUrl(asin: string): string {
  const id = asin.trim().toUpperCase()
  const tag =
    process.env.ASSOCIATE_TAG?.trim() ||
    process.env.AMAZON_ASSOCIATE_TAG?.trim() ||
    ''
  if (!/^[A-Z0-9]{10}$/.test(id)) return ''
  if (!tag) return `https://www.amazon.com/dp/${id}`
  return `https://www.amazon.com/dp/${id}?tag=${tag}&linkCode=ogi&th=1&psc=1`
}
