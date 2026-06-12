'use client'

import { useState } from 'react'

type Props = {
  asin: string
  productName: string
  priceAtWatch: number
  articleSlug: string
}

type SubmitStatus = 'idle' | 'loading' | 'confirm_sent' | 'already_watching' | 'error'

export default function PriceWatchWidget({
  asin,
  productName,
  priceAtWatch,
  articleSlug,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit() {
    const trimmed = email.trim()
    if (!trimmed) return

    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed,
          asin,
          productName,
          priceAtWatch,
          articleSlug,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (res.ok && data.status === 'already_watching') {
        setStatus('already_watching')
        return
      }

      if (res.ok && data.status === 'confirm_sent') {
        setStatus('confirm_sent')
        return
      }

      setStatus('error')
      setErrorMsg(data.error ?? 'Something went wrong. Please try again.')
    } catch {
      setStatus('error')
      setErrorMsg('Network error. Please try again.')
    }
  }

  if (status === 'confirm_sent') {
    return (
      <p className="price-watch-status price-watch-status--success">
        Check your inbox to confirm your watch ✓
      </p>
    )
  }

  if (status === 'already_watching') {
    return (
      <p className="price-watch-status">You&apos;re already watching this one.</p>
    )
  }

  if (!expanded) {
    return (
      <button
        type="button"
        className="price-watch-trigger"
        onClick={() => setExpanded(true)}
      >
        🔔 Watch this price — get an email if it drops
      </button>
    )
  }

  return (
    <div className="price-watch-form">
      <input
        type="email"
        className="price-watch-input"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={status === 'loading'}
        aria-label="Email for price alerts"
      />
      <button
        type="button"
        className="price-watch-submit"
        onClick={handleSubmit}
        disabled={status === 'loading' || !email.trim()}
      >
        {status === 'loading' ? 'Sending…' : 'Watch price'}
      </button>
      {status === 'error' && errorMsg && (
        <p className="price-watch-error" role="alert">{errorMsg}</p>
      )}
    </div>
  )
}
