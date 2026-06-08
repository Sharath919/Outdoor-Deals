'use client'

import { useEffect, useState } from 'react'

const FALLBACK = 'Glad the post helped — full breakdown below.'

type RedditWelcomeProps = {
  message?: string | null
}

export default function RedditWelcome({ message }: RedditWelcomeProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setVisible(params.get('utm_source') === 'reddit')
  }, [])

  if (!visible) return null

  const text = message?.trim() || FALLBACK

  return (
    <p className="reddit-welcome">
      <span aria-hidden="true">🤝 </span>
      {text}
    </p>
  )
}
