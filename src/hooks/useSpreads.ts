import { supabase } from '../lib/supabase'
import {
  spreads as fallbackSpreads,
  setRuntimeSpreads,
  type Spread,
} from '../data/spreads'

let cachedSpreads: Spread[] | null = null

const SPREAD_LAYOUTS: readonly Spread['layout'][] = [
  'single',
  'row',
  'two-rows',
  'cross',
  'diamond',
  'grid',
  'arc',
  'yearly',
  'two-paths',
  'three-paths',
  'shadow',
] as const

const SPREAD_TIERS: readonly Spread['tier'][] = ['free', 'seeker', 'oracle'] as const

export interface DbSpreadRow {
  id: string
  name: string
  description: string | null
  card_count: number
  positions: string[]
  layout: string
  tier: string
  is_active: boolean
  is_seasonal: boolean
  seasonal_dates: string | null
  sort_order: number
  badge: string | null
}

function parseLayout(value: string): Spread['layout'] {
  if ((SPREAD_LAYOUTS as readonly string[]).includes(value)) {
    return value as Spread['layout']
  }
  return 'row'
}

function parseTier(value: string): Spread['tier'] {
  if ((SPREAD_TIERS as readonly string[]).includes(value)) {
    return value as Spread['tier']
  }
  return 'free'
}

export function dbRowToSpread(row: DbSpreadRow): Spread {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    count: row.card_count,
    positions: Array.isArray(row.positions) ? row.positions : [],
    layout: parseLayout(row.layout),
    tier: parseTier(row.tier),
    badge: row.badge,
    isSeasonal: row.is_seasonal,
    seasonalDates: row.seasonal_dates,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }
}

export async function fetchSpreads(): Promise<Spread[]> {
  if (cachedSpreads) return cachedSpreads

  const { data, error } = await supabase
    .from('spreads')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  if (error || !data?.length) {
    console.warn('Using fallback spreads', error?.message)
    cachedSpreads = Object.values(fallbackSpreads)
    setRuntimeSpreads(cachedSpreads)
    return cachedSpreads
  }

  cachedSpreads = (data as DbSpreadRow[]).map(dbRowToSpread)
  setRuntimeSpreads(cachedSpreads)
  return cachedSpreads
}

export async function fetchAllSpreadsAdmin(): Promise<Spread[]> {
  const { data, error } = await supabase.from('spreads').select('*').order('sort_order')

  if (error || !data?.length) {
    return Object.values(fallbackSpreads).map((s, i) => ({
      ...s,
      sortOrder: i + 1,
      isActive: true,
      isSeasonal: s.id === 'seasonal',
      seasonalDates: s.id === 'seasonal' ? 'Mar 20, Jun 21, Sep 22, Dec 21' : null,
    }))
  }

  return (data as DbSpreadRow[]).map(dbRowToSpread)
}

export function clearSpreadCache() {
  cachedSpreads = null
}

const SEASONAL_WINDOWS = [
  { month: 3, day: 20, label: 'Spring Equinox · Mar 20' },
  { month: 6, day: 21, label: 'Summer Solstice · Jun 21' },
  { month: 9, day: 22, label: 'Autumn Equinox · Sep 22' },
  { month: 12, day: 21, label: 'Winter Solstice · Dec 21' },
]

export function isSeasonalAvailable(): boolean {
  const today = new Date()
  const month = today.getMonth() + 1
  const day = today.getDate()

  return SEASONAL_WINDOWS.some(
    (w) => w.month === month && Math.abs(w.day - day) <= 3,
  )
}

export function getNextSeasonalLabel(): string {
  const today = new Date()
  const year = today.getFullYear()

  const candidates = SEASONAL_WINDOWS.map((w) => {
    let d = new Date(year, w.month - 1, w.day)
    if (d < today) d = new Date(year + 1, w.month - 1, w.day)
    return { d, label: w.label }
  }).sort((a, b) => a.d.getTime() - b.d.getTime())

  return candidates[0]?.label ?? 'Next solstice or equinox'
}

export const TIER_RANK: Record<Spread['tier'], number> = {
  free: 0,
  seeker: 1,
  oracle: 2,
}

export function userCanAccessSpread(userTier: string, spreadTier: string): boolean {
  const userRank = TIER_RANK[userTier as Spread['tier']] ?? 0
  const spreadRank = TIER_RANK[spreadTier as Spread['tier']] ?? 0
  return userRank >= spreadRank
}
