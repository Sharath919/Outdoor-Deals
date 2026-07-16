import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import GuideCard from '@/components/guide/GuideCard'
import { NAV_CATEGORIES } from '@/config/outdoorCategories'
import { queryPublishedGuides } from '@/lib/articles-server'

export const revalidate = 3600

export default async function HomePage() {
  const { articles } = await queryPublishedGuides({ page: 1, pageSize: 6 })
  const featured = articles.slice(0, 6)

  return (
    <div className="guide-page">
      <SiteHeader />

      <main className="article-body" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
        <header className="article-header" style={{ paddingTop: 0 }}>
          <span className="eyebrow">Camping · Hiking · Outdoor gear</span>
          <h1 className="article-title">
            Find the right gear — without the research rabbit hole
          </h1>
          <p className="deck">
            Curated buying guides and budget roundups built for real trips — honest,
            independent picks you can trust before you buy.
          </p>
        </header>

        <div className="home-categories">
          {NAV_CATEGORIES.map((category) => (
            <Link key={category.value} href={`/guides?category=${category.value}`}>
              {category.label}
            </Link>
          ))}
        </div>

        <Link
          href="/guides"
          className="btn btn-large"
          style={{ width: 'auto', display: 'inline-flex' }}
        >
          <span className="btn-icon">→</span> Browse all guides
        </Link>
      </main>

      {featured.length > 0 && (
        <section className="home-featured">
          <h2 className="home-featured-title">Latest guides</h2>
          <div className="guides-grid">
            {featured.map((article) => (
              <GuideCard key={article.id} article={article} />
            ))}
          </div>
        </section>
      )}

      <SiteFooter />
    </div>
  )
}
