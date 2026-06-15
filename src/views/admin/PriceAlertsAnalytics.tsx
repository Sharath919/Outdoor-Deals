'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { downloadCSV, formatDateTime, tableExists, truncate } from '@/lib/admin'

type PriceWatchRow = {
  id: string
  email: string
  asin: string
  product_name: string
  price_at_watch: number
  article_slug: string | null
  status: string
  created_at: string
  confirmed_at: string | null
  notified_at: string | null
}

type TrackedProductRow = {
  asin: string
  product_name: string
  current_price: number | null
  previous_price: number | null
  priority: number
  last_checked: string | null
  consecutive_failures: number
  active: boolean
}

type WatchTab = 'all' | 'active' | 'pending_confirm' | 'notified' | 'other'

const STATUS_STYLES: Record<string, string> = {
  active: 'text-green-400 bg-green-400/10 border-green-400/25',
  pending_confirm: 'text-amber-400 bg-amber-400/10 border-amber-400/25',
  notified: 'text-sky-400 bg-sky-400/10 border-sky-400/25',
  unsubscribed: 'text-white/40 bg-white/5 border-white/10',
  expired: 'text-white/40 bg-white/5 border-white/10',
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `$${Number(value).toFixed(2)}`
}

function statusBadge(status: string) {
  const style = STATUS_STYLES[status] ?? 'text-white/50 bg-white/5 border-white/10'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${style}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

export default function PriceAlertsAnalytics() {
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)
  const [watches, setWatches] = useState<PriceWatchRow[]>([])
  const [tracked, setTracked] = useState<TrackedProductRow[]>([])
  const [tab, setTab] = useState<WatchTab>('all')
  const [panel, setPanel] = useState<'watches' | 'products'>('watches')

  useEffect(() => {
    async function load() {
      const exists = await tableExists('price_watches')
      setAvailable(exists)
      if (!exists) {
        setLoading(false)
        return
      }

      const [watchesRes, trackedRes] = await Promise.all([
        supabase
          .from('price_watches')
          .select('id, email, asin, product_name, price_at_watch, article_slug, status, created_at, confirmed_at, notified_at')
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase
          .from('tracked_products')
          .select('asin, product_name, current_price, previous_price, priority, last_checked, consecutive_failures, active')
          .order('priority', { ascending: true })
          .order('last_checked', { ascending: true, nullsFirst: true })
          .limit(500),
      ])

      if (!watchesRes.error) setWatches((watchesRes.data ?? []) as PriceWatchRow[])
      if (!trackedRes.error) setTracked((trackedRes.data ?? []) as TrackedProductRow[])
      setLoading(false)
    }
    void load()
  }, [])

  const trackedByAsin = useMemo(
    () => new Map(tracked.map((row) => [row.asin, row])),
    [tracked],
  )

  const stats = useMemo(() => {
    const uniqueEmails = new Set(watches.map((w) => w.email.toLowerCase()))
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const newThisWeek = watches.filter((w) => new Date(w.created_at).getTime() >= weekAgo).length

    return {
      totalWatches: watches.length,
      uniqueEmails: uniqueEmails.size,
      active: watches.filter((w) => w.status === 'active').length,
      pending: watches.filter((w) => w.status === 'pending_confirm').length,
      notified: watches.filter((w) => w.status === 'notified').length,
      newThisWeek,
      trackedActive: tracked.filter((t) => t.active).length,
      trackedTotal: tracked.length,
      priorityOne: tracked.filter((t) => t.active && t.priority === 1).length,
    }
  }, [watches, tracked])

  const filteredWatches = useMemo(() => {
    if (tab === 'all') return watches
    if (tab === 'other') {
      return watches.filter((w) => !['active', 'pending_confirm', 'notified'].includes(w.status))
    }
    return watches.filter((w) => w.status === tab)
  }, [watches, tab])

  const watchersByAsin = useMemo(() => {
    const map = new Map<string, number>()
    for (const watch of watches) {
      if (watch.status !== 'active') continue
      map.set(watch.asin, (map.get(watch.asin) ?? 0) + 1)
    }
    return map
  }, [watches])

  function exportWatches() {
    downloadCSV(
      `price-watches-${new Date().toISOString().slice(0, 10)}.csv`,
      ['email', 'asin', 'product', 'status', 'price_at_watch', 'current_price', 'article_slug', 'created', 'confirmed', 'notified'],
      filteredWatches.map((w) => {
        const product = trackedByAsin.get(w.asin)
        return [
          w.email,
          w.asin,
          w.product_name,
          w.status,
          String(w.price_at_watch),
          product?.current_price != null ? String(product.current_price) : '',
          w.article_slug ?? '',
          w.created_at,
          w.confirmed_at ?? '',
          w.notified_at ?? '',
        ]
      }),
    )
  }

  if (loading) {
    return <p className="text-sm text-foreground/50">Loading price alert data…</p>
  }

  if (!available) {
    return (
      <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-6 max-w-xl">
        <h2 className="text-lg font-semibold text-amber-200 mb-2">Migration not applied</h2>
        <p className="text-sm text-foreground/70">
          Run{' '}
          <code className="text-amber-200">supabase/migrations/20260613120000_price_drop_alerts.sql</code>{' '}
          in Supabase to enable price watches and tracked products.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-foreground/55 max-w-2xl">
          Price drop alerts — emails collected from guide pages, confirmation flow, daily PA-API polling,
          and Resend notifications when price drops ≥5% and ≥$5.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat label="Unique emails" value={stats.uniqueEmails} />
        <MiniStat label="Active watches" value={stats.active} accent />
        <MiniStat label="Pending confirm" value={stats.pending} />
        <MiniStat label="Alerts sent" value={stats.notified} />
        <MiniStat label="New watches (7d)" value={stats.newThisWeek} />
        <MiniStat label="Tracked ASINs" value={stats.trackedActive} />
        <MiniStat label="Priority polling" value={stats.priorityOne} />
        <MiniStat label="Total signups" value={stats.totalWatches} />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        <PanelButton active={panel === 'watches'} onClick={() => setPanel('watches')}>
          Watches ({watches.length})
        </PanelButton>
        <PanelButton active={panel === 'products'} onClick={() => setPanel('products')}>
          Tracked products ({tracked.length})
        </PanelButton>
        {panel === 'watches' ? (
          <button
            type="button"
            onClick={exportWatches}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-white/15 text-foreground/70 hover:text-foreground"
          >
            Export CSV
          </button>
        ) : null}
      </div>

      {panel === 'watches' ? (
        <>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['all', 'All'],
                ['active', 'Active'],
                ['pending_confirm', 'Pending'],
                ['notified', 'Notified'],
                ['other', 'Other'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  tab === key
                    ? 'border-[#c9a84c] text-[#c9a84c] bg-[#c9a84c]/10'
                    : 'border-white/10 text-foreground/50 hover:text-foreground/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-foreground/45 border-b border-white/10 bg-white/[0.02]">
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Watch price</th>
                  <th className="px-4 py-3 font-medium">Current</th>
                  <th className="px-4 py-3 font-medium">Guide</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Notified</th>
                </tr>
              </thead>
              <tbody>
                {filteredWatches.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-foreground/40">
                      No watches in this filter yet.
                    </td>
                  </tr>
                ) : (
                  filteredWatches.map((watch) => {
                    const product = trackedByAsin.get(watch.asin)
                    return (
                      <tr key={watch.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-foreground/80">{watch.email}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground/90">{truncate(watch.product_name, 42)}</div>
                          <Link
                            href={`/deals/${watch.asin}`}
                            className="text-xs text-[#c9a84c] no-underline hover:opacity-80"
                          >
                            {watch.asin}
                          </Link>
                        </td>
                        <td className="px-4 py-3">{statusBadge(watch.status)}</td>
                        <td className="px-4 py-3">{formatMoney(watch.price_at_watch)}</td>
                        <td className="px-4 py-3">
                          {formatMoney(product?.current_price)}
                          {product?.previous_price != null &&
                          product.current_price != null &&
                          product.current_price < product.previous_price ? (
                            <span className="block text-xs text-green-400">↓ from {formatMoney(product.previous_price)}</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {watch.article_slug ? (
                            <Link
                              href={`/guides/${watch.article_slug}`}
                              className="text-[#c9a84c] no-underline hover:opacity-80"
                            >
                              {truncate(watch.article_slug, 24)}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-foreground/50 whitespace-nowrap">
                          {formatDateTime(watch.created_at)}
                        </td>
                        <td className="px-4 py-3 text-foreground/50 whitespace-nowrap">
                          {watch.notified_at ? formatDateTime(watch.notified_at) : '—'}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-foreground/45 border-b border-white/10 bg-white/[0.02]">
                <th className="px-4 py-3 font-medium">ASIN</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Current</th>
                <th className="px-4 py-3 font-medium">Previous</th>
                <th className="px-4 py-3 font-medium">Active watchers</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Last checked</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {tracked.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-foreground/40">
                    No tracked products yet — they appear when someone watches a price.
                  </td>
                </tr>
              ) : (
                tracked.map((row) => (
                  <tr key={row.asin} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/deals/${row.asin}`}
                        className="text-[#c9a84c] no-underline hover:opacity-80"
                      >
                        {row.asin}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{truncate(row.product_name, 40)}</td>
                    <td className="px-4 py-3">{formatMoney(row.current_price)}</td>
                    <td className="px-4 py-3">{formatMoney(row.previous_price)}</td>
                    <td className="px-4 py-3">{watchersByAsin.get(row.asin) ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-foreground/60">P{row.priority}</span>
                    </td>
                    <td className="px-4 py-3 text-foreground/50 whitespace-nowrap">
                      {row.last_checked ? formatDateTime(row.last_checked) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {row.active ? (
                        <span className="text-xs text-green-400">active</span>
                      ) : (
                        <span className="text-xs text-foreground/40">inactive</span>
                      )}
                      {row.consecutive_failures > 0 ? (
                        <span className="block text-xs text-amber-400">{row.consecutive_failures} failures</span>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-foreground/45 space-y-1">
        <p>
          <strong className="text-foreground/60">Cron:</strong> daily via{' '}
          <code>npm run cron:price-check</code> → <code>/api/cron/price-check</code>
        </p>
        <p>
          <strong className="text-foreground/60">Alert rule:</strong> ≥5% drop and ≥$5 off watch price (Resend email, then status → notified).
        </p>
        <p>
          <strong className="text-foreground/60">Env:</strong> PAAPI_*, RESEND_API_KEY, ALERT_FROM_EMAIL, CRON_SECRET
        </p>
      </div>
    </div>
  )
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: boolean
}) {
  return (
    <div className="rounded-xl glass border border-white/10 p-4">
      <p className="text-xs text-foreground/45">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${accent ? 'text-[#c9a84c]' : ''}`}>{value}</p>
    </div>
  )
}

function PanelButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
        active
          ? 'border-[#c9a84c] text-[#c9a84c] bg-[#c9a84c]/10'
          : 'border-white/10 text-foreground/55 hover:text-foreground/85'
      }`}
    >
      {children}
    </button>
  )
}
