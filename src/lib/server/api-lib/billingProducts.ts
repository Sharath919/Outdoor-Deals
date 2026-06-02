import type { SupabaseClient } from '@supabase/supabase-js'
import { UNLIMITED_CREDITS } from './dodo.js'

export type BillingInterval = 'monthly' | 'annual'
export type PaidTierId = 'seeker' | 'oracle'
export type CreditPackId = 'small' | 'medium' | 'large'

export type TierProductRow = {
  id: string
  display_name: string
  dodo_product_id_monthly: string | null
  dodo_product_id_annual: string | null
  limits: { daily_readings?: number }
}

export type CreditPackRow = {
  id: string
  name: string
  credits: number
  price: number
  dodo_product_id: string | null
}

const PAID_TIERS = new Set<string>(['seeker', 'oracle'])
const CREDIT_PACK_IDS = new Set<string>(['small', 'medium', 'large'])

export function isPaidTierId(value: string): value is PaidTierId {
  return PAID_TIERS.has(value)
}

export function isCreditPackId(value: string): value is CreditPackId {
  return CREDIT_PACK_IDS.has(value)
}

function parseLimits(raw: unknown): { daily_readings?: number } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const daily = (raw as Record<string, unknown>).daily_readings
  return typeof daily === 'number' ? { daily_readings: daily } : {}
}

export async function fetchTierProducts(supabase: SupabaseClient): Promise<TierProductRow[]> {
  const { data, error } = await supabase
    .from('tier_config')
    .select('id, display_name, dodo_product_id_monthly, dodo_product_id_annual, limits')
    .eq('is_active', true)
    .order('sort_order')

  if (error) throw new Error(`Failed to load tier products: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: String(row.id),
    display_name: String(row.display_name ?? row.id),
    dodo_product_id_monthly:
      typeof row.dodo_product_id_monthly === 'string' ? row.dodo_product_id_monthly : null,
    dodo_product_id_annual:
      typeof row.dodo_product_id_annual === 'string' ? row.dodo_product_id_annual : null,
    limits: parseLimits(row.limits),
  }))
}

export async function fetchCreditPacks(supabase: SupabaseClient): Promise<CreditPackRow[]> {
  const { data, error } = await supabase
    .from('credit_packs')
    .select('id, name, credits, price, dodo_product_id')
    .eq('is_active', true)
    .order('sort_order')

  if (error) throw new Error(`Failed to load credit packs: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    credits: Number(row.credits) || 0,
    price: Number(row.price) || 0,
    dodo_product_id: typeof row.dodo_product_id === 'string' ? row.dodo_product_id : null,
  }))
}

export function productIdForTier(
  tier: TierProductRow,
  interval: BillingInterval,
): string | null {
  const id =
    interval === 'annual'
      ? tier.dodo_product_id_annual?.trim()
      : tier.dodo_product_id_monthly?.trim()
  return id || null
}

export async function resolveSubscriptionProductId(
  supabase: SupabaseClient,
  tierId: string,
  interval: BillingInterval = 'monthly',
): Promise<{ productId: string; tier: TierProductRow } | { error: string }> {
  if (!isPaidTierId(tierId)) {
    return { error: 'Invalid subscription plan' }
  }

  const tiers = await fetchTierProducts(supabase)
  const tier = tiers.find((t) => t.id === tierId)
  if (!tier) {
    return { error: `Plan "${tierId}" not found in Plan Manager` }
  }

  const productId = productIdForTier(tier, interval)
  if (!productId) {
    const label = interval === 'annual' ? 'annual' : 'monthly'
    return {
      error: `Dodo ${label} product ID missing for ${tier.display_name}. Add it in Admin → Plan Manager.`,
    }
  }

  return { productId, tier }
}

export async function resolveCreditPackProductId(
  supabase: SupabaseClient,
  packId: string,
): Promise<{ productId: string; pack: CreditPackRow } | { error: string }> {
  if (!isCreditPackId(packId)) {
    return { error: 'Invalid credit pack' }
  }

  const packs = await fetchCreditPacks(supabase)
  const pack = packs.find((p) => p.id === packId)
  if (!pack) {
    return { error: `Credit pack "${packId}" not found` }
  }

  const productId = pack.dodo_product_id?.trim()
  if (!productId) {
    return {
      error: `Dodo product ID missing for ${pack.name}. Add it in Admin → Plan Manager → Credit Packs.`,
    }
  }

  return { productId, pack }
}

export async function tierFromDodoProductId(
  supabase: SupabaseClient,
  productId: string | null | undefined,
): Promise<TierProductRow | null> {
  if (!productId?.trim()) return null
  const needle = productId.trim()
  const tiers = await fetchTierProducts(supabase)
  return (
    tiers.find(
      (t) =>
        t.dodo_product_id_monthly?.trim() === needle ||
        t.dodo_product_id_annual?.trim() === needle,
    ) ?? null
  )
}

export async function creditPackFromDodoProductId(
  supabase: SupabaseClient,
  productId: string | null | undefined,
): Promise<CreditPackRow | null> {
  if (!productId?.trim()) return null
  const needle = productId.trim()
  const packs = await fetchCreditPacks(supabase)
  return packs.find((p) => p.dodo_product_id?.trim() === needle) ?? null
}

export function subscriptionCreditsForTier(tier: TierProductRow): number {
  const daily = tier.limits.daily_readings ?? 0
  if (daily >= 999) return UNLIMITED_CREDITS
  return daily > 0 ? daily : UNLIMITED_CREDITS
}
