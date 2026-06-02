import { supabase } from '@/lib/supabase'

export type ShareReadingPayload = {
  reading_id?: string
  question: string
  spread_type: string
  reader_persona: string
  cards_drawn: unknown
  reading_text: string
  mode?: string
}

export async function publishReadingShare(
  payload: ShareReadingPayload,
): Promise<{ url: string; share_token: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }

  const res = await fetch('/api/share-reading', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  const data = (await res.json()) as {
    share_token?: string
    url?: string
    error?: string
  }

  if (!res.ok || !data.share_token || !data.url) {
    throw new Error(data.error ?? 'Failed to create share link')
  }

  return { url: data.url, share_token: data.share_token }
}
