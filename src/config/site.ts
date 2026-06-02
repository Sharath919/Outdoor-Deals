/** Fallback when VITE_SITE_URL is unset. */
const DEFAULT_SITE_URL = 'https://outdoordeals.com'

function normalizeSiteOrigin(raw: string | undefined): string {
  const trimmed = raw?.trim().replace(/\/$/, '')
  return trimmed || DEFAULT_SITE_URL
}

function resolveSiteOrigin(): string {
  if (typeof process !== 'undefined' && process.env) {
    const fromNode =
      process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VITE_SITE_URL
    if (fromNode) return normalizeSiteOrigin(fromNode)
  }
  return DEFAULT_SITE_URL
}

export const SITE_URL = resolveSiteOrigin()

export const SITE_OG_IMAGE = `${SITE_URL}/og/default.jpg`

export function siteUrl(path = ''): string {
  if (!path || path === '/') return `${SITE_URL}/`
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${SITE_URL}${normalized}`
}

export function canonicalFromPathname(pathname: string): string {
  const path = pathname || '/'
  const trimmed = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
  return siteUrl(trimmed || '/')
}

export function resolveShareImageUrl(url: string | null | undefined): string {
  if (!url?.trim()) return SITE_OG_IMAGE
  const value = url.trim()
  if (value.startsWith('/')) return `${SITE_URL}${value}`
  return value
}
