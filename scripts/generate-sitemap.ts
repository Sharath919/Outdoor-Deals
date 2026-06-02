import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { SITE_URL } from '../src/config/site'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const STATIC_ROUTES = [
  { loc: '/', priority: '1.0', changefreq: 'weekly' as const },
  { loc: '/guides', priority: '0.9', changefreq: 'daily' as const },
]

function urlEntry(loc: string, priority: string, changefreq: string, lastmod?: string) {
  const full = `${SITE_URL}${loc.startsWith('/') ? loc : `/${loc}`}`
  return `  <url>
    <loc>${full}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.warn('[sitemap] Missing Supabase env — static pages only')
  }

  let articleUrls: string[] = []
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data } = await supabase
      .from('articles')
      .select('slug, updated_at')
      .eq('status', 'published')
      .limit(5000)
    articleUrls =
      data?.map((a) =>
        urlEntry(
          `/guides/${a.slug}`,
          '0.8',
          'weekly',
          a.updated_at?.slice(0, 10),
        ),
      ) ?? []
  }

  const staticXml = STATIC_ROUTES.map((r) =>
    urlEntry(r.loc, r.priority, r.changefreq),
  ).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticXml}
${articleUrls.join('\n')}
</urlset>`

  const out = path.join(process.cwd(), 'public', 'sitemap.xml')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, xml)
  console.log(`[sitemap] Wrote ${out} (${STATIC_ROUTES.length + articleUrls.length} URLs)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
