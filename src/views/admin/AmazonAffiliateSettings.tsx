'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import {
  AMAZON_CONFIG_KEYS,
  DEFAULT_AMAZON_AFFILIATE_CONFIG,
  type AmazonAffiliateConfig,
} from '@/types/amazonAffiliate'
import {
  buildAmazonAffiliateConfigFromRows,
  configToUpsertRows,
  draftFromConfig,
  isPaapiConfigured,
  type AmazonAffiliateDraft,
} from '@/utils/amazonAffiliateConfig'

const inputClass =
  'w-full rounded-lg px-3 py-2 text-sm font-inter bg-white/5 border border-white/10 text-foreground placeholder:text-foreground/30'
const labelClass = 'block font-inter text-xs text-gold/80 mb-1.5'
const hintClass = 'font-inter text-xs text-foreground/45 mt-1'

export default function AmazonAffiliateSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [stored, setStored] = useState<AmazonAffiliateConfig | null>(null)
  const [draft, setDraft] = useState<AmazonAffiliateDraft>(() => ({
    ...DEFAULT_AMAZON_AFFILIATE_CONFIG,
    paapiAccessKeyInput: '',
    paapiSecretKeyInput: '',
  }))
  const [showAccessKey, setShowAccessKey] = useState(false)
  const [showSecretKey, setShowSecretKey] = useState(false)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('ai_config')
        .select('key, value')
        .in('key', [...AMAZON_CONFIG_KEYS])

      if (error) {
        toast.error(error.message)
        setLoading(false)
        return
      }

      const config = buildAmazonAffiliateConfigFromRows(data ?? [])
      setStored(config)
      setDraft(draftFromConfig(config))
      setLoading(false)
    }
    load()
  }, [])

  function setField<K extends keyof AmazonAffiliateDraft>(key: K, value: AmazonAffiliateDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  async function saveSettings() {
    if (!stored) return

    if (!draft.associateTag.trim()) {
      toast.error('Associate tag is required (e.g. outdoordeals-20)')
      return
    }

    setSaving(true)
    const rows = configToUpsertRows(draft, stored)
    const now = new Date().toISOString()

    const { error } = await supabase.from('ai_config').upsert(
      rows.map((row) => ({ ...row, updated_at: now })),
      { onConflict: 'key' },
    )

    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }

    const { data } = await supabase
      .from('ai_config')
      .select('key, value')
      .in('key', [...AMAZON_CONFIG_KEYS])

    const next = buildAmazonAffiliateConfigFromRows(data ?? [])
    setStored(next)
    setDraft({
      ...draftFromConfig(next),
      associateTag: draft.associateTag.trim(),
      marketplace: draft.marketplace.trim(),
      siteName: draft.siteName.trim(),
      siteUrl: draft.siteUrl.trim(),
      accentColor: draft.accentColor.trim(),
      authorName: draft.authorName.trim(),
      authorInitials: draft.authorInitials.trim(),
      disclosureText: draft.disclosureText.trim(),
      paapiAccessKeyInput: '',
      paapiSecretKeyInput: '',
    })
    toast.success('Amazon affiliate settings saved')
  }

  async function clearSecret(key: 'amazon_paapi_access_key' | 'amazon_paapi_secret_key') {
    const label = key === 'amazon_paapi_access_key' ? 'access key' : 'secret key'
    if (!confirm(`Remove the stored PA-API ${label}?`)) return

    const { error } = await supabase.from('ai_config').delete().eq('key', key)
    if (error) {
      toast.error(error.message)
      return
    }

    const { data } = await supabase
      .from('ai_config')
      .select('key, value')
      .in('key', [...AMAZON_CONFIG_KEYS])

    const next = buildAmazonAffiliateConfigFromRows(data ?? [])
    setStored(next)
    setDraft((prev) => ({
      ...prev,
      paapiAccessKeyInput: '',
      paapiSecretKeyInput: '',
    }))
    toast.success(`PA-API ${label} removed`)
  }

  if (loading) {
    return <p className="font-inter text-sm text-foreground/50">Loading affiliate settings…</p>
  }

  const paapiReady = stored ? isPaapiConfigured(stored) : false
  const manualMode = stored && !paapiReady && Boolean(stored.associateTag)

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="rounded-xl p-6 glass border border-gold/30 space-y-3">
        <h2 className="font-cinzel text-sm text-gold">Status</h2>
        <ul className="font-inter text-sm space-y-2 text-foreground/70">
          <li>
            Associate tag:{' '}
            {draft.associateTag.trim() ? (
              <code className="text-gold">{draft.associateTag.trim()}</code>
            ) : (
              <span className="text-amber-400/90">Not set — required for affiliate links</span>
            )}
          </li>
          <li>
            PA-API:{' '}
            {paapiReady ? (
              <span className="text-green-400">Configured — product images &amp; prices can auto-fetch</span>
            ) : manualMode ? (
              <span className="text-amber-400/90">
                Manual mode — add PA-API keys below or paste product data in articles
              </span>
            ) : (
              <span className="text-foreground/45">Waiting for associate tag</span>
            )}
          </li>
        </ul>
      </div>

      <section className="rounded-xl p-6 glass border border-white/10 space-y-5">
        <div>
          <h2 className="font-cinzel text-sm text-gold">Amazon Associates</h2>
          <p className={hintClass}>
            Your tracking ID from Associates Central → Account Settings → Tracking IDs.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Associate tag *</label>
            <input
              className={inputClass}
              value={draft.associateTag}
              onChange={(e) => setField('associateTag', e.target.value)}
              placeholder="outdoordeals-20"
              autoComplete="off"
            />
            <p className={hintClass}>Format: yoursite-20</p>
          </div>
          <div>
            <label className={labelClass}>Marketplace</label>
            <input
              className={inputClass}
              value={draft.marketplace}
              onChange={(e) => setField('marketplace', e.target.value)}
              placeholder="www.amazon.com"
              autoComplete="off"
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl p-6 glass border border-white/10 space-y-5">
        <div>
          <h2 className="font-cinzel text-sm text-gold">Product Advertising API (PA-API)</h2>
          <p className={`${hintClass} leading-relaxed`}>
            Optional. Requires 3 qualifying sales in 180 days. Without these, the pipeline uses manual
            product data (SiteStripe images &amp; prices). Keys are stored server-side and never shown
            again after saving.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Access key</label>
            <p className="font-inter text-xs text-foreground/45 mb-2">
              Status:{' '}
              {stored?.hasPaapiAccessKey ? (
                <span className="text-green-400">Saved ✓</span>
              ) : (
                <span className="text-amber-400/90">Not saved</span>
              )}
            </p>
            <input
              type={showAccessKey ? 'text' : 'password'}
              className={inputClass}
              value={draft.paapiAccessKeyInput}
              onChange={(e) => setField('paapiAccessKeyInput', e.target.value)}
              placeholder={stored?.hasPaapiAccessKey ? 'Enter new key to replace…' : 'AKIA…'}
              autoComplete="off"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                onClick={() => setShowAccessKey(!showAccessKey)}
                className="font-inter text-xs px-3 py-1.5 rounded-lg border border-white/15 text-foreground/60"
              >
                {showAccessKey ? 'Hide' : 'Show'}
              </button>
              {stored?.hasPaapiAccessKey && (
                <button
                  type="button"
                  onClick={() => clearSecret('amazon_paapi_access_key')}
                  className="font-inter text-xs px-3 py-1.5 rounded-lg border border-red-400/40 text-red-300/90"
                >
                  Remove access key
                </button>
              )}
            </div>
          </div>

          <div>
            <label className={labelClass}>Secret key</label>
            <p className="font-inter text-xs text-foreground/45 mb-2">
              Status:{' '}
              {stored?.hasPaapiSecretKey ? (
                <span className="text-green-400">Saved ✓</span>
              ) : (
                <span className="text-amber-400/90">Not saved</span>
              )}
            </p>
            <input
              type={showSecretKey ? 'text' : 'password'}
              className={inputClass}
              value={draft.paapiSecretKeyInput}
              onChange={(e) => setField('paapiSecretKeyInput', e.target.value)}
              placeholder={stored?.hasPaapiSecretKey ? 'Enter new key to replace…' : 'Secret key'}
              autoComplete="off"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                onClick={() => setShowSecretKey(!showSecretKey)}
                className="font-inter text-xs px-3 py-1.5 rounded-lg border border-white/15 text-foreground/60"
              >
                {showSecretKey ? 'Hide' : 'Show'}
              </button>
              {stored?.hasPaapiSecretKey && (
                <button
                  type="button"
                  onClick={() => clearSecret('amazon_paapi_secret_key')}
                  className="font-inter text-xs px-3 py-1.5 rounded-lg border border-red-400/40 text-red-300/90"
                >
                  Remove secret key
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl p-6 glass border border-white/10 space-y-5">
        <div>
          <h2 className="font-cinzel text-sm text-gold">Site &amp; article branding</h2>
          <p className={hintClass}>
            Used in guide templates and the affiliate pipeline. Change accent color per niche site.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Site name</label>
            <input
              className={inputClass}
              value={draft.siteName}
              onChange={(e) => setField('siteName', e.target.value)}
              placeholder="Outdoor Deals"
            />
          </div>
          <div>
            <label className={labelClass}>Site URL</label>
            <input
              className={inputClass}
              value={draft.siteUrl}
              onChange={(e) => setField('siteUrl', e.target.value)}
              placeholder="https://outdoordeals.com"
            />
          </div>
          <div>
            <label className={labelClass}>Accent color</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={draft.accentColor.startsWith('#') ? draft.accentColor : '#2D4A2B'}
                onChange={(e) => setField('accentColor', e.target.value.toUpperCase())}
                className="h-10 w-12 rounded border border-white/10 bg-transparent cursor-pointer"
              />
              <input
                className={inputClass}
                value={draft.accentColor}
                onChange={(e) => setField('accentColor', e.target.value)}
                placeholder="#2D4A2B"
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Default author name</label>
            <input
              className={inputClass}
              value={draft.authorName}
              onChange={(e) => setField('authorName', e.target.value)}
              placeholder="Outdoor Deals Team"
            />
          </div>
          <div>
            <label className={labelClass}>Author initials</label>
            <input
              className={inputClass}
              value={draft.authorInitials}
              onChange={(e) => setField('authorInitials', e.target.value)}
              placeholder="OD"
              maxLength={3}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Affiliate disclosure (article body)</label>
          <textarea
            className={`${inputClass} min-h-[80px] resize-y`}
            value={draft.disclosureText}
            onChange={(e) => setField('disclosureText', e.target.value)}
            rows={3}
          />
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={saveSettings}
          disabled={saving}
          className="font-inter text-sm px-5 py-2.5 rounded-lg border border-gold/40 text-gold hover:bg-gold/10 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save affiliate settings'}
        </button>
      </div>
    </div>
  )
}
