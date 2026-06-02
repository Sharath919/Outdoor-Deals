'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function Dashboard() {
  const [stats, setStats] = useState({
    published: 0,
    pending: 0,
    failed: 0,
  })

  useEffect(() => {
    async function load() {
      const [articles, schedule] = await Promise.all([
        supabase.from('articles').select('id', { count: 'exact', head: true }).eq('status', 'published'),
        supabase.from('publishing_schedule').select('status'),
      ])
      const rows = schedule.data ?? []
      setStats({
        published: articles.count ?? 0,
        pending: rows.filter((r) => r.status === 'pending').length,
        failed: rows.filter((r) => r.status === 'failed').length,
      })
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
      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/schedule"
          className="rounded-lg bg-[#c9a84c] text-black px-4 py-2 text-sm font-medium"
        >
          Open schedule
        </Link>
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
