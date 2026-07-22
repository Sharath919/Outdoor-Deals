import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import QuickPicks from '@/components/guide/QuickPicks'
import PriceWatchMount from '@/components/PriceWatchMount'
import RedditWelcome from '@/components/guide/RedditWelcome'
import AuthorBio from '@/components/guide/AuthorBio'
import { outdoorCategoryLabel } from '@/config/outdoorCategories'
import {
  getArticleProducts,
  getPublishedArticleBySlug,
  getPublishedArticleSlugs,
} from '@/lib/articles-server'
import { getTrackedPricesForAsins } from '@/lib/server/deals-server'
import { renderCompareTable } from '@/lib/server/affiliate-pipeline/render'
import {
  readAmazonAffiliateServerConfig,
  readShowProductImages,
} from '@/lib/server/amazon-affiliate-config'
import { SITE_URL } from '@/config/site'
import { authorInitials, prepareGuideArticleHtml } from '@/utils/guideArticleHtml'
import { resolveAuthorDisplayName } from '@/utils/guideAuthor'
import { guideProductsToHydrated } from '@/utils/guideProducts'

export const revalidate = 3600

export async function generateStaticParams() {
  const slugs = await getPublishedArticleSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = await getPublishedArticleBySlug(slug)
  if (!article) return { title: 'Not found' }

  const canonical = `${SITE_URL}/guides/${slug}`
  const title = article.seo_title || article.title
  const description = article.meta_description ?? undefined

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      images: article.hero_image_url ? [{ url: article.hero_image_url }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    other: {
      'twitter:url': canonical,
    },
  }
}

function ArticleSection({ html }: { html: string }) {
  if (!html.trim()) return null
  return (
    <div
      className="article-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default async function GuideArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const article = await getPublishedArticleBySlug(slug)
  if (!article) notFound()

  const products = await getArticleProducts(article.id)
  const asins = products.map((p) => p.asin).filter((a): a is string => Boolean(a))
  const trackedPrices = await getTrackedPricesForAsins(asins)
  const amazonConfig = await readAmazonAffiliateServerConfig()
  const showProductImages = await readShowProductImages()
  const prepared = prepareGuideArticleHtml(article.content_html || '', products, {
    showProductImages,
    associateTag: amazonConfig.associateTag,
  })
  const compareTableHtml =
    products.length > 0
      ? renderCompareTable(
          guideProductsToHydrated(products, article.product_specs),
          showProductImages,
        )
      : prepared.comparisonTableHtml
  const authorName = resolveAuthorDisplayName(article)
  const disclosureText = amazonConfig.disclosureText
  const categoryLabel = outdoorCategoryLabel(article.category)
  const eyebrow = categoryLabel ? `${categoryLabel} · Guide` : 'Outdoor Gear · Guide'
  const { bodySections } = prepared

  return (
    <div className={`guide-page${showProductImages ? '' : ' hide-product-images'}`}>
      <SiteHeader />

      <header className="article-header">
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="article-title">{article.title}</h1>
      </header>

      <RedditWelcome message={article.reddit_welcome} />

      <article className="article-body">
        {prepared.introHtml && <ArticleSection html={prepared.introHtml} />}

        {compareTableHtml && (
          <div className="compare-wide">
            <div
              className="article-content"
              dangerouslySetInnerHTML={{ __html: compareTableHtml }}
            />
          </div>
        )}

        <ArticleSection html={bodySections.quickTips} />
        <ArticleSection html={bodySections.products} />
        <PriceWatchMount articleSlug={slug} trackedPrices={trackedPrices} />
        <ArticleSection html={bodySections.whatToLookFor} />
        <ArticleSection html={bodySections.whoShouldSkip} />
        <ArticleSection html={bodySections.community} />

        <QuickPicks products={products} showImages={showProductImages} />

        <ArticleSection html={bodySections.faq} />
        <ArticleSection html={bodySections.buyingGuide} />
        <ArticleSection html={bodySections.other} />

        <div className="disclosure disclosure--footer">
          <strong>Affiliate disclosure:</strong> {amazonConfig.siteName} tests gear on real trips.{' '}
          {disclosureText}
        </div>

        <AuthorBio authorName={authorName} initials={authorInitials(authorName)} />
      </article>

      <SiteFooter />
    </div>
  )
}
