import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import GuideCard from '@/components/guide/GuideCard'
import GuidesCategoryFilter, {
  GuidesPagination,
} from '@/components/guide/GuidesIndexParts'
import { outdoorCategoryLabel } from '@/config/outdoorCategories'
import { SITE_URL } from '@/config/site'
import { queryPublishedGuides } from '@/lib/articles-server'

export const revalidate = 3600

export const metadata = {
  title: 'Outdoor gear guides',
  description:
    'Buying guides and best-of roundups for camping, hiking, and outdoor gear — tested picks with honest comparisons.',
  alternates: {
    canonical: `${SITE_URL}/guides`,
  },
}

type GuidesSearchParams = {
  page?: string
  category?: string
}

export default async function GuidesIndexPage({
  searchParams,
}: {
  searchParams: Promise<GuidesSearchParams>
}) {
  const params = await searchParams
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)
  const category = params.category?.trim() || null

  const result = await queryPublishedGuides({ page, category })

  if (page > 1 && result.totalPages > 0 && page > result.totalPages) {
    const redirectParams = new URLSearchParams()
    if (category) redirectParams.set('category', category)
    if (result.totalPages > 1) redirectParams.set('page', String(result.totalPages))
    const query = redirectParams.toString()
    redirect(query ? `/guides?${query}` : '/guides')
  }

  if (category && result.total === 0 && result.categories.every((c) => c.value !== category)) {
    notFound()
  }

  const activeCategoryLabel = category ? outdoorCategoryLabel(category) : null

  return (
    <div className="guide-page guides-index-page">
      <SiteHeader variant="guide" />

      <div className="guides-breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden> / </span>
        <span>Guides</span>
      </div>

      <main className="guides-index-main">
        <header className="guides-index-hero">
          <span className="eyebrow">All guides</span>
          <h1 className="guides-index-title">
            {activeCategoryLabel ? `${activeCategoryLabel} guides` : 'Gear guides'}
          </h1>
          <p className="guides-index-deck">
            {activeCategoryLabel
              ? `Buying guides and roundups for ${activeCategoryLabel.toLowerCase()} — tested on real trips, not spec sheets.`
              : 'Buying guides and best-of roundups for camping, hiking, and outdoor gear — honest picks you can trust on the trail.'}
          </p>
          {result.total > 0 ? (
            <p className="guides-index-stats">
              <strong>{result.total}</strong> published guide{result.total === 1 ? '' : 's'}
              {activeCategoryLabel ? (
                <>
                  {' '}
                  in <strong>{activeCategoryLabel}</strong>
                </>
              ) : null}
            </p>
          ) : null}
        </header>

        <GuidesCategoryFilter
          categories={result.categories}
          activeCategory={category}
        />

        {result.articles.length === 0 ? (
          <div className="guides-empty">
            <h2>Guides coming soon</h2>
            <p>We&apos;re publishing new outdoor gear roundups regularly. Check back shortly.</p>
            <Link href="/" className="btn">
              Back to home
            </Link>
          </div>
        ) : (
          <>
            <div className="guides-grid">
              {result.articles.map((article) => (
                <GuideCard key={article.id} article={article} />
              ))}
            </div>

            <GuidesPagination
              page={result.page}
              totalPages={result.totalPages}
              total={result.total}
              pageSize={result.pageSize}
              activeCategory={category}
            />
          </>
        )}
      </main>

      <footer className="guide-footer">
        <Link href="/" className="logo">
          Gear<span>AndSteer</span>
        </Link>
        <p>Independent outdoor gear guides.</p>
      </footer>
    </div>
  )
}
