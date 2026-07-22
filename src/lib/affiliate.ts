/**
 * Single source of truth for Amazon affiliate product URLs.
 * Uses the site tracking tag (ASSOCIATE_TAG), not the PA-API partner tag.
 */
import { SITE_ASSOCIATE_TAG } from '@/types/amazonAffiliate'
import { resolveAssociateTag } from '@/utils/amazonAffiliateConfig'

export function buildAffiliateUrl(asin: string): string {
  const id = asin.trim().toUpperCase()
  const tag = resolveAssociateTag(
    process.env.ASSOCIATE_TAG?.trim() ||
      process.env.AMAZON_ASSOCIATE_TAG?.trim() ||
      SITE_ASSOCIATE_TAG,
  )
  if (!/^[A-Z0-9]{10}$/.test(id)) return ''
  return `https://www.amazon.com/dp/${id}?tag=${tag}&linkCode=ogi&th=1&psc=1`
}
