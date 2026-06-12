'use client'

import { useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import PriceWatchWidget from '@/components/PriceWatchWidget'

type Props = {
  articleSlug: string
  trackedPrices?: Record<string, number>
}

export default function PriceWatchMount({ articleSlug, trackedPrices = {} }: Props) {
  const rootsRef = useRef<Root[]>([])

  useEffect(() => {
    const slots = document.querySelectorAll<HTMLElement>('.price-watch-slot')
    const roots: Root[] = []

    slots.forEach((slot) => {
      const asin = slot.dataset.asin?.trim().toUpperCase() ?? ''
      const productName = slot.dataset.productName?.trim() ?? ''
      const slotPrice = parseFloat(slot.dataset.price ?? '')
      const priceAtWatch =
        trackedPrices[asin] ??
        (Number.isFinite(slotPrice) && slotPrice > 0 ? slotPrice : 0)

      if (!asin || !productName || priceAtWatch <= 0) return

      const root = createRoot(slot)
      root.render(
        <PriceWatchWidget
          asin={asin}
          productName={productName}
          priceAtWatch={priceAtWatch}
          articleSlug={articleSlug}
        />,
      )
      roots.push(root)
    })

    rootsRef.current = roots

    return () => {
      roots.forEach((root) => root.unmount())
      rootsRef.current = []
    }
  }, [articleSlug, trackedPrices])

  return null
}
