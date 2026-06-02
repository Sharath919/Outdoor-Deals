import DodoPayments from 'dodopayments'

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

const BASE_PLANS: Record<SubscriptionPlanId, PlanConfig> = {
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
  },
}

const BASE_CREDIT_PACKS: Record<CreditPackId, CreditPackConfig> = {
  small: { name: '10 Readings', credits: 10, price: 4.99 },
  medium: { name: '30 Readings', credits: 30, price: 9.99 },
  large: { name: '100 Readings', credits: 100, price: 24.99 },
}

export function getServerPlans(): Record<SubscriptionPlanId, PlanConfig> {
  return {
    starter: { ...BASE_PLANS.starter, dodo_product_id: process.env.DODO_PRODUCT_STARTER_ID },
    pro: { ...BASE_PLANS.pro, dodo_product_id: process.env.DODO_PRODUCT_PRO_ID },
    unlimited: {
      ...BASE_PLANS.unlimited,
      dodo_product_id: process.env.DODO_PRODUCT_UNLIMITED_ID,
    },
  }
}

export function getServerCreditPacks(): Record<CreditPackId, CreditPackConfig> {
  return {
    small: { ...BASE_CREDIT_PACKS.small, dodo_product_id: process.env.DODO_PRODUCT_CREDITS_SMALL_ID },
    medium: {
      ...BASE_CREDIT_PACKS.medium,
      dodo_product_id: process.env.DODO_PRODUCT_CREDITS_MEDIUM_ID,
    },
    large: { ...BASE_CREDIT_PACKS.large, dodo_product_id: process.env.DODO_PRODUCT_CREDITS_LARGE_ID },
  }
}

export function planCredits(planId: SubscriptionPlanId): number {
  const plan = BASE_PLANS[planId]
  return plan.credits === -1 ? UNLIMITED_CREDITS : plan.credits
}

export function planToTier(planId: SubscriptionPlanId): 'seeker' | 'oracle' {
  if (planId === 'starter') return 'seeker'
  return 'oracle'
}

export function isSubscriptionPlanId(value: string): value is SubscriptionPlanId {
  return value === 'starter' || value === 'pro' || value === 'unlimited'
}

/** Map tier_config ids (seeker/oracle) or Dodo plan ids to a checkout plan id */
export function resolveCheckoutPlanId(value: string): SubscriptionPlanId | null {
  if (isSubscriptionPlanId(value)) return value
  if (value === 'seeker') return 'starter'
  if (value === 'oracle') return 'pro'
  return null
}

export function isCreditPackId(value: string): value is CreditPackId {
  return value === 'small' || value === 'medium' || value === 'large'
}

export function planFromProductId(productId: string | undefined | null) {
  if (!productId) return null
  const plans = getServerPlans()
  for (const planId of Object.keys(plans) as SubscriptionPlanId[]) {
    if (plans[planId].dodo_product_id === productId) {
      return { planId, plan: plans[planId] }
    }
  }
  return null
}

export function creditPackFromProductId(productId: string | undefined | null) {
  if (!productId) return null
  const packs = getServerCreditPacks()
  for (const packId of Object.keys(packs) as CreditPackId[]) {
    if (packs[packId].dodo_product_id === productId) {
      return { packId, pack: packs[packId] }
    }
  }
  return null
}

export function resolvePlanFromMetadata(
  metadata: Record<string, string> | undefined,
  productId?: string | null,
) {
  const planId = metadata?.plan_id
  if (planId && isSubscriptionPlanId(planId)) {
    return { planId, plan: getServerPlans()[planId] }
  }
  return planFromProductId(productId)
}

let client: DodoPayments | null = null

export function getDodoClient(): DodoPayments {
  if (!client) {
    const apiKey = process.env.DODO_PAYMENTS_API_KEY?.trim()
    if (!apiKey) {
      throw new Error(
        'Payments are not configured yet. Add DODO_PAYMENTS_API_KEY in Vercel → Settings → Environment Variables, then redeploy.',
      )
    }

    client = new DodoPayments({
      bearerToken: apiKey,
      webhookKey:
        process.env.DODO_PAYMENTS_WEBHOOK_SECRET ??
        process.env.DODO_PAYMENTS_WEBHOOK_KEY ??
        null,
      environment:
        process.env.DODO_PAYMENTS_TEST_MODE === 'true' ? 'test_mode' : 'live_mode',
    })
  }
  return client
}

export function getSiteUrl(): string {
  return (
    process.env.VITE_SITE_URL?.replace(/\/$/, '') ||
    process.env.SITE_URL?.replace(/\/$/, '') ||
    'https://www.limansa.com'
  )
}
