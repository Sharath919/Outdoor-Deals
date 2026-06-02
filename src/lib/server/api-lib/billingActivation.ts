import type { SupabaseClient } from '@supabase/supabase-js'
import type { Payment } from 'dodopayments/resources/payments.js'
import type { Subscription } from 'dodopayments/resources/subscriptions.js'
import {
  creditPackFromDodoProductId,
  fetchCreditPacks,
  fetchTierProducts,
  isCreditPackId,
  isPaidTierId,
  subscriptionCreditsForTier,
  tierFromDodoProductId,
  type TierProductRow,
} from './billingProducts.js'
import { getDodoClient } from './dodo.js'

export type ActivationResult = {
  ok: boolean
  activated: boolean
  reason?: string
  tier?: string
  credits?: number
  subscription_status?: string
  subscription_plan?: string | null
}

function logSupabaseError(label: string, error: { message: string; code?: string } | null) {
  if (error) {
    console.error(`[billing-activation] ${label}:`, error.message, error.code ?? '')
  }
}

export async function resolveUserId(
  supabase: SupabaseClient,
  metadata: Record<string, string> | undefined,
  customerEmail?: string | null,
): Promise<string | null> {
  const fromMeta = metadata?.user_id?.trim()
  if (fromMeta) return fromMeta

  const email = customerEmail?.trim().toLowerCase()
  if (!email) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  logSupabaseError('resolveUserId by email', error)
  return data?.id ?? null
}

export async function addCreditsToProfile(
  supabase: SupabaseClient,
  userId: string,
  credits: number,
): Promise<boolean> {
  if (credits <= 0) return true

  const { error: rpcError } = await supabase.rpc('add_credits', {
    p_user_id: userId,
    p_credits: credits,
  })

  if (!rpcError) return true

  console.error('[billing-activation] add_credits RPC failed, using direct update:', rpcError.message)

  const { data: profile, error: readError } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', userId)
    .maybeSingle()

  logSupabaseError('read credits for fallback', readError)
  if (readError) return false

  const nextCredits = (profile?.credits ?? 0) + credits
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ credits: nextCredits })
    .eq('id', userId)

  logSupabaseError('direct credits update', updateError)
  return !updateError
}

export async function activateTierSubscription(
  supabase: SupabaseClient,
  userId: string,
  tier: TierProductRow,
  extras: {
    subscription_id?: string | null
    period_end?: string | null
    dodo_customer_id?: string | null
  } = {},
): Promise<boolean> {
  const credits = subscriptionCreditsForTier(tier)
  const tierId = tier.id as 'seeker' | 'oracle'

  const { error } = await supabase
    .from('profiles')
    .update({
      dodo_customer_id: extras.dodo_customer_id ?? null,
      subscription_id: extras.subscription_id ?? null,
      subscription_status: 'active',
      subscription_plan: tierId,
      subscription_period_end: extras.period_end ?? null,
      credits,
      tier: tierId,
    })
    .eq('id', userId)

  logSupabaseError(`activateTierSubscription user=${userId} tier=${tierId}`, error)
  return !error
}

export async function resolveTierFromMetadata(
  supabase: SupabaseClient,
  metadata: Record<string, string> | undefined,
  productId?: string | null,
): Promise<TierProductRow | null> {
  const fromProduct = await tierFromDodoProductId(supabase, productId)
  if (fromProduct) return fromProduct

  const tierId = metadata?.tier_id?.trim() || metadata?.plan_id?.trim()
  if (!tierId || !isPaidTierId(tierId)) return null

  const tiers = await fetchTierProducts(supabase)
  return tiers.find((t) => t.id === tierId) ?? null
}

function productIdFromPayment(payment: Payment): string | null {
  return payment.product_cart?.[0]?.product_id ?? null
}

export async function processPaymentActivation(
  supabase: SupabaseClient,
  payment: Payment,
  expectedUserId?: string,
): Promise<ActivationResult> {
  const metadata = payment.metadata ?? {}
  const userId = await resolveUserId(supabase, metadata, payment.customer?.email)

  if (!userId) {
    return { ok: false, activated: false, reason: 'Could not resolve user for payment' }
  }

  if (expectedUserId && userId !== expectedUserId) {
    return { ok: false, activated: false, reason: 'Payment does not belong to this account' }
  }

  if (payment.status !== 'succeeded') {
    return {
      ok: true,
      activated: false,
      reason: `Payment status is ${payment.status ?? 'unknown'}, not succeeded`,
    }
  }

  const productId = productIdFromPayment(payment)
  let credits = parseInt(metadata.credits || '0', 10)
  if (!credits && productId) {
    const pack = await creditPackFromDodoProductId(supabase, productId)
    if (pack) credits = pack.credits
  }

  const { error: paymentLogError } = await supabase.from('payments').upsert(
    {
      user_id: userId,
      dodo_payment_id: payment.payment_id,
      dodo_subscription_id: payment.subscription_id ?? null,
      amount: payment.total_amount ?? null,
      currency: payment.currency ?? 'USD',
      status: 'succeeded',
      payment_type:
        metadata.payment_type === 'one_time'
          ? 'one_time'
          : payment.subscription_id || metadata.payment_type === 'subscription'
            ? 'subscription'
            : 'one_time',
      plan_name: metadata.pack_id ?? metadata.plan_id ?? metadata.tier_id ?? null,
      credits_added: credits > 0 ? credits : 0,
    },
    { onConflict: 'dodo_payment_id' },
  )
  logSupabaseError('payments upsert', paymentLogError)

  const tier = await resolveTierFromMetadata(supabase, metadata, productId)
  if (tier) {
    const activated = await activateTierSubscription(supabase, userId, tier, {
      subscription_id: payment.subscription_id,
      dodo_customer_id: payment.customer?.customer_id,
    })
    if (!activated) {
      return { ok: false, activated: false, reason: 'Failed to update profile for subscription' }
    }
    return {
      ok: true,
      activated: true,
      tier: tier.id,
      credits: subscriptionCreditsForTier(tier),
      subscription_status: 'active',
      subscription_plan: tier.id,
    }
  }

  if (metadata.payment_type === 'one_time' || credits > 0) {
    const activated = await addCreditsToProfile(supabase, userId, credits)
    if (!activated) {
      return { ok: false, activated: false, reason: 'Failed to add credits' }
    }
    return { ok: true, activated: true, credits, subscription_status: 'free', subscription_plan: null }
  }

  if (metadata.pack_id && isCreditPackId(metadata.pack_id)) {
    const packs = await fetchCreditPacks(supabase)
    const pack = packs.find((p) => p.id === metadata.pack_id)
    if (pack) {
      const activated = await addCreditsToProfile(supabase, userId, pack.credits)
      if (!activated) {
        return { ok: false, activated: false, reason: 'Failed to add credit pack credits' }
      }
      return {
        ok: true,
        activated: true,
        credits: pack.credits,
        subscription_status: 'free',
        subscription_plan: null,
      }
    }
  }

  return { ok: true, activated: false, reason: 'No tier or credits matched this payment' }
}

export async function processSubscriptionActivation(
  supabase: SupabaseClient,
  sub: Subscription,
  expectedUserId?: string,
): Promise<ActivationResult> {
  const metadata = sub.metadata ?? {}
  const userId = await resolveUserId(supabase, metadata, sub.customer?.email)

  if (!userId) {
    return { ok: false, activated: false, reason: 'Could not resolve user for subscription' }
  }

  if (expectedUserId && userId !== expectedUserId) {
    return { ok: false, activated: false, reason: 'Subscription does not belong to this account' }
  }

  const activeStatuses = new Set(['active', 'trialing', 'pending'])
  if (!activeStatuses.has(sub.status)) {
    return {
      ok: true,
      activated: false,
      reason: `Subscription status is ${sub.status}, not active`,
    }
  }

  const tier = await resolveTierFromMetadata(supabase, metadata, sub.product_id)
  if (!tier) {
    return { ok: false, activated: false, reason: 'Could not map product to a plan tier' }
  }

  const activated = await activateTierSubscription(supabase, userId, tier, {
    subscription_id: sub.subscription_id,
    period_end: sub.next_billing_date,
    dodo_customer_id: sub.customer?.customer_id,
  })

  if (!activated) {
    return { ok: false, activated: false, reason: 'Failed to update profile for subscription' }
  }

  const { error: subPaymentError } = await supabase.from('payments').insert({
    user_id: userId,
    dodo_subscription_id: sub.subscription_id,
    amount: sub.recurring_pre_tax_amount ?? null,
    currency: sub.currency ?? 'USD',
    status: 'succeeded',
    payment_type: 'subscription',
    plan_name: tier.id,
    credits_added: subscriptionCreditsForTier(tier),
  })
  logSupabaseError('subscription payment log', subPaymentError)

  return {
    ok: true,
    activated: true,
    tier: tier.id,
    credits: subscriptionCreditsForTier(tier),
    subscription_status: 'active',
    subscription_plan: tier.id,
  }
}

export async function activateFromDodoIds(
  supabase: SupabaseClient,
  params: { payment_id?: string; subscription_id?: string },
  expectedUserId: string,
): Promise<ActivationResult> {
  const dodo = getDodoClient()

  if (params.subscription_id?.trim()) {
    const sub = await dodo.subscriptions.retrieve(params.subscription_id.trim())
    return processSubscriptionActivation(supabase, sub, expectedUserId)
  }

  if (params.payment_id?.trim()) {
    const payment = await dodo.payments.retrieve(params.payment_id.trim())
    const paymentResult = await processPaymentActivation(supabase, payment, expectedUserId)

    if (paymentResult.activated || !payment.subscription_id) {
      return paymentResult
    }

    const sub = await dodo.subscriptions.retrieve(payment.subscription_id)
    return processSubscriptionActivation(supabase, sub, expectedUserId)
  }

  return { ok: false, activated: false, reason: 'payment_id or subscription_id is required' }
}

export async function readProfileBilling(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  tier: string
  credits: number
  subscription_status: string | null
  subscription_plan: string | null
}> {
  const { data, error } = await supabase
    .from('profiles')
    .select('tier, credits, subscription_status, subscription_plan')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return {
    tier: data?.tier ?? 'free',
    credits: data?.credits ?? 0,
    subscription_status: data?.subscription_status ?? null,
    subscription_plan: data?.subscription_plan ?? null,
  }
}
