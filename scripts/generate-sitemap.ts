/**
 * Ensure static sitemap files are not present under public/.
 * Those files shadow the dynamic App Router routes and go stale between deploys.
 * Live sitemaps are served from src/app/sitemap*.xml/route.ts (Supabase-backed).
 */

import * as fs from 'fs'
import * as path from 'path'

const STATIC_SITEMAP_FILES = [
  'sitemap.xml',
  'sitemap-pages.xml',
  'sitemap-posts.xml',
  'sitemap.xsl',
]

function main() {
  const publicDir = path.resolve(process.cwd(), 'public')
  let removed = 0

  for (const filename of STATIC_SITEMAP_FILES) {
    const outputPath = path.join(publicDir, filename)
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath)
      console.log(`[sitemap] Removed public/${filename} (dynamic route will serve this path)`)
      removed += 1
    }
  }

  if (removed === 0) {
    console.log('[sitemap] No static sitemap files in public/ — dynamic routes are source of truth')
  }
}

main()
