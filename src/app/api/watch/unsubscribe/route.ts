import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'
import { SITE_URL } from '@/config/site'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')?.trim()
  if (!token) {
    return NextResponse.redirect(`${SITE_URL}/watch/invalid`)
  }

  const supabase = createServerSupabase()
  if (!supabase) {
    return NextResponse.redirect(`${SITE_URL}/watch/invalid`)
  }

  const { data: watch } = await supabase
    .from('price_watches')
    .select('id')
    .eq('unsubscribe_token', token)
    .maybeSingle()

  if (!watch) {
    return NextResponse.redirect(`${SITE_URL}/watch/invalid`)
  }

  await supabase
    .from('price_watches')
    .update({ status: 'unsubscribed' })
    .eq('id', watch.id)

  return NextResponse.redirect(`${SITE_URL}/watch/unsubscribed?token=${token}`, 302)
}
