import Link from 'next/link'
import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import QuickPicks from '@/components/guide/QuickPicks'
import AuthorBio from '@/components/guide/AuthorBio'
import {
  EDITORIAL_SITE_NAME,
} from '@/config/editorial'
import { outdoorCategoryLabel } from '@/config/outdoorCategories'
import {
  getArticleProducts,
  getPublishedArticleBySlug,
  getPublishedArticleSlugs,
} from '@/lib/articles-server'
import { renderCompareTable } from '@/lib/server/affiliate-pipeline/render'
import { readAmazonAffiliateServerConfig } from '@/lib/server/amazon-affiliate-config'
import { SITE_URL } from '@/config/site'
import {
  authorInitials,
  estimateReadMinutes,
  prepareGuideArticleHtml,
} from '@/utils/guideArticleHtml'
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
  return {
    title: article.seo_title || article.title,
    description: article.meta_description ?? undefined,
    alternates: { canonical: `${SITE_URL}/guides/${slug}` },
    openGraph: {
      title: article.seo_title || article.title,
      description: article.meta_description ?? undefined,
      url: `${SITE_URL}/guides/${slug}`,
      images: article.hero_image_url ? [{ url: article.hero_image_url }] : undefined,
    },
  }
}

function formatPublishedDate(iso: string | null | undefined) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
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
  const amazonConfig = await readAmazonAffiliateServerConfig()
  const segments = prepareGuideArticleHtml(article.content_html || '', products)
  const compareTableHtml =
    products.length > 0
      ? renderCompareTable(guideProductsToHydrated(products))
      : segments.comparisonTableHtml
  const publishedLabel = formatPublishedDate(article.published_at)
  const readMinutes = estimateReadMinutes(article.content_html || '')
  const authorName = article.author_name?.trim() || amazonConfig.authorName
  const disclosureText = amazonConfig.disclosureText
  const categoryLabel = outdoorCategoryLabel(article.category)
  const eyebrow = categoryLabel ? `${categoryLabel} · Gear Guide` : 'Outdoor Gear · Guide'
  const productCount = products.length || undefined

  return (
    <div className="guide-page">
      <SiteHeader variant="guide" />

      <div className="breadcrumb">
        <Link href="/guides">Guides</Link>
        <span>/</span>
        {categoryLabel && (
          <>
            <span>{categoryLabel}</span>
            <span>/</span>
          </>
        )}
        {article.title.split(':')[0]}
      </div>

      <header className="article-header">
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="article-title">{article.title}</h1>
        {article.meta_description && <p className="deck">{article.meta_description}</p>}
        <div className="byline">
          <div className="avatar">{authorInitials(authorName)}</div>
          <div className="byline-text">
            <strong>By {authorName}</strong>
            <div className="byline-meta">
              {publishedLabel && <span>Updated {publishedLabel}</span>}
              {publishedLabel && <span>·</span>}
              <span>{readMinutes} min read</span>
              {productCount != null && productCount > 0 && (
                <>
                  <span>·</span>
                  <span>{productCount} products reviewed</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {article.hero_image_url && (
        <div className="hero-image">
          <div className="hero-image-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={article.hero_image_url} alt="" />
          </div>
        </div>
      )}

      <article className="article-body">
        <div className="disclosure">
          <strong>Affiliate disclosure:</strong> {amazonConfig.siteName} tests gear on real trips.{' '}
          {disclosureText}
        </div>

        {segments.introHtml && (
          <div
            className="article-content"
            dangerouslySetInnerHTML={{ __html: segments.introHtml }}
          />
        )}

        <QuickPicks
          products={products}
          title={
            products.length >= 3
              ? `${products.length} picks worth your money`
              : undefined
          }
        />

        {compareTableHtml && (
          <div
            className="article-content"
            dangerouslySetInnerHTML={{ __html: compareTableHtml }}
          />
        )}

        {segments.bodyHtml && (
          <div
            className="article-content"
            dangerouslySetInnerHTML={{ __html: segments.bodyHtml }}
          />
        )}

        <AuthorBio authorName={authorName} initials={authorInitials(authorName)} />
      </article>

      <footer className="guide-footer">
        <Link href="/" className="logo">
          Outdoor<span>Deals</span>
        </Link>
        <p>Independent outdoor gear guides. © {new Date().getFullYear()} {EDITORIAL_SITE_NAME}.</p>
      </footer>
    </div>
  )
}
