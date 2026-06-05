'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  bulkDeleteArticles,
  bulkUpdateArticleStatus,
  deleteArticle,
  estimateWordCount,
  queryAdminArticles,
  updateArticle,
  type AdminArticleDateRange,
  type AdminArticleSort,
  type AdminArticleSource,
} from '@/utils/articles'
import { supabase } from '@/lib/supabase'
import { promptKeyBadge, SCHEDULE_TEMPLATE_TYPES, TEMPLATE_HUMAN_NAMES } from '@/config/articleMachinePrompts'
import { OUTDOOR_CATEGORY_OPTIONS, outdoorCategoryLabel } from '@/config/outdoorCategories'
import { publishArticleWithHydration } from '@/utils/publishArticle'
import { triggerSiteRebuild } from '@/utils/triggerRebuild'
import type { Article } from '@/types/article'

const PAGE_SIZE = 20

const STATUS_COLORS = {
  draft: 'text-white/40 bg-white/5 border-white/10',
  review: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  published: 'text-green-400 bg-green-400/10 border-green-400/20',
}

const TEMPLATE_OPTIONS = SCHEDULE_TEMPLATE_TYPES.map((value) => ({
  value,
  label: TEMPLATE_HUMAN_NAMES[value] ?? value,
}))

const CATEGORY_OPTIONS = OUTDOOR_CATEGORY_OPTIONS.filter((o) => o.value).map((o) => ({
  value: o.value,
  label: o.label,
}))

const DATE_RANGE_OPTIONS: { value: AdminArticleDateRange; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

const SORT_OPTIONS: { value: AdminArticleSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title-asc', label: 'Title A-Z' },
  { value: 'title-desc', label: 'Title Z-A' },
  { value: 'updated', label: 'Recently updated' },
]

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
)

const GENERATED_AUTHOR_NAMES = new Set(['Limansa', 'Article Machine'])

type BulkAction = 'unpublish' | 'delete'

type ConfirmState = {
  action: BulkAction
  ids: string[]
  label: string
}

const selectClass =
  'rounded-lg px-3 py-2 text-sm bg-white/5 border border-white/10 text-white/80 outline-none focus:border-amber-400/40 min-w-0'

function parsePage(raw: string | null): number {
  const n = parseInt(raw ?? '1', 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

function categoryLabel(slug: string | null): string {
  return outdoorCategoryLabel(slug) || CATEGORY_LABELS[slug ?? ''] || (slug ?? '').replace(/-/g, ' ')
}

function isGeneratedArticle(authorName: string | null | undefined): boolean {
  return !!authorName && GENERATED_AUTHOR_NAMES.has(authorName)
}

type SearchParamsUpdater =
  | URLSearchParams
  | Record<string, string>
  | ((prev: URLSearchParams) => URLSearchParams)

function useAppSearchParams() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setSearchParams = useCallback(
    (updater: SearchParamsUpdater, options?: { replace?: boolean }) => {
      const prev = new URLSearchParams(searchParams.toString())
      let next: URLSearchParams

      if (typeof updater === 'function') {
        next = updater(prev)
      } else if (updater instanceof URLSearchParams) {
        next = updater
      } else {
        next = new URLSearchParams()
        for (const [key, value] of Object.entries(updater)) {
          if (value) next.set(key, value)
        }
      }

      const query = next.toString()
      const url = query ? `${pathname}?${query}` : pathname
      if (options?.replace) router.replace(url)
      else router.push(url)
    },
    [router, pathname, searchParams],
  )

  return { searchParams, setSearchParams }
}

export default function AdminArticleList() {
  const { searchParams, setSearchParams } = useAppSearchParams()

  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? 'all'
  const template = searchParams.get('template') ?? 'all'
  const category = searchParams.get('category') ?? 'all'
  const source = (searchParams.get('source') ?? 'all') as AdminArticleSource
  const dateRange = (searchParams.get('date') ?? 'all') as AdminArticleDateRange
  const sort = (searchParams.get('sort') ?? 'newest') as AdminArticleSort
  const page = parsePage(searchParams.get('page'))

  const [searchInput, setSearchInput] = useState(q)
  const [articles, setArticles] = useState<Article[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rebuildState, setRebuildState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [rebuildMessage, setRebuildMessage] = useState('')
  const [articleCost, setArticleCost] = useState<Record<string, number>>({})
  const [articlePromptKey, setArticlePromptKey] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [confirmModal, setConfirmModal] = useState<ConfirmState | null>(null)
  const [goToPageInput, setGoToPageInput] = useState('')
  const [hydrateWarnings, setHydrateWarnings] = useState<Record<string, string[]>>({})

  useEffect(() => {
    setSearchInput(q)
  }, [q])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = searchInput.trim()
      if (trimmed === q) return
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (trimmed) next.set('q', trimmed)
          else next.delete('q')
          next.delete('page')
          return next
        },
        { replace: true },
      )
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput, q, setSearchParams])

  const updateParam = useCallback(
    (key: string, value: string, resetPage = true) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (!value || value === 'all') next.delete(key)
          else next.set(key, value)
          if (resetPage) next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setPage = useCallback(
    (nextPage: number) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (nextPage <= 1) next.delete('page')
          else next.set('page', String(nextPage))
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const clearAllFilters = useCallback(() => {
    setSearchInput('')
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  const load = useCallback(async () => {
    setLoading(true)
    setSelected(new Set())

    const result = await queryAdminArticles({
      search: q,
      status,
      template,
      category,
      source,
      dateRange,
      sort,
      page,
      pageSize: PAGE_SIZE,
    })

    if (result.error) {
      toast.error(`Failed to load articles: ${result.error}`)
      setArticles([])
      setTotal(0)
      setArticleCost({})
      setArticlePromptKey({})
      setLoading(false)
      return
    }

    setArticles(result.articles)
    setTotal(result.total)

    const ids = result.articles.map((a) => a.id)
    if (!ids.length) {
      setArticleCost({})
      setArticlePromptKey({})
      setLoading(false)
      return
    }

    const { data: usageData } = await supabase
      .from('api_usage_log')
      .select('article_id, cost_usd, prompt_key, operation')
      .in('article_id', ids)
      .eq('operation', 'article_generation')

    const costMap: Record<string, number> = {}
    const promptMap: Record<string, string> = {}
    for (const row of (usageData ?? []) as Array<{
      article_id: string | null
      cost_usd: number
      prompt_key: string | null
    }>) {
      if (!row.article_id) continue
      costMap[row.article_id] = (costMap[row.article_id] ?? 0) + Number(row.cost_usd || 0)
      if (row.prompt_key && !promptMap[row.article_id]) {
        promptMap[row.article_id] = row.prompt_key
      }
    }
    setArticleCost(costMap)
    setArticlePromptKey(promptMap)
    setLoading(false)
  }, [q, status, template, category, source, dateRange, sort, page])

  useEffect(() => {
    load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const pageEnd = Math.min(page * PAGE_SIZE, total)

  const activeFilters = useMemo(() => {
    const pills: { key: string; label: string; clear: () => void }[] = []
    if (q) {
      pills.push({
        key: 'q',
        label: `Search: ${q}`,
        clear: () => {
          setSearchInput('')
          updateParam('q', '')
        },
      })
    }
    if (status !== 'all') {
      pills.push({
        key: 'status',
        label: `Status: ${status}`,
        clear: () => updateParam('status', 'all'),
      })
    }
    if (template !== 'all') {
      pills.push({
        key: 'template',
        label: `Template: ${template}`,
        clear: () => updateParam('template', 'all'),
      })
    }
    if (category !== 'all') {
      pills.push({
        key: 'category',
        label: `Category: ${categoryLabel(category)}`,
        clear: () => updateParam('category', 'all'),
      })
    }
    if (source !== 'all') {
      pills.push({
        key: 'source',
        label: `Source: ${source === 'generated' ? 'Generated' : 'Manual'}`,
        clear: () => updateParam('source', 'all'),
      })
    }
    if (dateRange !== 'all') {
      const label = DATE_RANGE_OPTIONS.find((o) => o.value === dateRange)?.label ?? dateRange
      pills.push({
        key: 'date',
        label: `Date: ${label}`,
        clear: () => updateParam('date', 'all'),
      })
    }
    return pills
  }, [q, status, template, category, source, dateRange, updateParam])

  const allOnPageSelected =
    articles.length > 0 && articles.every((a) => selected.has(a.id))

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(articles.map((a) => a.id)))
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleHydrateProducts = async (article: Article) => {
    setActionLoading(article.id)
    const toastId = toast.loading('Hydrating products from Amazon…')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 120_000)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        toast.error('Not signed in — refresh and log in again', { id: toastId })
        return
      }
      const res = await fetch('/api/admin/hydrate-article', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ article_id: article.id }),
        signal: controller.signal,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || `Hydration failed (${res.status})`, { id: toastId })
        return
      }
      toast.success(
        `Linked ${data.products_linked ?? 0} products${data.warnings?.length ? ` (${data.warnings.length} warnings)` : ''}`,
        { id: toastId },
      )
      if (Array.isArray(data.warnings) && data.warnings.length > 0) {
        setHydrateWarnings((prev) => ({ ...prev, [article.id]: data.warnings as string[] }))
        toast.warning(data.warnings.slice(0, 3).join('\n'), {
          duration: 12_000,
          description:
            data.warnings.length > 3
              ? `+ ${data.warnings.length - 3} more — open browser console for full list`
              : undefined,
        })
        console.warn('[hydrate-article]', data.warnings)
      } else {
        setHydrateWarnings((prev) => {
          const next = { ...prev }
          delete next[article.id]
          return next
        })
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        toast.error('Hydration timed out after 2 minutes — check Railway logs', { id: toastId })
      } else {
        toast.error(err instanceof Error ? err.message : 'Hydration failed', { id: toastId })
      }
    } finally {
      window.clearTimeout(timeout)
      setActionLoading(null)
    }
  }

  const handlePublish = async (article: Article) => {
    setActionLoading(article.id)
    const toastId = toast.loading('Hydrating products…', {
      description: 'Then publishing article',
    })
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 120_000)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        toast.error('Not signed in — refresh and log in again', { id: toastId })
        return
      }

      const { ok, data } = await publishArticleWithHydration({
        articleId: article.id,
        existingPublishedAt: article.published_at,
        accessToken: token,
        signal: controller.signal,
      })

      if (!ok) {
        toast.error(data.error || 'Publish failed', { id: toastId })
        return
      }

      const hydrateNote = data.hydration_skipped
        ? 'Skipped re-hydration (hydrated within 24h)'
        : `Linked ${data.products_linked ?? 0} products`

      toast.success(`Published — ${hydrateNote}`, { id: toastId })

      if (Array.isArray(data.warnings) && data.warnings.length > 0) {
        setHydrateWarnings((prev) => ({ ...prev, [article.id]: data.warnings as string[] }))
        toast.warning(data.warnings.slice(0, 3).join('\n'), {
          duration: 12_000,
          description:
            data.warnings.length > 3
              ? `+ ${data.warnings.length - 3} more — see article list warnings`
              : undefined,
        })
      }

      load()

      const rebuild = await triggerSiteRebuild()
      if (rebuild.ok) {
        toast.success('Site rebuild started — article URL live in ~3 minutes')
      } else {
        toast.message('Published. Click Rebuild Site to generate the static article page.')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        toast.error('Publish timed out after 2 minutes — check Railway logs', { id: toastId })
      } else {
        toast.error(err instanceof Error ? err.message : 'Publish failed', { id: toastId })
      }
    } finally {
      window.clearTimeout(timeout)
      setActionLoading(null)
    }
  }

  const handleUnpublish = async (article: Article) => {
    setActionLoading(article.id)
    const { error } = await updateArticle(article.id, { status: 'draft' })
    setActionLoading(null)
    if (error) toast.error(error)
    else {
      toast.success('Article unpublished')
      load()
    }
  }

  const handleRebuildSite = async () => {
    setRebuildState('loading')
    setRebuildMessage('Rebuilding...')
    const result = await triggerSiteRebuild()
    if (result.ok) {
      setRebuildState('success')
      setRebuildMessage(result.message)
    } else {
      setRebuildState('error')
      setRebuildMessage(result.message)
    }
  }

  const handleDelete = async (article: Article) => {
    if (!window.confirm(`Delete "${article.title}"? This cannot be undone.`)) return
    setActionLoading(article.id)
    const ok = await deleteArticle(article.id)
    setActionLoading(null)
    if (!ok) toast.error('Failed to delete article')
    else {
      toast.success('Article deleted')
      load()
    }
  }

  const runBulkAction = async (action: BulkAction, ids: string[]) => {
    setBulkBusy(true)
    setConfirmModal(null)

    if (action === 'unpublish') {
      const { ok, error } = await bulkUpdateArticleStatus(ids, 'draft')
      setBulkBusy(false)
      if (!ok) toast.error(error ?? 'Bulk unpublish failed')
      else {
        toast.success(`Unpublished ${ids.length} article(s)`)
        load()
      }
      return
    }

    if (action === 'delete') {
      const { ok, error } = await bulkDeleteArticles(ids)
      setBulkBusy(false)
      if (!ok) toast.error(error ?? 'Bulk delete failed')
      else {
        toast.success(`Deleted ${ids.length} article(s)`)
        load()
      }
    }
  }

  const requestBulkAction = (action: BulkAction) => {
    const ids = [...selected]
    if (!ids.length) {
      toast.message('Select at least one article')
      return
    }
    const labels: Record<BulkAction, string> = {
      unpublish: `Unpublish ${ids.length} selected article(s)?`,
      delete: `Delete ${ids.length} selected article(s)? This cannot be undone.`,
    }
    setConfirmModal({ action, ids, label: labels[action] })
  }

  const pageNumbers = useMemo(() => {
    const windowSize = 5
    let start = Math.max(1, page - Math.floor(windowSize / 2))
    const end = Math.min(totalPages, start + windowSize - 1)
    start = Math.max(1, end - windowSize + 1)
    const nums: number[] = []
    for (let i = start; i <= end; i++) nums.push(i)
    return nums
  }, [page, totalPages])

  const handleGoToPage = () => {
    const n = parseInt(goToPageInput, 10)
    if (!Number.isFinite(n) || n < 1 || n > totalPages) {
      toast.error(`Enter a page between 1 and ${totalPages}`)
      return
    }
    setPage(n)
    setGoToPageInput('')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-cinzel text-xl font-bold text-white">Articles</h2>
          <p className="text-white/40 text-sm mt-0.5">
            {loading ? 'Loading…' : `Showing ${pageStart}–${pageEnd} of ${total} articles`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRebuildSite}
            disabled={rebuildState === 'loading'}
            className="px-4 py-2 rounded-lg border border-white/15 text-white/70 hover:text-white hover:border-white/30 text-sm transition-all disabled:opacity-50"
          >
            {rebuildState === 'loading' ? 'Rebuilding...' : 'Rebuild Site'}
          </button>
          <Link
            href="/admin/articles/new"
            className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-semibold text-sm transition-all"
          >
            + New Article
          </Link>
        </div>
      </div>

      {rebuildState !== 'idle' && rebuildMessage && (
        <p
          className={`text-sm ${
            rebuildState === 'success'
              ? 'text-green-400'
              : rebuildState === 'error'
                ? 'text-red-400'
                : 'text-white/50'
          }`}
        >
          {rebuildMessage}
        </p>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search articles..."
          className="w-full rounded-lg pl-10 pr-10 py-2.5 text-sm bg-white/5 border border-white/10 text-white placeholder:text-white/30 outline-none focus:border-amber-400/40"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => setSearchInput('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={status}
          onChange={(e) => updateParam('status', e.target.value)}
          className={selectClass}
          aria-label="Filter by status"
        >
          <option value="all">Status: All</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="review">Review</option>
        </select>

        <select
          value={template}
          onChange={(e) => updateParam('template', e.target.value)}
          className={selectClass}
          aria-label="Filter by template"
        >
          <option value="all">Template: All</option>
          {TEMPLATE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={category}
          onChange={(e) => updateParam('category', e.target.value)}
          className={selectClass}
          aria-label="Filter by category"
        >
          <option value="all">Category: All</option>
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={source}
          onChange={(e) => updateParam('source', e.target.value)}
          className={selectClass}
          aria-label="Filter by source"
        >
          <option value="all">Source: All</option>
          <option value="generated">Generated</option>
          <option value="manual">Manual</option>
        </select>

        <select
          value={dateRange}
          onChange={(e) => updateParam('date', e.target.value)}
          className={selectClass}
          aria-label="Filter by date"
        >
          {DATE_RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => updateParam('sort', e.target.value, false)}
          className={selectClass}
          aria-label="Sort articles"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              Sort: {o.label}
            </option>
          ))}
        </select>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map((pill) => (
            <span
              key={pill.key}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-amber-400/25 text-amber-300/90 bg-amber-400/5"
            >
              {pill.label}
              <button
                type="button"
                onClick={pill.clear}
                className="hover:text-white"
                aria-label={`Remove ${pill.key} filter`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-xs text-white/40 hover:text-white/70 underline"
          >
            Clear all
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-amber-400/20 bg-amber-400/5">
          <span className="text-sm text-amber-300/90">{selected.size} selected</span>
          <select
            defaultValue=""
            onChange={(e) => {
              const action = e.target.value as BulkAction
              if (action) requestBulkAction(action)
              e.target.value = ''
            }}
            disabled={bulkBusy}
            className={selectClass}
            aria-label="Bulk actions"
          >
            <option value="">Bulk actions…</option>
            <option value="unpublish">Unpublish selected</option>
            <option value="delete">Delete selected</option>
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-12 text-white/30">
          <p>No articles match your filters</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-3 px-4 py-2 text-xs text-white/40">
            <input
              type="checkbox"
              checked={allOnPageSelected}
              onChange={toggleSelectAll}
              className="rounded border-white/20"
              aria-label="Select all on this page"
            />
            <span>Select all on this page</span>
          </div>

          {articles.map((article) => {
            const words = estimateWordCount(article.content_html)
            const promptBadge = articlePromptKey[article.id]
              ? promptKeyBadge(articlePromptKey[article.id])
              : null
            const generated = isGeneratedArticle(article.author_name)

            return (
              <div
                key={article.id}
                className="rounded-xl border border-white/8 bg-white/[0.02] p-4 flex items-start gap-3"
              >
                <input
                  type="checkbox"
                  checked={selected.has(article.id)}
                  onChange={() => toggleSelect(article.id)}
                  className="mt-1 rounded border-white/20 shrink-0"
                  aria-label={`Select ${article.title}`}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[article.status]}`}
                    >
                      {article.status}
                    </span>
                    {article.template_type && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 text-white/35">
                        {article.template_type}
                      </span>
                    )}
                    {article.category && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full border border-violet-400/20 text-violet-300/70">
                        {categoryLabel(article.category)}
                      </span>
                    )}
                    {words > 0 && (
                      <span className="text-white/25 text-xs">{words.toLocaleString()} words</span>
                    )}
                    {generated && (
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full border border-amber-400/25 text-amber-300/85"
                        title={`Auto-generated · Cost: $${(articleCost[article.id] ?? 0).toFixed(2)}`}
                      >
                        Generated
                      </span>
                    )}
                    {generated && promptBadge && (
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full border border-white/15 text-white/45"
                        title={`Prompt: ${articlePromptKey[article.id]}`}
                      >
                        {promptBadge}
                      </span>
                    )}
                    {article.author_name && !generated && (
                      <span className="text-white/25 text-xs">by {article.author_name}</span>
                    )}
                  </div>
                  <p className="font-medium text-white/85 truncate">{article.title}</p>
                  <p className="text-white/30 text-xs mt-0.5">
                    /guides/{article.slug}
                    {article.card_id ? ` · ${article.card_id}` : ''}
                    {' · '}
                    {new Date(article.updated_at).toLocaleDateString()}
                  </p>
                  {hydrateWarnings[article.id]?.length ? (
                    <ul className="mt-2 space-y-1 text-xs text-amber-400/90 max-w-xl">
                      {hydrateWarnings[article.id].map((warning) => (
                        <li key={warning}>⚠ {warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                  <Link
                    href={`/admin/articles/${article.id}/edit`}
                    className="text-white/50 hover:text-white text-xs px-3 py-1.5 border border-white/10 hover:border-white/25 rounded-lg transition-colors"
                  >
                    Edit
                  </Link>
                  {article.status === 'published' && (
                    <button
                      type="button"
                      onClick={() => handleHydrateProducts(article)}
                      disabled={actionLoading === article.id}
                      className="text-amber-400/80 hover:text-amber-300 text-xs px-3 py-1.5 border border-amber-400/20 rounded-lg transition-colors disabled:opacity-30"
                      title="Fetch Amazon product data and link products"
                    >
                      {actionLoading === article.id ? 'Hydrating…' : 'Hydrate'}
                    </button>
                  )}
                  {article.status === 'published' && (
                    <a
                      href={`/guides/${article.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/40 hover:text-amber-400 text-xs px-3 py-1.5 border border-white/10 rounded-lg transition-colors"
                    >
                      View
                    </a>
                  )}
                  {article.status === 'published' ? (
                    <button
                      type="button"
                      onClick={() => handleUnpublish(article)}
                      disabled={actionLoading === article.id}
                      className="text-white/40 hover:text-white/70 text-xs px-3 py-1.5 border border-white/10 rounded-lg transition-colors disabled:opacity-30"
                    >
                      Unpublish
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handlePublish(article)}
                      disabled={actionLoading === article.id}
                      className="text-green-400 hover:text-green-300 text-xs px-3 py-1.5 border border-green-400/30 rounded-lg transition-colors disabled:opacity-30"
                    >
                      {actionLoading === article.id ? 'Hydrating…' : 'Publish'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(article)}
                    disabled={actionLoading === article.id}
                    className="text-red-400/60 hover:text-red-400 text-xs px-3 py-1.5 border border-red-400/20 rounded-lg transition-colors disabled:opacity-30"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 text-sm rounded border border-white/10 text-white/60 disabled:opacity-30 hover:border-white/25"
          >
            Previous
          </button>

          {pageNumbers[0] > 1 && (
            <>
              <button
                type="button"
                onClick={() => setPage(1)}
                className="px-2.5 py-1.5 text-sm rounded border border-white/10 text-white/50 hover:border-white/25"
              >
                1
              </button>
              {pageNumbers[0] > 2 && <span className="text-white/30 text-sm">…</span>}
            </>
          )}

          {pageNumbers.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              className={`px-2.5 py-1.5 text-sm rounded border transition-colors ${
                n === page
                  ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                  : 'border-white/10 text-white/50 hover:border-white/25'
              }`}
            >
              {n}
            </button>
          ))}

          {pageNumbers[pageNumbers.length - 1] < totalPages && (
            <>
              {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && (
                <span className="text-white/30 text-sm">…</span>
              )}
              <button
                type="button"
                onClick={() => setPage(totalPages)}
                className="px-2.5 py-1.5 text-sm rounded border border-white/10 text-white/50 hover:border-white/25"
              >
                {totalPages}
              </button>
            </>
          )}

          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 text-sm rounded border border-white/10 text-white/60 disabled:opacity-30 hover:border-white/25"
          >
            Next
          </button>

          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-xs text-white/40">Go to</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={goToPageInput}
              onChange={(e) => setGoToPageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGoToPage()}
              className="w-14 rounded px-2 py-1 text-sm bg-white/5 border border-white/10 text-white outline-none focus:border-amber-400/40"
              aria-label="Go to page"
            />
            <button
              type="button"
              onClick={handleGoToPage}
              className="px-2 py-1 text-xs rounded border border-white/10 text-white/50 hover:border-white/25"
            >
              Go
            </button>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0d0a1a] p-6 shadow-xl">
            <h3 className="font-cinzel text-lg text-white mb-2">Confirm action</h3>
            <p className="text-white/60 text-sm mb-6">{confirmModal.label}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={bulkBusy}
                className="px-4 py-2 text-sm rounded-lg border border-white/15 text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => runBulkAction(confirmModal.action, confirmModal.ids)}
                disabled={bulkBusy}
                className={`px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-50 ${
                  confirmModal.action === 'delete'
                    ? 'bg-red-500/20 border border-red-400/40 text-red-300 hover:bg-red-500/30'
                    : 'bg-amber-400/20 border border-amber-400/40 text-amber-300 hover:bg-amber-400/30'
                }`}
              >
                {bulkBusy ? 'Working…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
