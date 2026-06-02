export {
  SSR_PATHS,
  ARTICLE_PATH_PREFIX,
  GUIDES_INDEX_PATH,
  HOME_PATH,
  isArticleSsrPath,
  isGuidesIndexSsrPath,
  isHomeSsrPath,
} from './slugs'

import { isArticleSsrPath, isGuidesIndexSsrPath, isHomeSsrPath } from './slugs'

export function isSsrPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, '') || '/'
  if (isHomeSsrPath(normalized)) return true
  if (isGuidesIndexSsrPath(normalized)) return true
  if (isArticleSsrPath(normalized)) return true
  return false
}

export { SITE_OG_IMAGE, SITE_URL, siteUrl } from '@/config/site'
