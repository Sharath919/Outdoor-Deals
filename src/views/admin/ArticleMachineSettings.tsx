'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import {
  ARTICLE_MACHINE_PROMPT_TABS,
  countTemplatesUsingDefault,
  estimatePromptTokens,
} from '@/config/articleMachinePrompts'

type AiConfigRow = { key: string; value: any; updated_at: string | null }

function tomorrowAt1amLocal(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(1, 0, 0, 0)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

async function getToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token || ''
}

export default function ArticleMachineSettings() {
  const [loading, setLoading] = useState(true)
  const [savingToggle, setSavingToggle] = useState(false)
  const [automationEnabled, setAutomationEnabled] = useState(true)
  const [lastRun, setLastRun] = useState<string | null>(null)
  const [processedToday, setProcessedToday] = useState<number | null>(null)
  const [processedMonth, setProcessedMonth] = useState<number | null>(null)

  const [activePromptTab, setActivePromptTab] = useState(ARTICLE_MACHINE_PROMPT_TABS[0].id)
  const [prompts, setPrompts] = useState<Record<string, string>>({})
  const [promptUpdatedAt, setPromptUpdatedAt] = useState<Record<string, string | null>>({})
  const [savingPromptKey, setSavingPromptKey] = useState<string | null>(null)
  const [testingPrompt, setTestingPrompt] = useState(false)
  const [testOutput, setTestOutput] = useState<string | null>(null)

  const [claudeConfigured, setClaudeConfigured] = useState<boolean | null>(null)
  const [replicateConfigured, setReplicateConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    async function load() {
      const promptKeys = [
        ...ARTICLE_MACHINE_PROMPT_TABS.map((t) => t.configKey),
        'article_machine_prompt',
      ]
      const { data, error } = await supabase
        .from('ai_config')
        .select('key, value, updated_at')
        .in('key', ['automation_enabled', 'last_cron_run', ...promptKeys])
      if (error) {
        toast.error(error.message)
        setLoading(false)
        return
      }

      const loadedPrompts: Record<string, string> = {}
      const loadedPromptUpdatedAt: Record<string, string | null> = {}
      let legacyPrompt = ''

      for (const row of (data ?? []) as AiConfigRow[]) {
        if (row.key === 'automation_enabled') {
          const v = String(row.value ?? 'true').trim().toLowerCase()
          setAutomationEnabled(v !== 'false')
        }
        if (row.key === 'last_cron_run') setLastRun(typeof row.value === 'string' ? row.value : JSON.stringify(row.value))
        if (row.key === 'article_machine_prompt') {
          legacyPrompt = typeof row.value === 'string' ? row.value : JSON.stringify(row.value ?? '', null, 2)
        }
        if (ARTICLE_MACHINE_PROMPT_TABS.some((t) => t.configKey === row.key)) {
          loadedPrompts[row.key] =
            typeof row.value === 'string' ? row.value : JSON.stringify(row.value ?? '', null, 2)
          loadedPromptUpdatedAt[row.key] = row.updated_at
        }
      }

      if (!loadedPrompts.article_machine_prompt_default?.trim() && legacyPrompt.trim()) {
        loadedPrompts.article_machine_prompt_default = legacyPrompt
      }

      setPrompts(loadedPrompts)
      setPromptUpdatedAt(loadedPromptUpdatedAt)

      // API status
      const [aiRes, gemRes] = await Promise.all([
        fetch('/api/ai-reading', { method: 'GET' }).then((r) => r.json().catch(() => ({}))),
        fetch('/api/gemini-health', { method: 'GET' }).then((r) => r.json().catch(() => ({}))),
      ])
      setClaudeConfigured(Boolean((aiRes as any).configured))
      setReplicateConfigured(Boolean((gemRes as any).configured && (gemRes as any).reachable))

      // Publishing stats
      try {
        const now = new Date()
        const startToday = new Date(now)
        startToday.setHours(0, 0, 0, 0)
        const startTomorrow = new Date(startToday)
        startTomorrow.setDate(startTomorrow.getDate() + 1)

        const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const startNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

        const [todayRes, monthRes] = await Promise.all([
          supabase
            .from('publishing_schedule')
            .select('id', { count: 'exact', head: true })
            .gte('updated_at', startToday.toISOString())
            .lt('updated_at', startTomorrow.toISOString()),
          supabase
            .from('publishing_schedule')
            .select('id', { count: 'exact', head: true })
            .gte('updated_at', startMonth.toISOString())
            .lt('updated_at', startNextMonth.toISOString()),
        ])
        setProcessedToday(todayRes.count ?? 0)
        setProcessedMonth(monthRes.count ?? 0)
      } catch {
        setProcessedToday(null)
        setProcessedMonth(null)
      }

      setLoading(false)
    }
    load()
  }, [])

  const activeTab = ARTICLE_MACHINE_PROMPT_TABS.find((t) => t.id === activePromptTab) ?? ARTICLE_MACHINE_PROMPT_TABS[0]
  const activePromptText = prompts[activeTab.configKey] ?? ''
  const activeCharCount = activePromptText.length
  const activeTokenEstimate = estimatePromptTokens(activePromptText)
  const templatesUsingDefault = countTemplatesUsingDefault(prompts)
  const isDefaultTab = activeTab.templateType === null
  const promptHasContent = Boolean(activePromptText.trim())

  function updateActivePrompt(value: string) {
    setPrompts((prev) => ({ ...prev, [activeTab.configKey]: value }))
  }

  async function saveActivePrompt() {
    setSavingPromptKey(activeTab.configKey)
    const { error } = await supabase.from('ai_config').upsert({
      key: activeTab.configKey,
      value: activePromptText,
      updated_at: new Date().toISOString(),
    })
    setSavingPromptKey(null)
    if (error) toast.error(error.message)
    else {
      const savedAt = new Date().toISOString()
      setPromptUpdatedAt((prev) => ({ ...prev, [activeTab.configKey]: savedAt }))
      toast.success(`${activeTab.saveLabel} prompt saved`)
    }
  }

  async function saveToggle(next: boolean) {
    setSavingToggle(true)
    const { error } = await supabase.from('ai_config').upsert({
      key: 'automation_enabled',
      value: next ? 'true' : 'false',
      updated_at: new Date().toISOString(),
    })
    setSavingToggle(false)
    if (error) toast.error(error.message)
    else {
      setAutomationEnabled(next)
      toast.success(next ? 'Automation enabled' : 'Automation paused')
    }
  }

  async function testPrompt() {
    setTestingPrompt(true)
    setTestOutput(null)
    try {
      const token = await getToken()
      const res = await fetch('/api/test-article-machine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          topic: 'best camping tents under $200',
          template_type: activeTab.testTemplateType,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; output?: string }
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`)
      setTestOutput(data.output || '')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setTestingPrompt(false)
    }
  }

  if (loading) return <p className="font-inter text-foreground/50">Loading settings…</p>

  return (
    <div className="space-y-8">
      <section className="rounded-xl p-6 glass border border-white/10 space-y-4">
        <h2 className="font-cinzel text-sm text-gold">Automation Status</h2>

        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`px-2.5 py-1 rounded-md text-xs border ${
                automationEnabled
                  ? 'border-green-400/40 text-green-300 bg-green-400/10'
                  : 'border-red-400/40 text-red-300 bg-red-400/10'
              }`}
            >
              {automationEnabled ? 'Automation Active' : 'Automation Paused'}
            </span>
            <p className="font-inter text-sm text-foreground/60">
              Last run: <span className="text-foreground/80">{lastRun ? new Date(lastRun).toLocaleString() : '—'}</span>
            </p>
          </div>

          <button
            type="button"
            disabled={savingToggle}
            onClick={() => void saveToggle(!automationEnabled)}
            className={`font-cinzel px-5 py-2.5 rounded-lg border ${
              automationEnabled
                ? 'border-red-400/40 text-red-300 hover:bg-red-400/10'
                : 'border-green-400/40 text-green-300 hover:bg-green-400/10'
            } disabled:opacity-50`}
          >
            {savingToggle ? 'Saving…' : automationEnabled ? 'Pause' : 'Activate'}
          </button>
        </div>

        <div className="rounded-lg border border-white/10 p-4 text-sm font-inter text-foreground/60 space-y-1">
          <p>
            Nightly cron publishes scheduled articles automatically. Next scheduled run:{' '}
            <span className="text-foreground/80">{tomorrowAt1amLocal()}</span>.
          </p>
          <p className="text-xs text-foreground/50">
            Articles processed today:{' '}
            <span className="text-foreground/70">{processedToday == null ? '—' : processedToday}</span>
            {' · '}This month:{' '}
            <span className="text-foreground/70">{processedMonth == null ? '—' : processedMonth}</span>
          </p>
        </div>
      </section>

      <section className="rounded-xl p-6 glass border border-white/10 space-y-4">
        <h2 className="font-cinzel text-sm text-gold">Article Machine System Prompts</h2>
        <p className="font-inter text-xs text-foreground/55">
          Configure template-specific instructions for Claude. Empty templates fall back to the Default prompt.
        </p>

        <div className="flex flex-wrap gap-1 border-b border-white/10 pb-1">
          {ARTICLE_MACHINE_PROMPT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActivePromptTab(tab.id)}
              className={`font-inter text-xs px-3 py-2 rounded-t-lg border-b-2 transition-colors ${
                activePromptTab === tab.id
                  ? 'border-gold text-gold bg-gold/5'
                  : 'border-transparent text-foreground/50 hover:text-foreground/75'
              }`}
            >
              {tab.tabLabel}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <p className="font-inter text-sm text-foreground/80">{activeTab.label}</p>
            <div className="flex flex-wrap items-center gap-2">
              {isDefaultTab ? (
                <>
                  {promptHasContent ? (
                    <span className="px-2.5 py-1 rounded-md text-xs border border-green-400/40 text-green-300 bg-green-400/10">
                      Active
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-md text-xs border border-amber-400/40 text-amber-300 bg-amber-400/10">
                      Not Configured
                    </span>
                  )}
                  <span className="font-inter text-xs text-foreground/45">
                    Used by: {templatesUsingDefault} template{templatesUsingDefault === 1 ? '' : 's'}
                  </span>
                </>
              ) : promptHasContent ? (
                <span className="px-2.5 py-1 rounded-md text-xs border border-green-400/40 text-green-300 bg-green-400/10">
                  Active
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-md text-xs border border-amber-400/40 text-amber-300 bg-amber-400/10">
                  Using Default Prompt
                </span>
              )}
            </div>
          </div>

          <textarea
            value={activePromptText}
            onChange={(e) => updateActivePrompt(e.target.value)}
            className="w-full min-h-[400px] rounded-lg px-3 py-2 text-xs font-mono bg-white/5 border border-white/10 text-foreground"
            placeholder={
              isDefaultTab
                ? 'Paste your master system prompt here…'
                : `Optional override for ${activeTab.label}. Leave empty to use Default.`
            }
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-inter text-xs text-foreground/45">
              {activeCharCount.toLocaleString()} characters · ~{activeTokenEstimate.toLocaleString()} tokens
              {' · '}Last saved:{' '}
              {promptUpdatedAt[activeTab.configKey]
                ? new Date(promptUpdatedAt[activeTab.configKey]!).toLocaleString()
                : '—'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void testPrompt()}
                disabled={testingPrompt}
                className="font-inter text-sm px-4 py-2 rounded-lg border border-white/15 text-foreground/60 hover:border-gold/30 hover:text-foreground disabled:opacity-50"
              >
                {testingPrompt ? 'Testing…' : 'Test Prompt'}
              </button>
              <button
                type="button"
                onClick={() => void saveActivePrompt()}
                disabled={savingPromptKey === activeTab.configKey}
                className="font-cinzel text-sm px-5 py-2 rounded-lg bg-gold text-background disabled:opacity-50"
              >
                {savingPromptKey === activeTab.configKey ? 'Saving…' : `Save ${activeTab.saveLabel} Prompt`}
              </button>
            </div>
          </div>
        </div>

        {testOutput && (
          <div className="rounded-lg border border-white/10 p-4">
            <p className="font-inter text-xs text-foreground/50 mb-2">Test output (truncated):</p>
            <pre className="whitespace-pre-wrap font-mono text-xs text-foreground/80 max-h-[380px] overflow-auto">
              {testOutput.slice(0, 12000)}
            </pre>
          </div>
        )}
      </section>

      <section className="rounded-xl p-6 glass border border-white/10 space-y-3">
        <h2 className="font-cinzel text-sm text-gold">API Status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-white/10 p-4">
            <p className="font-inter text-sm text-foreground/70">
              Claude API:{' '}
              {claudeConfigured == null ? (
                <span className="text-white/40">Checking…</span>
              ) : claudeConfigured ? (
                <span className="text-green-300">Configured ✓</span>
              ) : (
                <span className="text-red-300">Not configured</span>
              )}
            </p>
            <button
              type="button"
              onClick={async () => {
                const d = await fetch('/api/ai-reading', { method: 'GET' }).then((r) => r.json().catch(() => ({})))
                setClaudeConfigured(Boolean((d as any).configured))
                toast.success('Claude status refreshed')
              }}
              className="mt-3 font-inter text-xs px-3 py-2 rounded-lg border border-white/15 text-foreground/60 hover:text-foreground"
            >
              Test connection
            </button>
          </div>
          <div className="rounded-lg border border-white/10 p-4">
            <p className="font-inter text-sm text-foreground/70">
              Replicate API:{' '}
              {replicateConfigured == null ? (
                <span className="text-white/40">Checking…</span>
              ) : replicateConfigured ? (
                <span className="text-green-300">Configured ✓</span>
              ) : (
                <span className="text-red-300">Not configured</span>
              )}
            </p>
            <button
              type="button"
              onClick={async () => {
                const d = await fetch('/api/gemini-health', { method: 'GET' }).then((r) => r.json().catch(() => ({})))
                setReplicateConfigured(Boolean((d as any).configured && (d as any).reachable))
                toast.success('Replicate status refreshed')
              }}
              className="mt-3 font-inter text-xs px-3 py-2 rounded-lg border border-white/15 text-foreground/60 hover:text-foreground"
            >
              Test connection
            </button>
          </div>
        </div>
        <p className="font-inter text-xs text-foreground/45">
          Supabase: Connected ✓ (if this page loads)
        </p>
      </section>
    </div>
  )
}

