import type { Tier } from '@/lib/supabase'

export const UNLIMITED_CREDITS = 999_999

export type SubscriptionPlanId = 'starter' | 'pro' | 'unlimited'
export type CreditPackId = 'small' | 'medium' | 'large'

export type PlanConfig = {
  name: string
  price: number
  currency: string
  interval: 'monthly'
  credits: number
  features: string[]
  dodo_product_id?: string
}

export type CreditPackConfig = {
  name: string
  credits: number
  price: number
  dodo_product_id?: string
}

export const PLANS: Record<SubscriptionPlanId, PlanConfig> = {
  starter: {
    name: 'Starter',
    price: 9,
    currency: 'USD',
    interval: 'monthly',
    credits: 50,
    features: [
      '50 AI readings per month',
      'All tarot spreads',
      'Reading history',
      'Email support',
    ],
    dodo_product_id: import.meta.env.VITE_DODO_PRODUCT_STARTER_ID,
  },
  pro: {
    name: 'Pro',
    price: 19,
    currency: 'USD',
    interval: 'monthly',
    credits: 200,
    features: [
      '200 AI readings per month',
      'All tarot spreads',
      'Reading history',
      'Priority support',
      'Advanced card combinations',
    ],
    dodo_product_id: import.meta.env.VITE_DODO_PRODUCT_PRO_ID,
  },
  unlimited: {
    name: 'Unlimited',
    price: 39,
    currency: 'USD',
    interval: 'monthly',
    credits: -1,
    features: [
      'Unlimited AI readings',
      'All tarot spreads',
      'Reading history',
      'Priority support',
      'Advanced card combinations',
      'API access',
    ],
    dodo_product_id: import.meta.env.VITE_DODO_PRODUCT_UNLIMITED_ID,
  },
}

export const CREDIT_PACKS: Record<CreditPackId, CreditPackConfig> = {
  small: {
    name: '10 Readings',
    credits: 10,
    price: 4.99,
    dodo_product_id: import.meta.env.VITE_DODO_PRODUCT_CREDITS_SMALL_ID,
  },
  medium: {
    name: '30 Readings',
    credits: 30,
    price: 9.99,
    dodo_product_id: import.meta.env.VITE_DODO_PRODUCT_CREDITS_MEDIUM_ID,
  },
  large: {
    name: '100 Readings',
    credits: 100,
    price: 24.99,
    dodo_product_id: import.meta.env.VITE_DODO_PRODUCT_CREDITS_LARGE_ID,
  },
}

export function planCredits(planId: SubscriptionPlanId): number {
  const plan = PLANS[planId]
  return plan.credits === -1 ? UNLIMITED_CREDITS : plan.credits
}

export function planToTier(planId: SubscriptionPlanId): Tier {
  if (planId === 'starter') return 'seeker'
  return 'oracle'
}

export function isSubscriptionPlanId(value: string): value is SubscriptionPlanId {
  return value === 'starter' || value === 'pro' || value === 'unlimited'
}

export function isCreditPackId(value: string): value is CreditPackId {
  return value === 'small' || value === 'medium' || value === 'large'
}

/** Server-side plan config with process.env product IDs */
export function getServerPlans(): Record<SubscriptionPlanId, PlanConfig> {
  return {
    starter: { ...PLANS.starter, dodo_product_id: process.env.DODO_PRODUCT_STARTER_ID },
    pro: { ...PLANS.pro, dodo_product_id: process.env.DODO_PRODUCT_PRO_ID },
    unlimited: {
      ...PLANS.unlimited,
      dodo_product_id: process.env.DODO_PRODUCT_UNLIMITED_ID,
    },
  }
}

export function getServerCreditPacks(): Record<CreditPackId, CreditPackConfig> {
  return {
    small: { ...CREDIT_PACKS.small, dodo_product_id: process.env.DODO_PRODUCT_CREDITS_SMALL_ID },
    medium: { ...CREDIT_PACKS.medium, dodo_product_id: process.env.DODO_PRODUCT_CREDITS_MEDIUM_ID },
    large: { ...CREDIT_PACKS.large, dodo_product_id: process.env.DODO_PRODUCT_CREDITS_LARGE_ID },
  }
}
