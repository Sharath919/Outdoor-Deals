import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'
import { isValidEmail } from '@/lib/price-utils'
import { upsertTrackedProductForWatch } from '@/lib/server/tracked-products'
import { sendWatchConfirmEmail } from '@/lib/server/emails/watch-confirm'
import { SITE_URL } from '@/config/site'

export const dynamic = 'force-dynamic'

const MAX_WATCHES_PER_DAY = 20

export async function POST(request: Request) {
  let body: {
    email?: string
    asin?: string
    productName?: string
    priceAtWatch?: number
    articleSlug?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase() ?? ''
  const asin = body.asin?.trim().toUpperCase() ?? ''
  const productName = body.productName?.trim() ?? ''
  const priceAtWatch = body.priceAtWatch
  const articleSlug = body.articleSlug?.trim() ?? null

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    return NextResponse.json({ error: 'Invalid ASIN' }, { status: 400 })
  }

  if (!productName) {
    return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
  }

  if (typeof priceAtWatch !== 'number' || !Number.isFinite(priceAtWatch) || priceAtWatch <= 0) {
    return NextResponse.json({ error: 'priceAtWatch must be a positive number' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const since = new Date()
  since.setHours(since.getHours() - 24)

  const { count } = await supabase
    .from('price_watches')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .gte('created_at', since.toISOString())

  if ((count ?? 0) >= MAX_WATCHES_PER_DAY) {
    return NextResponse.json({ error: 'Too many watch requests. Try again tomorrow.' }, { status: 429 })
  }

  await upsertTrackedProductForWatch(supabase, { asin, productName })

  const { data: inserted, error: insertError } = await supabase
    .from('price_watches')
    .insert({
      email,
      asin,
      product_name: productName,
      price_at_watch: priceAtWatch,
      article_slug: articleSlug,
      status: 'pending_confirm',
    })
    .select('confirm_token, unsubscribe_token')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ status: 'already_watching' })
    }
    console.error('[watch] insert failed:', insertError.message)
    return NextResponse.json({ error: 'Failed to create watch' }, { status: 500 })
  }

  const confirmUrl = `${SITE_URL}/api/watch/confirm?token=${inserted.confirm_token}`
  const unsubscribeUrl = `${SITE_URL}/api/watch/unsubscribe?token=${inserted.unsubscribe_token}`

  try {
    await sendWatchConfirmEmail({
      to: email,
      productName,
      priceAtWatch,
      confirmUrl,
      unsubscribeUrl,
    })
  } catch (err) {
    console.error('[watch] confirmation email failed:', err)
    return NextResponse.json({ error: 'Failed to send confirmation email' }, { status: 500 })
  }

  return NextResponse.json({ status: 'confirm_sent' })
}
