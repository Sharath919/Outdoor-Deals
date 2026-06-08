import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import { EDITORIAL_SITE_NAME } from '@/config/editorial'

export default function HomePage() {
  return (
    <div className="guide-page">
      <SiteHeader />

      <main className="article-body" style={{ paddingTop: '3rem', paddingBottom: '4rem' }}>
        <header className="article-header" style={{ paddingTop: 0 }}>
          <span className="eyebrow">Camping · Hiking · Outdoor gear</span>
          <h1 className="article-title">
            Find the right gear — without the research rabbit hole
          </h1>
          <p className="deck">
            Curated buying guides, budget roundups, and product quizzes built for real trips.
          </p>
        </header>

        <Link href="/guides" className="btn btn-large" style={{ width: 'auto', display: 'inline-flex' }}>
          <span className="btn-icon">→</span> Browse guides
        </Link>
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
