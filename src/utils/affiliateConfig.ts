import { supabase } from '@/lib/supabase'
import {
  DEFAULT_AFFILIATE_CTA_CONFIG,
  type AffiliateCtaConfig,
  type AffiliateCtaDesign,
  type AffiliateCtaPlacement,
  type AffiliateCtaType,
  type CtaSlot1Type,
  type CtaSlot2Type,
} from '@/types/affiliateCta'

const CACHE_TTL_MS = 60 * 60 * 1000

let cache: { config: AffiliateCtaConfig; expiresAt: number } | null = null

function configValue(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  return String(raw)
}

function parseBool(raw: unknown, fallback: boolean): boolean {
  const v = configValue(raw).trim().toLowerCase()
  if (v === 'true') return true
  if (v === 'false') return false
  return fallback
}

function parseDesign(raw: unknown): AffiliateCtaDesign {
  const v = configValue(raw).trim().toUpperCase()
  if (v === 'B' || v === 'C') return v
  return 'A'
}

function parsePlacement(raw: unknown): AffiliateCtaPlacement {
  const v = configValue(raw).trim()
  if (v === 'before-faq' || v === 'after-combinations' || v === 'after-this-does-not-mean') {
    return v
  }
  return DEFAULT_AFFILIATE_CTA_CONFIG.placement
}

function parseType(raw: unknown): AffiliateCtaType {
  return configValue(raw).trim() === 'internal' ? 'internal' : 'external'
}

function parseSlot1(map: Record<string, unknown>): CtaSlot1Type {
  const v = configValue(
    map.affiliate_cta_slot1_type ?? map.cta_slot1_type,
  ).trim()
  if (v === 'limansa' || v === 'affiliate' || v === 'both' || v === 'disabled') return v
  return DEFAULT_AFFILIATE_CTA_CONFIG.slot1Type
}

function parseSlot2(map: Record<string, unknown>): CtaSlot2Type {
  const v = configValue(
    map.affiliate_cta_slot2_type ?? map.cta_slot2_type,
  ).trim()
  if (v === 'affiliate' || v === 'limansa' || v === 'disabled') return v
  return DEFAULT_AFFILIATE_CTA_CONFIG.slot2Type
}

function pick(map: Record<string, unknown>, key: string, fallback: string): string {
  const v = configValue(map[key]).trim()
  return v || fallback
}

export function buildAffiliateConfigFromRows(
  rows: { key: string; value: unknown }[],
): AffiliateCtaConfig {
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const d = DEFAULT_AFFILIATE_CTA_CONFIG

  const legacyHeadline = pick(map, 'affiliate_cta_headline', d.designA.headline)
  const legacyBody = pick(map, 'affiliate_cta_body', d.designA.body)
  const legacyButton = pick(map, 'affiliate_cta_button', d.designA.button)
  const legacyFooter = pick(map, 'affiliate_cta_footer', d.designA.footer)

  return {
    enabled: parseBool(map.affiliate_cta_enabled, d.enabled),
    design: parseDesign(map.affiliate_cta_design),
    type: parseType(map.affiliate_cta_type),
    affiliateName: pick(map, 'affiliate_name', d.affiliateName),
    affiliateUrl: pick(map, 'affiliate_url', d.affiliateUrl),
    articleSpecific: parseBool(map.affiliate_cta_article_specific, d.articleSpecific),
    placement: parsePlacement(map.affiliate_cta_placement),
    slot1Type: parseSlot1(map),
    slot2Type: parseSlot2(map),
    designA: {
      label: pick(map, 'affiliate_cta_a_label', d.designA.label),
      headline: pick(map, 'affiliate_cta_a_headline', legacyHeadline),
      body: pick(map, 'affiliate_cta_a_body', legacyBody),
      button: pick(map, 'affiliate_cta_a_button', legacyButton),
      footer: pick(map, 'affiliate_cta_a_footer', legacyFooter),
      stat1Value: pick(map, 'affiliate_cta_a_stat1_value', d.designA.stat1Value),
      stat1Label: pick(map, 'affiliate_cta_a_stat1_label', d.designA.stat1Label),
      stat2Value: pick(map, 'affiliate_cta_a_stat2_value', d.designA.stat2Value),
      stat2Label: pick(map, 'affiliate_cta_a_stat2_label', d.designA.stat2Label),
      stat3Value: pick(map, 'affiliate_cta_a_stat3_value', d.designA.stat3Value),
      stat3Label: pick(map, 'affiliate_cta_a_stat3_label', d.designA.stat3Label),
    },
    designB: {
      label: pick(map, 'affiliate_cta_b_label', d.designB.label),
      headline: pick(map, 'affiliate_cta_b_headline', d.designB.headline),
      body: pick(map, 'affiliate_cta_b_body', d.designB.body),
      q1: pick(map, 'affiliate_cta_b_q1', d.designB.q1),
      q2: pick(map, 'affiliate_cta_b_q2', d.designB.q2),
      q3: pick(map, 'affiliate_cta_b_q3', d.designB.q3),
      button: pick(map, 'affiliate_cta_b_button', d.designB.button),
      footer: pick(map, 'affiliate_cta_b_footer', d.designB.footer),
      trust: pick(map, 'affiliate_cta_b_trust', d.designB.trust),
    },
    designC: {
      headline: pick(map, 'affiliate_cta_c_headline', d.designC.headline),
      body: pick(map, 'affiliate_cta_c_body', d.designC.body),
      button: pick(map, 'affiliate_cta_c_button', d.designC.button),
    },
    internal: {
      headline: pick(map, 'affiliate_cta_internal_headline', d.internal.headline),
      body: pick(map, 'affiliate_cta_internal_body', d.internal.body),
      button: pick(map, 'affiliate_cta_internal_button', d.internal.button),
    },
  }
}

export async function fetchAffiliateConfig(force = false): Promise<AffiliateCtaConfig> {
  if (!force && cache && cache.expiresAt > Date.now()) {
    return cache.config
  }

  const { data, error } = await supabase
    .from('ai_config')
    .select('key, value')
    .like('key', 'affiliate_%')

  if (error) {
    console.error('[affiliateConfig] fetch failed:', error.message)
    return DEFAULT_AFFILIATE_CTA_CONFIG
  }

  const affiliateRows = (data ?? []).filter((row) => {
    const key = String(row.key)
    return key.startsWith('affiliate_') || key === 'affiliate_name' || key === 'affiliate_url'
  })

  const { data: slotRows } = await supabase
    .from('ai_config')
    .select('key, value')
    .in('key', ['affiliate_name', 'affiliate_url', 'cta_slot1_type', 'cta_slot2_type'])

  const merged = [...affiliateRows, ...(slotRows ?? [])]
  const byKey = new Map<string, unknown>()
  for (const row of merged) {
    byKey.set(String(row.key), row.value)
  }

  const config = buildAffiliateConfigFromRows(
    [...byKey.entries()].map(([key, value]) => ({ key, value })),
  )
  cache = { config, expiresAt: Date.now() + CACHE_TTL_MS }
  return config
}

export function resolveHeadline(
  template: string,
  cardName: string,
  articleSpecific: boolean,
): string {
  if (articleSpecific && cardName) {
    return template.replace(/\{card_name\}/gi, cardName)
  }
  return template.replace(/\{card_name\}/gi, 'this card')
}

export function configToUpsertRows(draft: AffiliateCtaConfig): { key: string; value: string }[] {
  return [
    { key: 'affiliate_cta_enabled', value: draft.enabled ? 'true' : 'false' },
    { key: 'affiliate_cta_design', value: draft.design },
    { key: 'affiliate_cta_type', value: draft.type },
    { key: 'affiliate_name', value: draft.affiliateName },
    { key: 'affiliate_url', value: draft.affiliateUrl },
    {
      key: 'affiliate_cta_article_specific',
      value: draft.articleSpecific ? 'true' : 'false',
    },
    { key: 'affiliate_cta_placement', value: draft.placement },
    { key: 'affiliate_cta_slot1_type', value: draft.slot1Type },
    { key: 'affiliate_cta_slot2_type', value: draft.slot2Type },
    { key: 'affiliate_cta_a_label', value: draft.designA.label },
    { key: 'affiliate_cta_a_headline', value: draft.designA.headline },
    { key: 'affiliate_cta_a_body', value: draft.designA.body },
    { key: 'affiliate_cta_a_button', value: draft.designA.button },
    { key: 'affiliate_cta_a_footer', value: draft.designA.footer },
    { key: 'affiliate_cta_a_stat1_value', value: draft.designA.stat1Value },
    { key: 'affiliate_cta_a_stat1_label', value: draft.designA.stat1Label },
    { key: 'affiliate_cta_a_stat2_value', value: draft.designA.stat2Value },
    { key: 'affiliate_cta_a_stat2_label', value: draft.designA.stat2Label },
    { key: 'affiliate_cta_a_stat3_value', value: draft.designA.stat3Value },
    { key: 'affiliate_cta_a_stat3_label', value: draft.designA.stat3Label },
    { key: 'affiliate_cta_b_label', value: draft.designB.label },
    { key: 'affiliate_cta_b_headline', value: draft.designB.headline },
    { key: 'affiliate_cta_b_body', value: draft.designB.body },
    { key: 'affiliate_cta_b_q1', value: draft.designB.q1 },
    { key: 'affiliate_cta_b_q2', value: draft.designB.q2 },
    { key: 'affiliate_cta_b_q3', value: draft.designB.q3 },
    { key: 'affiliate_cta_b_button', value: draft.designB.button },
    { key: 'affiliate_cta_b_footer', value: draft.designB.footer },
    { key: 'affiliate_cta_b_trust', value: draft.designB.trust },
    { key: 'affiliate_cta_c_headline', value: draft.designC.headline },
    { key: 'affiliate_cta_c_body', value: draft.designC.body },
    { key: 'affiliate_cta_c_button', value: draft.designC.button },
    { key: 'affiliate_cta_internal_headline', value: draft.internal.headline },
    { key: 'affiliate_cta_internal_body', value: draft.internal.body },
    { key: 'affiliate_cta_internal_button', value: draft.internal.button },
  ]
}
