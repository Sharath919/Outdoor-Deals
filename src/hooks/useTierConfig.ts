import { supabase } from '../lib/supabase'

export interface TierLimits {
  daily_readings?: number
  followups_per_reading?: number
  question_char_limit?: number
  manifestation_goals?: number
  oracle_cards_per_week?: number
  history_days?: number
  custom_readers?: number
  reading_mode?: string
}

export interface TierConfigRow {
  id: string
  name: string
  display_name: string
  price_monthly: number
  price_annual: number
  stripe_price_id_monthly: string | null
  stripe_price_id_annual: string | null
  dodo_product_id_monthly: string | null
  dodo_product_id_annual: string | null
  color: string
  icon: string
  tagline: string | null
  is_active: boolean
  sort_order: number
  features: string[]
  limits: TierLimits
}

export interface CreditPackRow {
  id: string
  name: string
  credits: number
  price: number
  dodo_product_id: string | null
  is_active: boolean
  sort_order: number
}

export type TierConfigMap = Record<string, TierConfigRow>

type TierId = 'free' | 'seeker' | 'oracle'

let cachedTiers: TierConfigMap | null = null

const HARDCODED_LIMITS: Record<TierId, TierLimits> = {
  free: {
    daily_readings: 3,
    followups_per_reading: 3,
    question_char_limit: 300,
    manifestation_goals: 1,
    oracle_cards_per_week: 3,
    history_days: 7,
    custom_readers: 0,
    reading_mode: 'quick',
  },
  seeker: {
    daily_readings: 999,
    followups_per_reading: 10,
    question_char_limit: 800,
    manifestation_goals: 5,
    oracle_cards_per_week: 7,
    history_days: 90,
    custom_readers: 1,
    reading_mode: 'both',
  },
  oracle: {
    daily_readings: 999,
    followups_per_reading: 25,
    question_char_limit: 1500,
    manifestation_goals: 999,
    oracle_cards_per_week: 999,
    history_days: 999,
    custom_readers: 5,
    reading_mode: 'both',
  },
}

const HARDCODED_TIERS: TierConfigMap = {
  free: {
    id: 'free',
    name: 'free',
    display_name: 'Free',
    price_monthly: 0,
    price_annual: 0,
    stripe_price_id_monthly: null,
    stripe_price_id_annual: null,
    dodo_product_id_monthly: null,
    dodo_product_id_annual: null,
    color: '#6B7280',
    icon: '✦',
    tagline: 'Begin your journey',
    is_active: true,
    sort_order: 1,
    features: [
      '3 AI readings per day',
      'Single Card, 3-Card & Yes/No spreads',
      '3 follow-up questions per reading',
      'Daily Card',
      'Luna, Sage & Atlas readers',
      'Quick Reading mode',
    ],
    limits: HARDCODED_LIMITS.free,
  },
  seeker: {
    id: 'seeker',
    name: 'seeker',
    display_name: 'Seeker',
    price_monthly: 7.99,
    price_annual: 76.7,
    stripe_price_id_monthly: null,
    stripe_price_id_annual: null,
    dodo_product_id_monthly: null,
    dodo_product_id_annual: null,
    color: '#C9A84C',
    icon: '✦✦',
    tagline: 'Go deeper',
    is_active: true,
    sort_order: 2,
    features: [
      'Unlimited readings',
      'All 17 spreads unlocked',
      '10 follow-up questions per reading',
      'Quick + Deep Insight modes',
      'All 7 readers (Crone, Raven, Rose, Vesper)',
      'Reading history — 90 days',
      'Voice narration',
      '1 Custom reader',
      '5 Manifestation goals',
      'Monthly & Yearly forecasts',
      'Soulmate Compatibility spread',
    ],
    limits: HARDCODED_LIMITS.seeker,
  },
  oracle: {
    id: 'oracle',
    name: 'oracle',
    display_name: 'Oracle',
    price_monthly: 19.99,
    price_annual: 191.9,
    stripe_price_id_monthly: null,
    stripe_price_id_annual: null,
    dodo_product_id_monthly: null,
    dodo_product_id_annual: null,
    color: '#7B4FD4',
    icon: '✦✦✦',
    tagline: 'Full power',
    is_active: true,
    sort_order: 3,
    features: [
      'Everything in Seeker',
      'All 8 readers including Orion',
      '25 follow-up questions per reading',
      'Unlimited reading history + export',
      '5 Custom readers',
      'Unlimited Manifestation goals',
      'Priority support',
      'Early access to new features',
    ],
    limits: HARDCODED_LIMITS.oracle,
  },
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function parseTierLimits(value: unknown): TierLimits {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const raw = value as Record<string, unknown>
  const limits: TierLimits = {}
  const numericKeys = [
    'daily_readings',
    'followups_per_reading',
    'question_char_limit',
    'manifestation_goals',
    'oracle_cards_per_week',
    'history_days',
    'custom_readers',
  ] as const
  for (const key of numericKeys) {
    const v = raw[key]
    if (typeof v === 'number' && !Number.isNaN(v)) {
      limits[key] = v
    }
  }
  if (typeof raw.reading_mode === 'string') {
    limits.reading_mode = raw.reading_mode
  }
  return limits
}

function parseTierRow(row: Record<string, unknown>): TierConfigRow {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? row.id ?? ''),
    display_name: String(row.display_name ?? ''),
    price_monthly: Number(row.price_monthly) || 0,
    price_annual: Number(row.price_annual) || 0,
    stripe_price_id_monthly:
      typeof row.stripe_price_id_monthly === 'string' ? row.stripe_price_id_monthly : null,
    stripe_price_id_annual:
      typeof row.stripe_price_id_annual === 'string' ? row.stripe_price_id_annual : null,
    dodo_product_id_monthly:
      typeof row.dodo_product_id_monthly === 'string' ? row.dodo_product_id_monthly : null,
    dodo_product_id_annual:
      typeof row.dodo_product_id_annual === 'string' ? row.dodo_product_id_annual : null,
    color: typeof row.color === 'string' ? row.color : '#6B7280',
    icon: typeof row.icon === 'string' ? row.icon : '✦',
    tagline: typeof row.tagline === 'string' ? row.tagline : null,
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order) || 0,
    features: parseStringArray(row.features),
    limits: parseTierLimits(row.limits),
  }
}

export async function fetchTierConfig(): Promise<TierConfigMap> {
  if (cachedTiers) return cachedTiers

  const { data, error } = await supabase
    .from('tier_config')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  if (error || !data?.length) {
    cachedTiers = HARDCODED_TIERS
    return cachedTiers
  }

  cachedTiers = {}
  for (const row of data) {
    const parsed = parseTierRow(row as Record<string, unknown>)
    if (parsed.id) cachedTiers[parsed.id] = parsed
  }
  return cachedTiers
}

export async function fetchAllTierConfigAdmin(): Promise<TierConfigRow[]> {
  const { data, error } = await supabase.from('tier_config').select('*').order('sort_order')

  if (error || !data?.length) {
    return Object.values(HARDCODED_TIERS)
  }

  return data.map((row) => parseTierRow(row as Record<string, unknown>))
}

export function clearTierConfigCache() {
  cachedTiers = null
}

function getHardcodedLimit(tier: string, limit: keyof TierLimits): number {
  const tierLimits = HARDCODED_LIMITS[tier as TierId]
  const val = tierLimits?.[limit]
  return typeof val === 'number' ? val : 3
}

export function getUserLimit(
  tier: string,
  limit: keyof TierLimits,
  tierConfig: TierConfigMap | null,
): number {
  const fromDb = tierConfig?.[tier]?.limits?.[limit]
  if (typeof fromDb === 'number') return fromDb
  return getHardcodedLimit(tier, limit)
}

export function getTierList(tierConfig: TierConfigMap): TierConfigRow[] {
  return Object.values(tierConfig).sort((a, b) => a.sort_order - b.sort_order)
}

function parseCreditPackRow(row: Record<string, unknown>): CreditPackRow {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    credits: Number(row.credits) || 0,
    price: Number(row.price) || 0,
    dodo_product_id: typeof row.dodo_product_id === 'string' ? row.dodo_product_id : null,
    is_active: Boolean(row.is_active ?? true),
    sort_order: Number(row.sort_order) || 0,
  }
}

export async function fetchAllCreditPacksAdmin(): Promise<CreditPackRow[]> {
  const { data, error } = await supabase.from('credit_packs').select('*').order('sort_order')

  if (error || !data?.length) return []
  return data.map((row) => parseCreditPackRow(row as Record<string, unknown>))
}
