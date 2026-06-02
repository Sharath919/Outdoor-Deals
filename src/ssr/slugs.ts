export const HOME_PATH = '/'
export const GUIDES_INDEX_PATH = '/guides'
export const ARTICLE_PATH_PREFIX = '/guides/'

export const SSR_PATHS: string[] = [HOME_PATH, GUIDES_INDEX_PATH]

export type SsrSlug = string

export function isHomeSsrPath(pathname: string): boolean {
  return pathname === HOME_PATH || pathname === ''
}

export function isGuidesIndexSsrPath(pathname: string): boolean {
  const n = pathname.replace(/\/$/, '') || '/'
  return n === GUIDES_INDEX_PATH
}

export function isArticleSsrPath(pathname: string): boolean {
  const n = pathname.replace(/\/$/, '') || '/'
  if (!n.startsWith(ARTICLE_PATH_PREFIX)) return false
  const slug = n.slice(ARTICLE_PATH_PREFIX.length)
  return slug.length > 0 && !slug.includes('/')
}
