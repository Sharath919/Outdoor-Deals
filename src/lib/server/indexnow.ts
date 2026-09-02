import { SITE_URL, siteUrl } from '@/config/site'

/**
 * Public IndexNow key, also hosted at `/{key}.txt`.
 * Override with INDEXNOW_KEY if you rotate the key file.
 */
export const DEFAULT_INDEXNOW_KEY = '07b184b7f982446ead3725386eb81f37'

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

function getIndexNowKey(): string | null {
  const key = (process.env.INDEXNOW_KEY || DEFAULT_INDEXNOW_KEY).trim()
  return key || null
}

export function guideUrlForSlug(slug: string): string {
  return siteUrl(`/guides/${slug}`)
}

/**
 * Notify Bing and other IndexNow engines that URLs changed.
 * Never throws — publishing must succeed even if IndexNow is down.
 */
export async function submitToIndexNow(urls: string[]): Promise<void> {
  const key = getIndexNowKey()
  if (!key) return

  const unique = [...new Set(urls.map((url) => url.trim()).filter(Boolean))]
  if (unique.length === 0) return

  let host: string
  try {
    host = new URL(SITE_URL).host
  } catch {
    console.warn('[indexnow] invalid SITE_URL, skipping')
    return
  }

  const body = {
    host,
    key,
    keyLocation: `${SITE_URL}/${key}.txt`,
    urlList: unique,
  }

  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[indexnow] submit failed ${res.status}:`, text.slice(0, 300))
      return
    }

    console.log(`[indexnow] submitted ${unique.length} url(s)`)
  } catch (err) {
    console.warn('[indexnow] submit error:', err instanceof Error ? err.message : err)
  }
}

export async function submitGuideToIndexNow(slug?: string | null): Promise<void> {
  const trimmed = slug?.trim()
  if (!trimmed) return
  await submitToIndexNow([guideUrlForSlug(trimmed)])
}
