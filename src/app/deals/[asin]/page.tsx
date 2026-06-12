import Link from 'next/link'
import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import { buildAffiliateUrl } from '@/lib/affiliate'
import {
  getArticleSlugForAsin,
  getDealProduct,
  getRelatedProductsFromArticle,
} from '@/lib/server/deals-server'
import { SITE_URL } from '@/config/site'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ asin: string }> }) {
  const { asin } = await params
  const product = await getDealProduct(asin)
  if (!product) return { title: 'Not found' }

  const canonical = `${SITE_URL}/deals/${product.asin}`

  return {
    title: `${product.product_name} — Price Drop`,
    robots: { index: false, follow: false },
    alternates: { canonical },
  }
}

function formatPrice(value: number | null): string {
  if (value == null) return 'See on Amazon'
  return `$${value.toFixed(2)}`
}

export default async function DealPage({ params }: { params: Promise<{ asin: string }> }) {
  const { asin } = await params
  const product = await getDealProduct(asin)
  if (!product) notFound()

  const articleSlug = await getArticleSlugForAsin(product.asin)
  const related = articleSlug
    ? await getRelatedProductsFromArticle(product.asin, articleSlug)
    : []

  const affiliateUrl = buildAffiliateUrl(product.asin)
  const current = product.current_price != null ? Number(product.current_price) : null
  const previous = product.previous_price != null ? Number(product.previous_price) : null
  const showDrop = current != null && previous != null && current < previous

  return (
    <div className="guide-page deal-page">
      <SiteHeader variant="guide" />

      <main className="deal-main">
        <div className="deal-card">
          {product.image_url && (
            <img
              src={product.image_url}
              alt={product.product_name}
              className="deal-image"
            />
          )}

          <h1 className="deal-title">{product.product_name}</h1>

          <div className="deal-price">
            {showDrop ? (
              <p className="deal-price-drop">
                was {formatPrice(previous)} → now {formatPrice(current)}
              </p>
            ) : (
              <p className="deal-price-current">{formatPrice(current)}</p>
            )}
          </div>

          <a
            href={affiliateUrl}
            className="btn btn-large deal-cta"
            target="_blank"
            rel="nofollow sponsored noopener"
          >
            Check Price on Amazon
          </a>

          {articleSlug && (
            <p className="deal-source">
              From our guide:{' '}
              <Link href={`/guides/${articleSlug}`}>{articleSlug.replace(/-/g, ' ')}</Link>
            </p>
          )}
        </div>

        {related.length > 0 && (
          <section className="deal-related">
            <h2>More from this guide</h2>
            <div className="deal-related-grid">
              {related.map((item) => (
                <div key={item.asin} className="deal-related-item">
                  {item.image_url && (
                    <img src={item.image_url} alt={item.title} className="deal-related-img" />
                  )}
                  <p className="deal-related-name">{item.title}</p>
                  <a
                    href={buildAffiliateUrl(item.asin) || item.affiliate_url}
                    className="btn deal-related-cta"
                    target="_blank"
                    rel="nofollow sponsored noopener"
                  >
                    Check Price →
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
