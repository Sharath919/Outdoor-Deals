import type { SupabaseClient } from '@supabase/supabase-js'
import { getItemsByAsinsBatched, type PaapiItem } from '@/lib/server/affiliate-pipeline/paapi-client'
import { readAmazonAffiliateServerConfig } from '@/lib/server/amazon-affiliate-config'
import { extractPriceFromDisplayAmount } from '@/lib/price-utils'
import { sendPriceDropAlertEmail } from '@/lib/server/emails/price-drop-alert'
import { SITE_URL } from '@/config/site'

const MAX_ASINS_PER_RUN = 4000
const BATCH_SIZE = 10
const BATCH_DELAY_MS = 1200
const FAILURE_THRESHOLD = 7
const EXPIRY_DAYS = 180

type TrackedProduct = {
  asin: string
  product_name: string
  image_url: string | null
  current_price: number | null
  previous_price: number | null
  consecutive_failures: number
}

type ActiveWatch = {
  id: string
  email: string
  asin: string
  product_name: string
  price_at_watch: number
  article_slug: string | null
  unsubscribe_token: string
}

function extractPriceFromItem(item: PaapiItem): number | null {
  const offers = item.Offers as { Listings?: Array<{ Price?: { DisplayAmount?: string } }> } | undefined
  const offersV2 = item.OffersV2 as
    | { Listings?: Array<{ Price?: { DisplayAmount?: string; Money?: { DisplayAmount?: string } } }> }
    | undefined

  const displayAmount =
    offers?.Listings?.[0]?.Price?.DisplayAmount ??
    offersV2?.Listings?.[0]?.Price?.DisplayAmount ??
    offersV2?.Listings?.[0]?.Price?.Money?.DisplayAmount ??
    null

  return extractPriceFromDisplayAmount(displayAmount)
}

function isDueForPolling(row: {
  priority: number
  last_checked: string | null
}): boolean {
  const now = Date.now()
  if (row.priority === 1) return true
  if (!row.last_checked) return true

  const last = new Date(row.last_checked).getTime()
  const daysSince = (now - last) / (1000 * 60 * 60 * 24)

  if (row.priority === 2) return daysSince >= 3
  if (row.priority === 3) return daysSince >= 7
  return false
}

export type PriceCheckSummary = {
  polled: number
  priceChanges: number
  alertsSent: number
  failures: number
}

export async function runPriceCheckCron(supabase: SupabaseClient): Promise<PriceCheckSummary> {
  const summary: PriceCheckSummary = { polled: 0, priceChanges: 0, alertsSent: 0, failures: 0 }

  const { data: allActive, error: selectError } = await supabase
    .from('tracked_products')
    .select('asin, product_name, image_url, current_price, previous_price, priority, last_checked, consecutive_failures')
    .eq('active', true)
    .order('last_checked', { ascending: true, nullsFirst: true })

  if (selectError) {
    console.error('[price-check] select tracked_products failed:', selectError.message)
    return summary
  }

  const due = (allActive ?? [])
    .filter((row) => isDueForPolling(row))
    .slice(0, MAX_ASINS_PER_RUN)

  if (due.length === 0) {
    await runExpiryPass(supabase)
    return summary
  }

  const config = await readAmazonAffiliateServerConfig()
  const asins = due.map((r) => r.asin)
  const batchResults = await getItemsByAsinsBatched(asins, config, {
    batchSize: BATCH_SIZE,
    delayMs: BATCH_DELAY_MS,
  })

  summary.polled = batchResults.length
  const updatedAsins = new Set<string>()
  const trackedByAsin = new Map(due.map((r) => [r.asin, r as TrackedProduct]))

  for (const result of batchResults) {
    const tracked = trackedByAsin.get(result.asin)
    if (!tracked) continue

    const now = new Date().toISOString()
    const newPrice = result.item ? extractPriceFromItem(result.item) : null

    if (newPrice != null) {
      const currentPrice = tracked.current_price != null ? Number(tracked.current_price) : null
      const priceChanged = currentPrice == null || Math.abs(currentPrice - newPrice) >= 0.01

      const update: Record<string, unknown> = {
        last_checked: now,
        consecutive_failures: 0,
        current_price: newPrice,
      }

      if (priceChanged) {
        if (currentPrice != null) update.previous_price = currentPrice
        await supabase.from('price_history').insert({ asin: result.asin, price: newPrice })
        summary.priceChanges++
        updatedAsins.add(result.asin)
      }

      await supabase.from('tracked_products').update(update).eq('asin', result.asin)
    } else {
      const failures = (tracked.consecutive_failures ?? 0) + 1
      summary.failures++

      const update: Record<string, unknown> = {
        last_checked: now,
        consecutive_failures: failures,
      }
      if (failures >= FAILURE_THRESHOLD) update.active = false

      await supabase.from('tracked_products').update(update).eq('asin', result.asin)
    }
  }

  if (updatedAsins.size > 0) {
    const alertsSent = await evaluateAndSendAlerts(supabase, [...updatedAsins])
    summary.alertsSent = alertsSent
  }

  await runExpiryPass(supabase)

  console.log('[price-check] summary:', summary)
  return summary
}

async function evaluateAndSendAlerts(
  supabase: SupabaseClient,
  updatedAsins: string[],
): Promise<number> {
  let sent = 0

  const { data: watches } = await supabase
    .from('price_watches')
    .select('id, email, asin, product_name, price_at_watch, article_slug, unsubscribe_token')
    .eq('status', 'active')
    .in('asin', updatedAsins)

  if (!watches?.length) return 0

  for (const watch of watches as ActiveWatch[]) {
    const { data: product } = await supabase
      .from('tracked_products')
      .select('current_price, image_url, product_name')
      .eq('asin', watch.asin)
      .maybeSingle()

    if (!product?.current_price) continue

    const currentPrice = Number(product.current_price)
    const priceAtWatch = Number(watch.price_at_watch)
    const dropPercent = ((priceAtWatch - currentPrice) / priceAtWatch) * 100
    const dropAbsolute = priceAtWatch - currentPrice

    if (dropPercent < 5 || dropAbsolute < 5) continue

    const dealUrl = `${SITE_URL}/deals/${watch.asin}?utm_source=email&utm_medium=alert&utm_campaign=price_drop`
    const unsubscribeUrl = `${SITE_URL}/api/watch/unsubscribe?token=${watch.unsubscribe_token}`

    try {
      await sendPriceDropAlertEmail({
        to: watch.email,
        productName: product.product_name ?? watch.product_name,
        imageUrl: product.image_url,
        priceAtWatch,
        currentPrice,
        dropPercent: Math.round(dropPercent),
        dealUrl,
        unsubscribeUrl,
      })

      await supabase
        .from('price_watches')
        .update({ status: 'notified', notified_at: new Date().toISOString() })
        .eq('id', watch.id)

      sent++
    } catch (err) {
      console.error(`[price-check] alert email failed for watch ${watch.id}:`, err)
    }
  }

  return sent
}

async function runExpiryPass(supabase: SupabaseClient): Promise<void> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - EXPIRY_DAYS)

  await supabase
    .from('price_watches')
    .update({ status: 'expired' })
    .in('status', ['active', 'pending_confirm'])
    .lt('created_at', cutoff.toISOString())

  const { data: priorityOne } = await supabase
    .from('tracked_products')
    .select('asin')
    .eq('priority', 1)
    .eq('active', true)

  for (const row of priorityOne ?? []) {
    const { count } = await supabase
      .from('price_watches')
      .select('id', { count: 'exact', head: true })
      .eq('asin', row.asin)
      .eq('status', 'active')

    if (count === 0) {
      await supabase.from('tracked_products').update({ priority: 3 }).eq('asin', row.asin)
    }
  }
}
