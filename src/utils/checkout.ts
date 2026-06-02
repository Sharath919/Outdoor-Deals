import { supabase } from '@/lib/supabase'
import { getActiveDiscountCodes } from '@/utils/welcomeDiscount'

export type CheckoutPaymentType = 'subscription' | 'one_time'
export type CheckoutBillingInterval = 'monthly' | 'annual'

export async function startCheckout(
  planId: string,
  paymentType: CheckoutPaymentType,
  billingInterval: CheckoutBillingInterval = 'monthly',
  options?: { discount_codes?: string[] },
): Promise<{ checkout_url: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('Sign in to continue to checkout')
  }

  const discountCodes = options?.discount_codes ?? getActiveDiscountCodes()

  const res = await fetch('/api/create-checkout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plan_id: planId,
      payment_type: paymentType,
      billing_interval: billingInterval,
      ...(discountCodes.length > 0 ? { discount_codes: discountCodes } : {}),
    }),
  })

  const raw = await res.text()
  let data: { checkout_url?: string; error?: string } = {}
  try {
    data = raw ? (JSON.parse(raw) as typeof data) : {}
  } catch {
    console.error('[checkout] non-JSON response:', res.status, raw.slice(0, 300))
  }

  if (!res.ok || !data.checkout_url) {
    throw new Error(
      data.error ??
        (raw && !raw.startsWith('{') ? raw.slice(0, 200) : undefined) ??
        `Checkout failed (${res.status})`,
    )
  }

  return { checkout_url: data.checkout_url }
}
