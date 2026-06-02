'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import StatCard from '../../components/admin/StatCard'

const CONFIG_KEY = 'anthropic_api_key'

export default function System() {
  const [health, setHealth] = useState<'ok' | 'error' | 'checking'>('checking')
  const [readingsCount, setReadingsCount] = useState(0)
  const [clearing, setClearing] = useState(false)

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [hasStoredKey, setHasStoredKey] = useState(false)
  const [savingKey, setSavingKey] = useState(false)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    async function check() {
      const [profileRes, readingsRes, configRes] = await Promise.all([
        supabase.from('profiles').select('id').limit(1),
        supabase.from('readings').select('id', { count: 'exact', head: true }),
        supabase
          .from('app_config')
          .select('value')
          .eq('key', CONFIG_KEY)
          .maybeSingle(),
      ])
      setHealth(profileRes.error ? 'error' : 'ok')
      setReadingsCount(readingsRes.count ?? 0)
      const stored = !!(configRes.data?.value as { apiKey?: string } | null)?.apiKey
      setHasStoredKey(stored)
    }
    check()
  }, [])

  async function testConnection() {
    const { error } = await supabase.from('profiles').select('id').limit(1)
    if (error) toast.error(`Connection failed: ${error.message}`)
    else toast.success('Supabase connection OK')
  }

  async function saveAnthropicKey() {
    const trimmed = apiKeyInput.trim()
    if (!trimmed.startsWith('sk-')) {
      toast.error('Enter a valid Anthropic key (starts with sk-ant- or sk-)')
      return
    }
    setSavingKey(true)
    const { error } = await supabase.from('app_config').upsert({
      key: CONFIG_KEY,
      value: { apiKey: trimmed },
      updated_at: new Date().toISOString(),
    })
    setSavingKey(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setHasStoredKey(true)
    setApiKeyInput('')
    toast.success(
      'API key saved. Add SUPABASE_SERVICE_ROLE_KEY on Vercel to use this copy, or set the same key as ANTHROPIC_API_KEY.',
    )
  }

  async function clearAnthropicKey() {
    if (!confirm('Remove the stored Anthropic API key?')) return
    const { error } = await supabase.from('app_config').delete().eq('key', CONFIG_KEY)
    if (error) toast.error(error.message)
    else {
      setHasStoredKey(false)
      toast.success('API key removed from database')
    }
  }

  async function clearOldUsage() {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    const dateStr = cutoff.toISOString().slice(0, 10)
    if (!confirm(`Delete daily_usage rows before ${dateStr}?`)) return
    setClearing(true)
    const { error } = await supabase.from('daily_usage').delete().lt('date', dateStr)
    setClearing(false)
    if (error) toast.error(error.message)
    else toast.success('Old usage records cleared')
  }

  const apiEstimate = Math.round(readingsCount * 2.5)

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={health === 'ok' ? '✅' : health === 'error' ? '❌' : '⏳'}
          label="Database Health"
          value={health === 'ok' ? 'Healthy' : health === 'error' ? 'Error' : 'Checking…'}
        />
        <StatCard icon="📖" label="Total Readings" value={readingsCount} />
        <StatCard icon="🤖" label="Est. API Calls" value={apiEstimate} />
      </div>

      <div className="rounded-xl p-6 glass border border-gold/30 space-y-4">
        <h2 className="font-cinzel text-sm text-gold">Claude API (readings)</h2>
        <p className="font-inter text-sm text-foreground/60 leading-relaxed">
          Save your Anthropic key here (server-only, never sent to browsers). On Vercel, use{' '}
          <strong className="text-foreground/80">one</strong> of these setups, then redeploy:
        </p>
        <ul className="font-inter text-xs text-foreground/50 list-disc pl-5 space-y-1">
          <li>
            <code className="text-gold">ANTHROPIC_API_KEY</code> only — easiest; copy the same
            sk-ant-… key here or in Vercel
          </li>
          <li>
            Or <code className="text-gold">SUPABASE_URL</code> +{' '}
            <code className="text-gold">SUPABASE_SERVICE_ROLE_KEY</code> — Vercel reads the key
            from this panel (no duplicate env key needed)
          </li>
          <li>
            If both are set, <code className="text-gold">ANTHROPIC_API_KEY</code> wins — keep them
            identical or use only one method
          </li>
        </ul>
        <p className="font-inter text-xs text-foreground/45">
          Status:{' '}
          {hasStoredKey ? (
            <span className="text-green-400">Key saved in database ✓</span>
          ) : (
            <span className="text-amber-400/90">No key in database yet</span>
          )}
        </p>
        <div className="flex flex-col gap-2 max-w-xl">
          <label className="font-inter text-xs text-gold/80">Anthropic API key</label>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={hasStoredKey ? 'Enter new key to replace…' : 'sk-ant-…'}
            className="rounded-lg px-3 py-2 text-sm font-inter bg-white/5 border border-white/10 text-foreground"
            autoComplete="off"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="font-inter text-xs px-3 py-2 rounded-lg border border-white/15 text-foreground/60"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
            <button
              type="button"
              onClick={saveAnthropicKey}
              disabled={savingKey || !apiKeyInput.trim()}
              className="font-inter text-sm px-4 py-2 rounded-lg border border-gold/40 text-gold hover:bg-gold/10 disabled:opacity-50"
            >
              {savingKey ? 'Saving…' : 'Save API key'}
            </button>
            {hasStoredKey && (
              <button
                type="button"
                onClick={clearAnthropicKey}
                className="font-inter text-sm px-4 py-2 rounded-lg border border-red-400/40 text-red-300/90 hover:bg-red-400/10"
              >
                Remove key
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl p-6 glass border border-white/10 space-y-4">
        <h2 className="font-cinzel text-sm text-gold">Maintenance</h2>
        <p className="font-inter text-sm text-foreground/50">
          Health check queries <code className="text-gold">profiles</code> (limit 1). API usage is estimated at ~2.5 calls per reading.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={testConnection}
            className="font-inter text-sm px-4 py-2 rounded-lg border border-gold/40 text-gold hover:bg-gold/10"
          >
            Test Connection
          </button>
          <button
            type="button"
            onClick={clearOldUsage}
            disabled={clearing}
            className="font-inter text-sm px-4 py-2 rounded-lg border border-white/15 text-foreground/60 hover:border-red-400/50 hover:text-red-300 disabled:opacity-50"
          >
            {clearing ? 'Clearing…' : 'Clear Old daily_usage (90d+)'}
          </button>
        </div>
      </div>
    </div>
  )
}
