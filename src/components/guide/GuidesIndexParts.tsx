import Link from 'next/link'
import type { GuideCategoryCount } from '@/lib/articles-server'

type GuidesCategoryFilterProps = {
  categories: GuideCategoryCount[]
  activeCategory: string | null
}

function guidesHref(category: string | null, page = 1): string {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `/guides?${query}` : '/guides'
}

export default function GuidesCategoryFilter({
  categories,
  activeCategory,
}: GuidesCategoryFilterProps) {
  if (categories.length === 0) return null

  return (
    <div className="guides-filters" role="navigation" aria-label="Filter guides by category">
      <Link
        href="/guides"
        className={`guides-filter-pill${activeCategory ? '' : ' is-active'}`}
        aria-current={activeCategory ? undefined : 'page'}
      >
        All
      </Link>
      {categories.map((cat) => (
        <Link
          key={cat.value}
          href={guidesHref(cat.value)}
          className={`guides-filter-pill${activeCategory === cat.value ? ' is-active' : ''}`}
          aria-current={activeCategory === cat.value ? 'page' : undefined}
        >
          {cat.label}
          <span className="guides-filter-count">{cat.count}</span>
        </Link>
      ))}
    </div>
  )
}

type GuidesPaginationProps = {
  page: number
  totalPages: number
  total: number
  pageSize: number
  activeCategory: string | null
}

function pageHref(page: number, category: string | null): string {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `/guides?${query}` : '/guides'
}

function visiblePages(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages = new Set<number>([1, total, current, current - 1, current + 1])
  return [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
}

export function GuidesPagination({
  page,
  totalPages,
  total,
  pageSize,
  activeCategory,
}: GuidesPaginationProps) {
  if (totalPages <= 1) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  const pages = visiblePages(page, totalPages)

  return (
    <nav className="guides-pagination" aria-label="Guides pagination">
      <p className="guides-pagination-summary">
        Showing <strong>{start}–{end}</strong> of <strong>{total}</strong> guides
      </p>
      <div className="guides-pagination-controls">
        {page > 1 ? (
          <Link href={pageHref(page - 1, activeCategory)} className="guides-page-btn guides-page-btn--nav">
            ← Previous
          </Link>
        ) : (
          <span className="guides-page-btn guides-page-btn--nav is-disabled" aria-disabled="true">
            ← Previous
          </span>
        )}

        <div className="guides-page-numbers">
          {pages.map((pageNum, index) => {
            const prev = pages[index - 1]
            const gap = prev !== undefined && pageNum - prev > 1

            return (
              <span key={pageNum} className="guides-page-number-wrap">
                {gap ? <span className="guides-page-ellipsis" aria-hidden>…</span> : null}
                <Link
                  href={pageHref(pageNum, activeCategory)}
                  className={`guides-page-btn guides-page-btn--num${pageNum === page ? ' is-active' : ''}`}
                  aria-current={pageNum === page ? 'page' : undefined}
                >
                  {pageNum}
                </Link>
              </span>
            )
          })}
        </div>

        {page < totalPages ? (
          <Link href={pageHref(page + 1, activeCategory)} className="guides-page-btn guides-page-btn--nav">
            Next →
          </Link>
        ) : (
          <span className="guides-page-btn guides-page-btn--nav is-disabled" aria-disabled="true">
            Next →
          </span>
        )}
      </div>
    </nav>
  )
}
