import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'

export default function WatchInvalidPage() {
  return (
    <div className="guide-page watch-page">
      <SiteHeader variant="guide" />
      <main className="watch-main">
        <h1>Link expired or invalid</h1>
        <p>
          This confirmation or unsubscribe link is no longer valid. It may have already been used
          or expired.
        </p>
        <p>
          <Link href="/guides" className="btn">
            Browse guides
          </Link>
        </p>
      </main>
    </div>
  )
}
