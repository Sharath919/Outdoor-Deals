import { supabase } from '@/lib/supabase'

export async function activateSubscriptionManual(params: {
  payment_id?: string | null
  subscription_id?: string | null
}): Promise<{
  activated: boolean
  reason?: string
  profile?: {
    tier: string
    credits: number
    subscription_status: string | null
    subscription_plan: string | null
  }
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('Sign in to activate your subscription')
  }

  const payment_id = params.payment_id?.trim() || undefined
  const subscription_id = params.subscription_id?.trim() || undefined

  if (!payment_id && !subscription_id) {
    throw new Error('Missing payment_id or subscription_id from checkout redirect')
  }

  const qs = new URLSearchParams()
  if (payment_id) qs.set('payment_id', payment_id)
  if (subscription_id) qs.set('subscription_id', subscription_id)

  const res = await fetch(`/api/activate-subscription?${qs.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const data = (await res.json()) as {
    activated?: boolean
    reason?: string
    error?: string
    profile?: {
      tier: string
      credits: number
      subscription_status: string | null
      subscription_plan: string | null
    }
  }

  if (!res.ok) {
    throw new Error(data.error ?? data.reason ?? `Activation failed (${res.status})`)
  }

  return {
    activated: !!data.activated,
    reason: data.reason,
    profile: data.profile,
  }
}
