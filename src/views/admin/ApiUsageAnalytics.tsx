'use client'

import { type ReactNode, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '@/lib/supabase'
import { downloadCSV } from '@/lib/admin'
import { API_COSTS, calculateReplicateImageCost } from '@/config/apiCosts'

type UsageProvider = 'claude' | 'gemini' | 'replicate'

type UsageLog = {
  id: string
  article_id: string | null
  schedule_id: string | null
  provider: UsageProvider
  model: string
  operation: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cost_usd: number
  duration_ms: number
  success: boolean
  error_text: string | null
  created_at: string
}

type ArticleMeta = { id: string; title: string; slug: string; created_at: string }

const CHART_TOOLTIP = {
  contentStyle: { background: '#0d0d1f', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8 },
  labelStyle: { color: '#F0EDF8' },
  itemStyle: { color: '#C9A84C' },
}

function currency(v: number): string {
  return `$${v.toFixed(2)}`
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function monthLabel(d: Date): string {
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

export default function ApiUsageAnalytics() {
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<UsageLog[]>([])
  const [articleById, setArticleById] = useState<Record<string, ArticleMeta>>({})
  const [scheduleDestById, setScheduleDestById] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<'article' | 'day' | 'provider'>('article')
  const [showRaw, setShowRaw] = useState(false)
  const [rawProvider, setRawProvider] = useState<'all' | UsageProvider>('all')
  const [rawSuccess, setRawSuccess] = useState<'all' | 'success' | 'failed'>('all')
  const [rawOperation, setRawOperation] = useState<string>('all')
  const [rawStartDate, setRawStartDate] = useState<string>('')
  const [rawEndDate, setRawEndDate] = useState<string>('')

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('api_usage_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5000)
      if (error) {
        setLoading(false)
        return
      }

      const nextLogs = (data ?? []) as UsageLog[]
      setLogs(nextLogs)

      const scheduleIds = [
        ...new Set(nextLogs.map((l) => l.schedule_id).filter(Boolean)),
      ] as string[]
      if (scheduleIds.length) {
        const { data: scheduleData } = await supabase
          .from('publishing_schedule')
          .select('id, destination')
          .in('id', scheduleIds)
        const destMap: Record<string, string> = {}
        for (const row of (scheduleData ?? []) as Array<{ id: string; destination: string }>) {
          destMap[row.id] = row.destination
        }
        setScheduleDestById(destMap)
      }

      const articleIds = [...new Set(nextLogs.map((l) => l.article_id).filter(Boolean))] as string[]
      if (articleIds.length) {
        const { data: articlesData } = await supabase
          .from('articles')
          .select('id, title, slug, created_at')
          .in('id', articleIds)
        const map: Record<string, ArticleMeta> = {}
        for (const a of (articlesData ?? []) as ArticleMeta[]) map[a.id] = a
        setArticleById(map)
      }
      setLoading(false)
    }
    load()
  }, [])

  const operationOptions = useMemo(
    () => ['all', ...new Set(logs.map((l) => l.operation))],
    [logs],
  )

  const totalCost = useMemo(
    () => logs.reduce((sum, l) => sum + Number(l.cost_usd || 0), 0),
    [logs],
  )
  const claudeCost = useMemo(
    () => logs.filter((l) => l.provider === 'claude').reduce((s, l) => s + Number(l.cost_usd || 0), 0),
    [logs],
  )
  const geminiCost = useMemo(
    () => logs.filter((l) => l.provider === 'gemini').reduce((s, l) => s + Number(l.cost_usd || 0), 0),
    [logs],
  )
  const replicateCost = useMemo(
    () => logs.filter((l) => l.provider === 'replicate').reduce((s, l) => s + Number(l.cost_usd || 0), 0),
    [logs],
  )
  const hasGeminiUsage = geminiCost > 0

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const monthCost = useMemo(
    () =>
      logs
        .filter((l) => new Date(l.created_at) >= monthStart)
        .reduce((s, l) => s + Number(l.cost_usd || 0), 0),
    [logs, monthStart],
  )
  const prevMonthCost = useMemo(
    () =>
      logs
        .filter((l) => {
          const d = new Date(l.created_at)
          return d >= prevMonthStart && d < monthStart
        })
        .reduce((s, l) => s + Number(l.cost_usd || 0), 0),
    [logs, prevMonthStart, monthStart],
  )
  const monthTrendPct =
    prevMonthCost > 0 ? ((monthCost - prevMonthCost) / prevMonthCost) * 100 : monthCost > 0 ? 100 : 0

  const costByArticle = useMemo(() => {
    const agg: Record<
      string,
      {
        key: string
        article_id: string | null
        claudeTokens: number
        claudeCost: number
        replicateImages: number
        replicateCost: number
        geminiImages: number
        geminiCost: number
        totalCost: number
        created_at: string
      }
    > = {}
    for (const l of logs) {
      const key = l.article_id || l.schedule_id
      if (!key) continue
      agg[key] ||= {
        key,
        article_id: l.article_id,
        claudeTokens: 0,
        claudeCost: 0,
        replicateImages: 0,
        replicateCost: 0,
        geminiImages: 0,
        geminiCost: 0,
        totalCost: 0,
        created_at: l.created_at,
      }
      const row = agg[key]
      if (l.article_id) row.article_id = l.article_id
      row.totalCost += Number(l.cost_usd || 0)
      if (l.created_at < row.created_at) row.created_at = l.created_at
      if (l.provider === 'claude') {
        row.claudeTokens += Number(l.total_tokens || 0)
        row.claudeCost += Number(l.cost_usd || 0)
      } else if (l.provider === 'replicate') {
        if (l.success) row.replicateImages += 1
        row.replicateCost += Number(l.cost_usd || 0)
      } else if (l.provider === 'gemini') {
        if (l.success) row.geminiImages += 1
        row.geminiCost += Number(l.cost_usd || 0)
      }
    }
    return Object.values(agg).sort((a, b) => b.totalCost - a.totalCost)
  }, [logs])

  const avgCostPerArticle =
    costByArticle.length > 0
      ? costByArticle.reduce((s, a) => s + a.totalCost, 0) / costByArticle.length
      : 0
  const avgClaudePerArticle =
    costByArticle.length > 0
      ? costByArticle.reduce((s, a) => s + a.claudeCost, 0) / costByArticle.length
      : 0
  const avgGeminiPerArticle =
    costByArticle.length > 0
      ? costByArticle.reduce((s, a) => s + a.geminiCost, 0) / costByArticle.length
      : 0
  const avgReplicatePerArticle =
    costByArticle.length > 0
      ? costByArticle.reduce((s, a) => s + a.replicateCost, 0) / costByArticle.length
      : 0

  const generationCount = useMemo(() => {
    const keys = new Set<string>()
    for (const l of logs) {
      if (l.operation === 'article_generation' && l.provider === 'claude') {
        const key = l.article_id || l.schedule_id
        if (key) keys.add(key)
      }
    }
    return Math.max(keys.size, costByArticle.length, 1)
  }, [logs, costByArticle.length])

  const monthClaudeCost = useMemo(
    () =>
      logs
        .filter((l) => l.provider === 'claude' && new Date(l.created_at) >= monthStart)
        .reduce((s, l) => s + Number(l.cost_usd || 0), 0),
    [logs, monthStart],
  )
  const monthReplicateCost = useMemo(
    () =>
      logs
        .filter((l) => l.provider === 'replicate' && new Date(l.created_at) >= monthStart)
        .reduce((s, l) => s + Number(l.cost_usd || 0), 0),
    [logs, monthStart],
  )

  const today = isoDay(new Date())
  const todayArticles = new Set(
    costByArticle.filter((a) => a.created_at.slice(0, 10) === today).map((a) => a.article_id),
  ).size
  const monthArticles = new Set(
    costByArticle.filter((a) => new Date(a.created_at) >= monthStart).map((a) => a.article_id),
  ).size

  const dailyChart = useMemo(() => {
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (29 - i))
      return isoDay(d)
    })
    const map: Record<string, { date: string; claude: number; replicate: number; total: number }> = {}
    for (const d of days) map[d] = { date: d, claude: 0, replicate: 0, total: 0 }
    for (const l of logs) {
      const day = l.created_at.slice(0, 10)
      if (!map[day]) continue
      const cost = Number(l.cost_usd || 0)
      map[day].total += cost
      if (l.provider === 'claude') map[day].claude += cost
      else if (l.provider === 'replicate') map[day].replicate += cost
    }
    return days.map((d) => map[d])
  }, [logs])

  const byDayRows = useMemo(() => {
    const map: Record<
      string,
      { date: string; articles: Set<string>; claudeTokens: number; claudeCost: number; replicateCost: number; geminiCost: number; total: number }
    > = {}
    for (const l of logs) {
      const d = l.created_at.slice(0, 10)
      map[d] ||= { date: d, articles: new Set<string>(), claudeTokens: 0, claudeCost: 0, replicateCost: 0, geminiCost: 0, total: 0 }
      const row = map[d]
      const genKey = l.article_id || l.schedule_id
      if (genKey) row.articles.add(genKey)
      row.total += Number(l.cost_usd || 0)
      if (l.provider === 'claude') {
        row.claudeTokens += Number(l.total_tokens || 0)
        row.claudeCost += Number(l.cost_usd || 0)
      } else if (l.provider === 'replicate') row.replicateCost += Number(l.cost_usd || 0)
      else if (l.provider === 'gemini') row.geminiCost += Number(l.cost_usd || 0)
    }
    return Object.values(map)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 30)
  }, [logs])

  const providerSummary = useMemo(() => {
    const claude = logs.filter((l) => l.provider === 'claude')
    const gemini = logs.filter((l) => l.provider === 'gemini')
    const replicate = logs.filter((l) => l.provider === 'replicate')
    const replicateSuccess = replicate.filter((l) => l.success)
    const wordpressImages = replicate.filter(
      (l) => l.schedule_id && scheduleDestById[l.schedule_id] === 'wordpress',
    )
    const generatedArticleCount = generationCount
    const replicateSuccessRate =
      replicate.length > 0 ? (replicateSuccess.length / replicate.length) * 100 : 0
    return {
      claude: {
        requests: claude.length,
        input: claude.reduce((s, l) => s + Number(l.input_tokens || 0), 0),
        output: claude.reduce((s, l) => s + Number(l.output_tokens || 0), 0),
        cost: claude.reduce((s, l) => s + Number(l.cost_usd || 0), 0),
      },
      gemini: {
        requests: gemini.length,
        hero: gemini.filter((l) => l.operation === 'hero_image').length,
        section: gemini.filter((l) => l.operation === 'section_break_image').length,
        cost: gemini.reduce((s, l) => s + Number(l.cost_usd || 0), 0),
      },
      replicate: {
        requests: replicate.length,
        hero: replicate.filter((l) => l.operation === 'hero_image').length,
        section: replicate.filter((l) => l.operation === 'section_break_image').length,
        wordpress: wordpressImages.length,
        cost: replicate.reduce((s, l) => s + Number(l.cost_usd || 0), 0),
        successRate: replicateSuccessRate,
      },
      generatedArticleCount,
    }
  }, [logs, generationCount, scheduleDestById])

  const rawFiltered = useMemo(
    () =>
      logs.filter((l) => {
        if (rawProvider !== 'all' && l.provider !== rawProvider) return false
        if (rawSuccess === 'success' && !l.success) return false
        if (rawSuccess === 'failed' && l.success) return false
        if (rawOperation !== 'all' && l.operation !== rawOperation) return false
        if (rawStartDate && l.created_at.slice(0, 10) < rawStartDate) return false
        if (rawEndDate && l.created_at.slice(0, 10) > rawEndDate) return false
        return true
      }),
    [logs, rawProvider, rawSuccess, rawOperation, rawStartDate, rawEndDate],
  )

  function exportRawCsv() {
    const headers = [
      'id',
      'article_id',
      'schedule_id',
      'provider',
      'model',
      'operation',
      'input_tokens',
      'output_tokens',
      'total_tokens',
      'cost_usd',
      'duration_ms',
      'success',
      'error_text',
      'created_at',
    ]
    const rows = rawFiltered.map((l) => [
      l.id,
      l.article_id ?? '',
      l.schedule_id ?? '',
      l.provider,
      l.model,
      l.operation,
      String(l.input_tokens ?? 0),
      String(l.output_tokens ?? 0),
      String(l.total_tokens ?? 0),
      String(Number(l.cost_usd || 0)),
      String(l.duration_ms ?? 0),
      String(l.success),
      l.error_text ?? '',
      l.created_at,
    ])
    downloadCSV(`api-usage-log-${today}.csv`, headers, rows)
  }

  if (loading) return <p className="font-inter text-foreground/50">Loading API usage analytics…</p>

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total Spent (All Time)"
          value={currency(totalCost)}
          sub={`Claude ${currency(claudeCost)} · Replicate ${currency(replicateCost)}${hasGeminiUsage ? ` · Gemini ${currency(geminiCost)}` : ''}`}
        />
        <StatCard
          title="Spent This Month"
          value={currency(monthCost)}
          sub={`${monthLabel(now)} · ${monthTrendPct >= 0 ? '↑' : '↓'} ${Math.abs(monthTrendPct).toFixed(1)}% vs last month`}
        />
        <StatCard
          title="Cost Per Article (Avg)"
          value={currency(avgCostPerArticle)}
          sub={`Claude ${currency(avgClaudePerArticle)} + Replicate ${currency(avgReplicatePerArticle)} = ${currency(avgClaudePerArticle + avgReplicatePerArticle)}${hasGeminiUsage ? ` (+ Gemini ${currency(avgGeminiPerArticle)})` : ''}`}
        />
        <StatCard
          title="Total Articles Generated"
          value={`${costByArticle.length} articles`}
          sub={`${monthArticles} this month · ${todayArticles} today`}
        />
      </div>

      <section className="rounded-xl p-5 glass border border-white/10">
        <h3 className="font-cinzel text-sm text-gold mb-4">Daily Cost (Last 30 Days)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={dailyChart}>
            <XAxis dataKey="date" tick={{ fill: 'rgba(240,237,248,0.4)', fontSize: 10 }} />
            <YAxis tick={{ fill: 'rgba(240,237,248,0.4)', fontSize: 10 }} />
            <Tooltip {...CHART_TOOLTIP} />
            <Line type="monotone" dataKey="claude" name="Claude" stroke="#7B4FD4" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="replicate" name="Replicate" stroke="#F59E0B" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="total" name="Total" stroke="#F0EDF8" strokeWidth={2} dot={false} strokeDasharray="4 4" />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="rounded-xl p-5 glass border border-white/10">
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            ['article', 'By Article'],
            ['day', 'By Day'],
            ['provider', 'By Provider'],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k as 'article' | 'day' | 'provider')}
              className={`px-3 py-1.5 rounded-lg text-xs border ${
                tab === k ? 'border-gold/40 text-gold bg-gold/10' : 'border-white/10 text-white/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'article' && (
          <TableWrap>
            <table className="w-full text-sm font-inter">
              <thead className="text-left text-foreground/45 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3">Article</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Claude Tokens</th>
                  <th className="px-4 py-3">Claude Cost</th>
                  <th className="px-4 py-3">Replicate Images</th>
                  <th className="px-4 py-3">Replicate Cost</th>
                  <th className="px-4 py-3">Total Cost</th>
                  <th className="px-4 py-3">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {costByArticle.slice(0, 50).map((r) => {
                  const article = r.article_id ? articleById[r.article_id] : undefined
                  return (
                    <tr key={r.key}>
                      <td className="px-4 py-3 text-white/80">{article?.title ?? r.article_id ?? r.key.slice(0, 8)}</td>
                      <td className="px-4 py-3 text-white/50">{r.created_at.slice(0, 10)}</td>
                      <td className="px-4 py-3 text-white/60">{r.claudeTokens.toLocaleString()}</td>
                      <td className="px-4 py-3 text-white/60">{currency(r.claudeCost)}</td>
                      <td className="px-4 py-3 text-white/60">{r.replicateImages}</td>
                      <td className="px-4 py-3 text-white/60">{currency(r.replicateCost)}</td>
                      <td className="px-4 py-3 text-gold">{currency(r.totalCost)}</td>
                      <td className="px-4 py-3">
                        {article?.slug ? (
                          <Link href={`/guides/${article.slug}`} target="_blank" className="text-gold text-xs hover:underline">
                            Open
                          </Link>
                        ) : (
                          <span className="text-white/30 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
        )}

        {tab === 'day' && (
          <TableWrap>
            <table className="w-full text-sm font-inter">
              <thead className="text-left text-foreground/45 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Articles Generated</th>
                  <th className="px-4 py-3">Claude Tokens</th>
                  <th className="px-4 py-3">Claude Cost</th>
                  <th className="px-4 py-3">Replicate Cost</th>
                  <th className="px-4 py-3">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {byDayRows.map((r) => (
                  <tr key={r.date}>
                    <td className="px-4 py-3 text-white/70">{r.date}</td>
                    <td className="px-4 py-3 text-white/60">{r.articles.size}</td>
                    <td className="px-4 py-3 text-white/60">{r.claudeTokens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-white/60">{currency(r.claudeCost)}</td>
                    <td className="px-4 py-3 text-white/60">{currency(r.replicateCost)}</td>
                    <td className="px-4 py-3 text-gold">{currency(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}

        {tab === 'provider' && (
          <TableWrap>
            <table className="w-full text-sm font-inter">
              <thead className="text-left text-foreground/45 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Usage</th>
                  <th className="px-4 py-3">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                <tr>
                  <td className="px-4 py-3 text-white/80">Claude</td>
                  <td className="px-4 py-3 text-white/60">
                    Requests: {providerSummary.claude.requests} · Input: {providerSummary.claude.input.toLocaleString()} ·
                    Output: {providerSummary.claude.output.toLocaleString()} · Avg/article:{' '}
                    {Math.round((providerSummary.claude.input + providerSummary.claude.output) / providerSummary.generatedArticleCount).toLocaleString()} tokens
                  </td>
                  <td className="px-4 py-3 text-gold">{currency(providerSummary.claude.cost)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-white/80">Replicate</td>
                  <td className="px-4 py-3 text-white/60">
                    Total images: {providerSummary.replicate.requests} · Hero: {providerSummary.replicate.hero} ·
                    Section: {providerSummary.replicate.section} · WordPress: {providerSummary.replicate.wordpress} ·
                    Avg cost/image: {currency(API_COSTS.replicate['flux-schnell'].cost_per_image)} · Success rate:{' '}
                    {providerSummary.replicate.successRate.toFixed(0)}%
                  </td>
                  <td className="px-4 py-3 text-gold">{currency(providerSummary.replicate.cost)}</td>
                </tr>
                {hasGeminiUsage && (
                  <tr>
                    <td className="px-4 py-3 text-white/80">Gemini</td>
                    <td className="px-4 py-3 text-white/60">
                      Total images: {providerSummary.gemini.requests} · Hero: {providerSummary.gemini.hero} · Section:{' '}
                      {providerSummary.gemini.section}
                    </td>
                    <td className="px-4 py-3 text-gold">{currency(providerSummary.gemini.cost)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>

      <section className="rounded-xl p-5 glass border border-white/10">
        <h3 className="font-cinzel text-sm text-gold mb-3">Projections</h3>
        <p className="text-sm text-white/70 mb-2">At your current pace (based on {generationCount} generation(s) logged):</p>
        <ul className="text-sm text-white/60 space-y-1">
          <li>Claude API: {currency(monthClaudeCost)}/month (this month)</li>
          <li>Replicate images: {currency(monthReplicateCost)}/month (this month)</li>
          <li>Total: {currency(monthClaudeCost + monthReplicateCost)}/month</li>
        </ul>
        <p className="text-sm text-white/70 mt-4 mb-2">To publish 1,560 articles (full Sibyl coverage):</p>
        <ul className="text-sm text-white/60 space-y-1">
          <li>Claude cost: {currency(1560 * avgClaudePerArticle)} (est.)</li>
          <li>Replicate cost: {currency(calculateReplicateImageCost('flux-schnell', 1560 * 2))} (2 images × 1,560 × $0.003)</li>
          <li>Total estimated: {currency(1560 * avgClaudePerArticle + calculateReplicateImageCost('flux-schnell', 1560 * 2))}</li>
        </ul>
      </section>

      <section className="rounded-xl p-5 glass border border-white/10">
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="font-cinzel text-sm text-gold hover:opacity-80"
        >
          View Raw Logs {showRaw ? '▴' : '▾'}
        </button>
        {showRaw && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2 items-end">
              <Select label="Provider" value={rawProvider} onChange={(v) => setRawProvider(v as any)}>
                <option value="all">All</option>
                <option value="claude">Claude</option>
                <option value="replicate">Replicate</option>
                <option value="gemini">Gemini</option>
              </Select>
              <Select label="Operation" value={rawOperation} onChange={setRawOperation}>
                {operationOptions.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </Select>
              <Select label="Success" value={rawSuccess} onChange={(v) => setRawSuccess(v as any)}>
                <option value="all">All</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </Select>
              <InputDate label="From" value={rawStartDate} onChange={setRawStartDate} />
              <InputDate label="To" value={rawEndDate} onChange={setRawEndDate} />
              <button
                type="button"
                onClick={exportRawCsv}
                className="px-3 py-2 rounded-lg border border-gold/40 text-gold text-xs hover:bg-gold/10"
              >
                Export CSV
              </button>
            </div>
            <TableWrap>
              <table className="w-full text-xs font-mono">
                <thead className="text-left text-foreground/45 border-b border-white/10">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Provider</th>
                    <th className="px-3 py-2">Op</th>
                    <th className="px-3 py-2">Tokens</th>
                    <th className="px-3 py-2">Cost</th>
                    <th className="px-3 py-2">Duration</th>
                    <th className="px-3 py-2">Success</th>
                    <th className="px-3 py-2">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8">
                  {rawFiltered.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2 text-white/60">{new Date(l.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2 text-white/70">{l.provider}</td>
                      <td className="px-3 py-2 text-white/70">{l.operation}</td>
                      <td className="px-3 py-2 text-white/60">{l.total_tokens}</td>
                      <td className="px-3 py-2 text-white/70">{currency(Number(l.cost_usd || 0))}</td>
                      <td className="px-3 py-2 text-white/60">{l.duration_ms}ms</td>
                      <td className="px-3 py-2 text-white/60">{l.success ? 'yes' : 'no'}</td>
                      <td className="px-3 py-2 text-red-300/80">{l.error_text ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl p-4 glass border border-white/10">
      <p className="text-xs text-white/40">{title}</p>
      <p className="mt-1 text-xl text-white font-semibold">{value}</p>
      <p className="mt-1 text-xs text-white/50">{sub}</p>
    </div>
  )
}

function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto border border-white/10 rounded-lg">{children}</div>
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  children: ReactNode
}) {
  return (
    <label className="text-xs text-white/50">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block mt-1 rounded-lg px-3 py-2 bg-white/5 border border-white/10 text-white text-xs"
      >
        {children}
      </select>
    </label>
  )
}

function InputDate({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-xs text-white/50">
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block mt-1 rounded-lg px-3 py-2 bg-white/5 border border-white/10 text-white text-xs"
      />
    </label>
  )
}

