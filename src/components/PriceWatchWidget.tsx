'use client'

import { useState } from 'react'
import { Bell, Check } from 'lucide-react'
import { PRICE_WATCH_TRIGGER_LABEL } from '@/utils/guideProductCopy'

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
      <div className="price-watch">
        <div className="price-watch-panel price-watch-panel--success">
          <Check className="price-watch-icon" size={16} aria-hidden />
          <span>Check your inbox to confirm your watch.</span>
        </div>
      </div>
    )
  }

  if (status === 'already_watching') {
    return (
      <div className="price-watch">
        <div className="price-watch-panel price-watch-panel--success">
          <span>You&apos;re already watching this one.</span>
        </div>
      </div>
    )
  }

  if (!expanded) {
    return (
      <div className="price-watch">
        <button
          type="button"
          className="price-watch-trigger"
          onClick={() => setExpanded(true)}
        >
          <Bell className="price-watch-icon" size={16} aria-hidden />
          {PRICE_WATCH_TRIGGER_LABEL}
        </button>
      </div>
    )
  }

  return (
    <div className="price-watch">
      <div className="price-watch-panel">
        <div className="price-watch-row">
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
        </div>
        <p className="price-watch-helper">
          One email if it drops 5% or more. No spam, unsubscribe anytime.
        </p>
        {status === 'error' && errorMsg && (
          <p className="price-watch-error" role="alert">{errorMsg}</p>
        )}
      </div>
    </div>
  )
}
