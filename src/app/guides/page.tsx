import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import { getPublishedArticlesList } from '@/lib/articles-server'

export const metadata = {
  title: 'Outdoor gear guides',
  description: 'Buying guides and best-of roundups for camping, hiking, and outdoor gear.',
}

export default async function GuidesIndexPage() {
  const articles = await getPublishedArticlesList()

  return (
    <div className="guide-page">
      <SiteHeader variant="guide" />
      <main className="article-body" style={{ paddingTop: '2rem' }}>
        <header className="article-header" style={{ paddingTop: 0 }}>
          <span className="eyebrow">All guides</span>
          <h1 className="article-title">Gear guides</h1>
          <p className="deck">Buying guides and best-of roundups for camping, hiking, and outdoor gear.</p>
        </header>
        {articles.length === 0 ? (
          <p style={{ color: 'var(--ink-soft)' }}>Guides coming soon.</p>
        ) : (
          <ul className="space-y-4">
            {articles.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/guides/${a.slug}`}
                  className="quick-picks"
                  style={{ display: 'block', padding: '1.5rem', margin: 0, textDecoration: 'none' }}
                >
                  <h2 className="pick-name" style={{ marginBottom: '0.5rem' }}>{a.title}</h2>
                  {a.meta_description && (
                    <p style={{ fontSize: '15px', color: 'var(--ink-soft)', margin: 0 }}>
                      {a.meta_description}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <footer className="guide-footer">
        <Link href="/" className="logo">Outdoor<span>Deals</span></Link>
        <p>Independent outdoor gear guides.</p>
      </footer>
    </div>
  )
}
