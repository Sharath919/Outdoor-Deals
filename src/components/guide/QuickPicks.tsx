'use client'

import type { GuideProduct } from '@/lib/articles-server'

const PICK_LABELS = ['Best for Reliability', 'Best for Versatility', 'Best Value']

type QuickPicksProps = {
  products: GuideProduct[]
}

export default function QuickPicks({ products }: QuickPicksProps) {
  const picks = products.slice(0, 3)
  if (picks.length === 0) return null

  return (
    <div className="quick-picks">
      <h3 className="quick-picks-title">Quick Picks — In Case You&apos;ve Already Decided</h3>
      <div className="picks-grid">
        {picks.map((product, index) => {
          const pillStyle =
            index === 1
              ? { background: 'var(--accent)' }
              : index === 2
                ? { background: '#5A6B3F' }
                : undefined

          return (
            <div key={product.title} className="pick-card">
              <div className="pick-image">
                <span className="award-pill" style={pillStyle}>
                  {product.award_label ?? (index === 0 ? 'Top Pick' : index === 1 ? 'Versatile' : 'Budget')}
                </span>
                {product.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.image_url} alt={product.title} />
                ) : (
                  product.title
                )}
              </div>
              <div className="pick-label">{PICK_LABELS[index] ?? 'Our pick'}</div>
              <h4 className="pick-name">{product.title}</h4>
              <a
                href={product.affiliate_url}
                className="btn"
                target="_blank"
                rel="noopener noreferrer sponsored"
              >
                <span className="btn-icon">→</span> Check on Amazon
              </a>
            </div>
          )
        })}
      </div>
    </div>
  )
}
