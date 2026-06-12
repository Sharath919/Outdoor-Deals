import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'
import { runPriceCheckCron } from '@/lib/server/price-check-cron'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const cronSecret = process.env.CRON_SECRET?.trim()

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const summary = await runPriceCheckCron(supabase)
  return NextResponse.json(summary)
}
