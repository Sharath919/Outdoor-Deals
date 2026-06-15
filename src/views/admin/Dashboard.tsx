'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { tableExists } from '@/lib/admin'

export default function Dashboard() {
  const [stats, setStats] = useState({
    published: 0,
    pending: 0,
    failed: 0,
    activeWatches: 0,
    uniqueEmails: 0,
    alertsSent: 0,
  })
  const [priceAlertsReady, setPriceAlertsReady] = useState(false)

  useEffect(() => {
    async function load() {
      const [articles, schedule, hasPriceAlerts] = await Promise.all([
        supabase.from('articles').select('id', { count: 'exact', head: true }).eq('status', 'published'),
        supabase.from('publishing_schedule').select('status'),
        tableExists('price_watches'),
      ])

      const rows = schedule.data ?? []
      const next = {
        published: articles.count ?? 0,
        pending: rows.filter((r) => r.status === 'pending').length,
        failed: rows.filter((r) => r.status === 'failed').length,
        activeWatches: 0,
        uniqueEmails: 0,
        alertsSent: 0,
      }

      setPriceAlertsReady(hasPriceAlerts)

      if (hasPriceAlerts) {
        const { data: watches } = await supabase
          .from('price_watches')
          .select('email, status')
          .limit(5000)

        const list = watches ?? []
        next.activeWatches = list.filter((w) => w.status === 'active').length
        next.alertsSent = list.filter((w) => w.status === 'notified').length
        next.uniqueEmails = new Set(list.map((w) => String(w.email).toLowerCase())).size
      }

      setStats(next)
    }
    void load()
  }, [])

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Published guides" value={stats.published} />
        <StatCard label="Scheduled pending" value={stats.pending} />
        <StatCard label="Failed jobs" value={stats.failed} />
      </div>

      {priceAlertsReady ? (
        <div>
          <h2 className="text-sm font-medium text-foreground/50 mb-3">Price drop alerts</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Active watches" value={stats.activeWatches} />
            <StatCard label="Unique emails" value={stats.uniqueEmails} />
            <StatCard label="Alerts sent" value={stats.alertsSent} />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/schedule"
          className="rounded-lg bg-[#c9a84c] text-black px-4 py-2 text-sm font-medium"
        >
          Open schedule
        </Link>
        {priceAlertsReady ? (
          <Link
            href="/admin/analytics/price-alerts"
            className="rounded-lg border border-white/20 px-4 py-2 text-sm"
          >
            Price alerts
          </Link>
        ) : null}
        <Link
          href="/admin/settings/amazon-affiliate"
          className="rounded-lg border border-white/20 px-4 py-2 text-sm"
        >
          Amazon affiliate
        </Link>
        <Link
          href="/admin/settings/article-machine"
          className="rounded-lg border border-white/20 px-4 py-2 text-sm"
        >
          Article machine
        </Link>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl glass border border-white/10 p-5">
      <p className="text-xs text-foreground/50">{label}</p>
      <p className="text-3xl font-semibold mt-1">{value}</p>
    </div>
  )
}
