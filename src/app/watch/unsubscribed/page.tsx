'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import SiteHeader from '@/components/SiteHeader'

function UnsubscribedContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [allDone, setAllDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function unsubscribeAll() {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch('/api/watch/unsubscribe-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (res.ok) setAllDone(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="watch-main">
      <h1>Unsubscribed</h1>
      <p>You won&apos;t receive price alerts for this watch anymore.</p>

      {!allDone && token && (
        <p>
          <button
            type="button"
            className="btn"
            onClick={unsubscribeAll}
            disabled={loading}
          >
            {loading ? 'Processing…' : 'Unsubscribe from all alerts'}
          </button>
        </p>
      )}

      {allDone && (
        <p className="watch-status">All price alerts for your email have been turned off.</p>
      )}

      <p>
        <Link href="/guides">Browse guides</Link>
      </p>
    </main>
  )
}

export default function WatchUnsubscribedPage() {
  return (
    <div className="guide-page watch-page">
      <SiteHeader variant="guide" />
      <Suspense fallback={<main className="watch-main"><p>Loading…</p></main>}>
        <UnsubscribedContent />
      </Suspense>
    </div>
  )
}
