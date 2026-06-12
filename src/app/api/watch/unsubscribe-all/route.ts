import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: { token?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const token = body.token?.trim()
  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const { data: watch } = await supabase
    .from('price_watches')
    .select('email')
    .eq('unsubscribe_token', token)
    .maybeSingle()

  if (!watch?.email) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  await supabase
    .from('price_watches')
    .update({ status: 'unsubscribed' })
    .eq('email', watch.email)
    .in('status', ['active', 'pending_confirm', 'notified'])

  return NextResponse.json({ status: 'unsubscribed_all' })
}
