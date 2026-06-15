/**
 * Pre-generate static sitemap files into public/ at build time.
 * Runtime routes in src/app/sitemap*.xml/route.ts also serve the same XML.
 */

import * as fs from 'fs'
import * as path from 'path'
import { SITE_URL } from '../src/config/site'
import {
  buildSitemapIndexXml,
  buildUrlsetXml,
  fetchPublishedArticleUrls,
  SITEMAP_XSL_CONTENT,
  STATIC_SITEMAP_ROUTES,
} from '../src/lib/server/sitemap-xml'

function writeFile(filename: string, content: string): void {
  const outputPath = path.resolve(process.cwd(), `public/${filename}`)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, content, 'utf-8')
  console.log(`[sitemap] Written public/${filename}`)
}

async function main() {
  console.log(`[sitemap] Generating sitemap for ${SITE_URL}...\n`)

  const articleUrls = await fetchPublishedArticleUrls()
  const pageUrls = [...STATIC_SITEMAP_ROUTES]

  writeFile('sitemap.xsl', SITEMAP_XSL_CONTENT)
  writeFile('sitemap.xml', buildSitemapIndexXml())
  writeFile('sitemap-pages.xml', buildUrlsetXml(pageUrls, false))
  writeFile('sitemap-posts.xml', buildUrlsetXml(articleUrls, true))

  const totalImages = articleUrls.reduce((sum, u) => sum + (u.images?.length ?? 0), 0)
  console.log(`
[sitemap] Summary:
   Static pages          : ${pageUrls.length}
   Published guides      : ${articleUrls.length}
   Total images tagged   : ${totalImages}
   Total URLs            : ${pageUrls.length + articleUrls.length}
`)
}

main().catch((err) => {
  console.error('[sitemap] Generation failed:', err)
  process.exit(1)
})
