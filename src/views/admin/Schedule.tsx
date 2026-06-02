'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import {
  SCHEDULE_TEMPLATE_TYPES,
  TEMPLATE_HUMAN_NAMES,
} from '@/config/articleMachinePrompts'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type ScheduleStatus = 'pending' | 'processing' | 'done' | 'failed'

type ScheduleRow = {
  id: string
  card_name: string
  template_type: string
  scheduled_date: string
  status: ScheduleStatus
  article_id: string | null
  error_text: string | null
  created_at: string
  updated_at: string
}

const TEMPLATE_TYPES: string[] = [...SCHEDULE_TEMPLATE_TYPES]

function tomorrowIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function statusBadge(row: ScheduleRow) {
  switch (row.status) {
    case 'pending':
      return (
        <span className="px-2 py-1 rounded-md text-xs border border-white/15 text-white/50">
          Pending
        </span>
      )
    case 'processing':
      return (
        <span className="px-2 py-1 rounded-md text-xs border border-blue-400/40 text-blue-300">
          Processing…
        </span>
      )
    case 'done':
      return (
        <span className="px-2 py-1 rounded-md text-xs border border-green-400/40 text-green-300">
          Published
        </span>
      )
    case 'failed':
      return (
        <span
          className="px-2 py-1 rounded-md text-xs border border-red-400/40 text-red-300"
          title={row.error_text || 'Failed'}
        >
          Failed
        </span>
      )
  }
}

async function getAdminToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token || ''
}

export default function Schedule() {
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming')
  const [rows, setRows] = useState<ScheduleRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const [topic, setTopic] = useState('')
  const [templateType, setTemplateType] = useState<string>(TEMPLATE_TYPES[0] ?? 'roundup-under-budget')
  const [date, setDate] = useState<string>(tomorrowIso())

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkCsv, setBulkCsv] = useState('')
  const [todayCost, setTodayCost] = useState(0)
  const [monthCost, setMonthCost] = useState(0)
  const [todayCostBreakdown, setTodayCostBreakdown] = useState({
    claude: 0,
    replicate: 0,
    gemini: 0,
    articleCount: 0,
    imageCount: 0,
  })
  const [heroByArticleId, setHeroByArticleId] = useState<Record<string, string>>({})
  const [heroByScheduleId, setHeroByScheduleId] = useState<Record<string, string>>({})

  const templateLabels = useMemo(() => {
    const map = TEMPLATE_HUMAN_NAMES
    return (tpl: string) => map[tpl] || tpl
  }, [])

  async function refresh() {
    setLoading(true)
    const now = new Date()
    const dayStart = new Date(now)
    dayStart.setHours(0, 0, 0, 0)
    const nextDay = new Date(dayStart)
    nextDay.setDate(nextDay.getDate() + 1)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [scheduleRes, todayUsageRes, monthCostRes] = await Promise.all([
      supabase
        .from('publishing_schedule')
        .select('*')
        .order('scheduled_date', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('api_usage_log')
        .select('provider, cost_usd, operation, success')
        .gte('created_at', dayStart.toISOString())
        .lt('created_at', nextDay.toISOString()),
      supabase
        .from('api_usage_log')
        .select('cost_usd')
        .gte('created_at', monthStart.toISOString()),
    ])
    setLoading(false)
    if (scheduleRes.error) {
      toast.error(scheduleRes.error.message)
      return
    }
    const scheduleRows = (scheduleRes.data ?? []) as ScheduleRow[]
    setRows(scheduleRows)

    const todayUsage =
      (todayUsageRes.data as Array<{
        provider: string
        cost_usd: number
        operation: string
        success: boolean
      }> | null) ?? []

    let claudeToday = 0
    let replicateToday = 0
    let geminiToday = 0
    let articleCountToday = 0
    let imageCountToday = 0
    for (const row of todayUsage) {
      const cost = Number(row.cost_usd || 0)
      if (row.provider === 'claude') {
        claudeToday += cost
        if (row.operation === 'article_generation' && row.success) articleCountToday += 1
      } else if (row.provider === 'replicate') {
        replicateToday += cost
        if (row.success) imageCountToday += 1
      } else if (row.provider === 'gemini') {
        geminiToday += cost
      }
    }

    setTodayCost(claudeToday + replicateToday + geminiToday)
    setTodayCostBreakdown({
      claude: claudeToday,
      replicate: replicateToday,
      gemini: geminiToday,
      articleCount: articleCountToday,
      imageCount: imageCountToday,
    })
    setMonthCost(
      ((monthCostRes.data as Array<{ cost_usd: number }> | null) ?? []).reduce(
        (sum, row) => sum + Number(row.cost_usd || 0),
        0,
      ),
    )

    const doneRows = scheduleRows.filter((r) => r.status === 'done')
    const articleIds = [
      ...new Set(doneRows.map((r) => r.article_id).filter(Boolean)),
    ] as string[]
    const nextHeroByArticleId: Record<string, string> = {}
    if (articleIds.length) {
      const { data: articlesData } = await supabase
        .from('articles')
        .select('id, hero_image_url, atmosphere_image_url')
        .in('id', articleIds)
      for (const a of (articlesData ?? []) as Array<{
        id: string
        hero_image_url: string | null
        atmosphere_image_url: string | null
      }>) {
        nextHeroByArticleId[a.id] = a.hero_image_url || a.atmosphere_image_url || ''
      }
    }

    const nextHeroByScheduleId: Record<string, string> = {}
    for (const r of doneRows) {
      const path = `articles/atmosphere/${r.id}-hero.jpg`
      const {
        data: { publicUrl },
      } = supabase.storage.from('article-images').getPublicUrl(path)
      nextHeroByScheduleId[r.id] = publicUrl
    }
    setHeroByArticleId(nextHeroByArticleId)
    setHeroByScheduleId(nextHeroByScheduleId)
  }

  useEffect(() => {
    void refresh()
  }, [])

  const today = new Date().toISOString().slice(0, 10)
  const todayPending = rows.filter((r) => r.scheduled_date === today && r.status === 'pending').length
  const weekEnd = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().slice(0, 10)
  })()
  const weekCount = rows.filter(
    (r) => r.scheduled_date >= today && r.scheduled_date <= weekEnd && r.status === 'pending',
  ).length
  const totalDone = rows.filter((r) => r.status === 'done').length

  const upcoming = rows.filter((r) => r.status !== 'done').filter((r) => r.scheduled_date >= today)
  const history = rows.filter((r) => r.status === 'done').sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))

  async function addRow() {
    if (!date) return toast.error('Pick a date')
    const trimmed = topic.trim()
    if (!trimmed) return toast.error('Enter article topic (e.g. best camping tent under 200)')
    if (!TEMPLATE_TYPES.includes(templateType)) return toast.error('Invalid template type')

    const { error } = await supabase.from('publishing_schedule').insert({
      card_name: trimmed,
      template_type: templateType,
      scheduled_date: date,
      status: 'pending',
      updated_at: new Date().toISOString(),
    })
    if (error) return toast.error(error.message)
    toast.success('Added to schedule')
    setTopic('')
    await refresh()
  }

  async function deleteRow(id: string) {
    if (!confirm('Delete this schedule row?')) return
    const { error } = await supabase.from('publishing_schedule').delete().eq('id', id)
    if (error) toast.error(error.message)
    else {
      toast.success('Deleted')
      await refresh()
    }
  }

  async function retryRow(row: ScheduleRow) {
    const { error } = await supabase
      .from('publishing_schedule')
      .update({ status: 'pending', error_text: null, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Retrying generation…')
    await refresh()
    await generateNow({ ...row, status: 'pending', error_text: null })
  }

  async function generateNow(row: ScheduleRow) {
    setBusyId(row.id)
    const toastId = toast.loading('Generating article (1–3 min)…')
    try {
      const token = await getAdminToken()
      if (!token) {
        toast.error('Not signed in — refresh and log in again', { id: toastId })
        return
      }
      const res = await fetch('/api/generate-article', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          card_name: row.card_name,
          template_type: row.template_type,
          schedule_id: row.id,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        destination?: string
        wp_post_url?: string
      }
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`)
      toast.success('Generated and published', { id: toastId })
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed', { id: toastId })
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  function parseCsv(text: string): Array<{ card: string; tpl: string; date: string }> {
    const out: Array<{ card: string; tpl: string; date: string }> = []
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const [card, tpl, dt] = trimmed.split(',').map((s) => s.trim())
      out.push({ card: card || '', tpl: tpl || '', date: dt || '' })
    }
    return out
  }

  async function importCsv() {
    const parsed = parseCsv(bulkCsv)
    if (parsed.length === 0) return toast.error('No rows found')

    const errors: string[] = []
    const inserts = parsed
      .map((r, i) => {
        if (!r.card.trim()) errors.push(`Row ${i + 1}: missing topic`)
        if (!TEMPLATE_TYPES.includes(r.tpl)) errors.push(`Row ${i + 1}: invalid template type`)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) errors.push(`Row ${i + 1}: invalid date`)
        return {
          card_name: r.card,
          template_type: r.tpl,
          scheduled_date: r.date,
          status: 'pending',
          updated_at: new Date().toISOString(),
        }
      })

    if (errors.length) return toast.error(errors[0])

    const { error } = await supabase.from('publishing_schedule').insert(inserts)
    if (error) return toast.error(error.message)
    toast.success(`Added ${inserts.length} articles to schedule`)
    setBulkCsv('')
    setBulkOpen(false)
    await refresh()
  }

  if (loading) return <p className="font-inter text-foreground/50">Loading schedule…</p>

  return (
    <div className="space-y-6">
      <div className="rounded-xl p-4 glass border border-white/10 flex flex-wrap gap-3 items-center justify-between">
        <p className="font-inter text-sm text-foreground/70">
          Today: <span className="text-foreground/90 font-medium">{todayPending} pending</span> · This
          week: <span className="text-foreground/90 font-medium">{weekCount}</span> · Total done:{' '}
          <span className="text-foreground/90 font-medium">{totalDone}</span> · Est. cost today:{' '}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-foreground/90 font-medium underline decoration-dotted decoration-white/30 cursor-help">
                  ${todayCost.toFixed(2)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-inter text-xs leading-relaxed">
                <p>Est. cost today: ${todayCost.toFixed(2)}</p>
                <p className="text-background/80">
                  ↳ Claude: ${todayCostBreakdown.claude.toFixed(3)} ({todayCostBreakdown.articleCount}{' '}
                  {todayCostBreakdown.articleCount === 1 ? 'article' : 'articles'})
                </p>
                <p className="text-background/80">
                  ↳ Replicate: ${todayCostBreakdown.replicate.toFixed(3)} ({todayCostBreakdown.imageCount}{' '}
                  {todayCostBreakdown.imageCount === 1 ? 'image' : 'images'})
                </p>
                <p className="text-background/80">↳ Gemini: ${todayCostBreakdown.gemini.toFixed(2)}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>{' '}
          · This month:{' '}
          <span className="text-foreground/90 font-medium">${monthCost.toFixed(2)}</span>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab('upcoming')}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              tab === 'upcoming'
                ? 'border-gold/50 text-gold bg-gold/10'
                : 'border-white/10 text-white/50 hover:text-white/80'
            }`}
          >
            Upcoming
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              tab === 'history'
                ? 'border-gold/50 text-gold bg-gold/10'
                : 'border-white/10 text-white/50 hover:text-white/80'
            }`}
          >
            History
          </button>
        </div>
      </div>

      <section className="rounded-xl p-6 glass border border-white/10 space-y-4">
        <h2 className="font-cinzel text-sm text-gold">Add article</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="font-inter text-xs text-foreground/50">Article topic</label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Best camping tent under $200"
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm font-inter bg-white/5 border border-white/10 text-foreground"
            />
          </div>
          <div>
            <label className="font-inter text-xs text-foreground/50">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm font-inter bg-white/5 border border-white/10 text-foreground"
            />
          </div>
          <div className="md:col-span-3">
            <label className="font-inter text-xs text-foreground/50">Template</label>
            <select
              value={templateType}
              onChange={(e) => setTemplateType(e.target.value)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm font-inter bg-white/5 border border-white/10 text-foreground"
            >
              {TEMPLATE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {templateLabels(t)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addRow}
            className="font-cinzel px-5 py-2.5 rounded-lg bg-gold text-background"
          >
            Add to Schedule
          </button>
          <button
            type="button"
            onClick={() => setBulkOpen((o) => !o)}
            className="font-inter text-sm px-4 py-2.5 rounded-lg border border-white/15 text-foreground/60 hover:text-foreground hover:border-white/25"
          >
            Bulk Import via CSV
          </button>
        </div>

        {bulkOpen && (
          <div className="rounded-lg border border-white/10 p-4 space-y-3">
            <label className="font-inter text-xs text-foreground/50">Bulk Import via CSV</label>
            <textarea
              value={bulkCsv}
              onChange={(e) => setBulkCsv(e.target.value)}
              rows={5}
              placeholder={`best camping tent under 200,roundup-under-budget,${today}\nbest hiking boots,best-of-category,${tomorrowIso()}`}
              className="w-full rounded-lg px-3 py-2 text-xs font-mono bg-white/5 border border-white/10 text-foreground"
            />
            <button
              type="button"
              onClick={importCsv}
              className="font-inter text-sm px-4 py-2 rounded-lg border border-gold/40 text-gold hover:bg-gold/10"
            >
              Import CSV
            </button>
          </div>
        )}
      </section>

      <div className="rounded-xl overflow-hidden glass border border-white/10">
        <table className="w-full text-sm font-inter">
          <thead className="bg-white/[0.03] text-foreground/60">
            <tr>
              {tab === 'history' && <th className="px-5 py-3 text-left font-medium w-[72px]">Hero</th>}
              <th className="px-5 py-3 text-left font-medium">Date</th>
              <th className="px-5 py-3 text-left font-medium">Topic</th>
              <th className="px-5 py-3 text-left font-medium">Template</th>
              <th className="px-5 py-3 text-left font-medium">Status</th>
              <th className="px-5 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {(tab === 'upcoming' ? upcoming : history).map((r) => {
              const heroUrl =
                heroByScheduleId[r.id] ||
                (r.article_id ? heroByArticleId[r.article_id] : undefined)

              return (
              <tr key={r.id} className="hover:bg-white/[0.02]">
                {tab === 'history' && (
                  <td className="px-5 py-3">
                    {heroUrl ? (
                      <a href={heroUrl} target="_blank" rel="noopener noreferrer">
                        <img
                          src={heroUrl}
                          alt=""
                          width={60}
                          height={40}
                          className="w-[60px] h-[40px] object-cover rounded-md border border-white/10"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      </a>
                    ) : (
                      <span className="text-foreground/30 text-xs">—</span>
                    )}
                  </td>
                )}
                <td className="px-5 py-3 text-foreground/70">{r.scheduled_date}</td>
                <td className="px-5 py-3 text-foreground/80">{r.card_name}</td>
                <td className="px-5 py-3 text-foreground/60">{templateLabels(r.template_type)}</td>
                <td className="px-5 py-3">
                  <div className="space-y-1">
                    {statusBadge(r)}
                    {r.status === 'failed' && r.error_text && (
                      <p className="text-xs text-red-300/80 max-w-xs leading-snug" title={r.error_text}>
                        {r.error_text}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-2 items-center">
                    {r.status === 'pending' && tab === 'upcoming' && (
                      <button
                        type="button"
                        onClick={() => generateNow(r)}
                        disabled={busyId === r.id}
                        className="px-3 py-1.5 rounded-lg text-xs border border-gold/40 text-gold hover:bg-gold/10 disabled:opacity-50"
                      >
                        {busyId === r.id ? 'Generating…' : 'Generate Now'}
                      </button>
                    )}
                    {r.status === 'failed' && (
                      <>
                        <button
                          type="button"
                          onClick={() => retryRow(r)}
                          disabled={busyId === r.id}
                          className="px-3 py-1.5 rounded-lg text-xs border border-gold/40 text-gold hover:bg-gold/10 disabled:opacity-50"
                        >
                          {busyId === r.id ? 'Generating…' : 'Retry'}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRow(r.id)}
                          className="px-3 py-1.5 rounded-lg text-xs border border-red-400/30 text-red-300/90 hover:bg-red-400/10"
                        >
                          Delete
                        </button>
                      </>
                    )}
                    {r.status === 'pending' && tab === 'upcoming' && (
                      <button
                        type="button"
                        onClick={() => deleteRow(r.id)}
                        className="px-3 py-1.5 rounded-lg text-xs border border-red-400/30 text-red-300/90 hover:bg-red-400/10"
                      >
                        Delete
                      </button>
                    )}
                    {r.status === 'done' && r.article_id && (
                      <Link
                        href={`/admin/articles/${r.article_id}/edit`}
                        className="text-xs text-gold hover:underline"
                      >
                        View Article
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            )})}
            {(tab === 'upcoming' ? upcoming : history).length === 0 && (
              <tr>
                <td colSpan={tab === 'history' ? 7 : 6} className="px-5 py-8 text-center text-foreground/40">
                  No rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

