import { buildSitemapIndexXml, SITEMAP_CACHE_CONTROL } from '@/lib/server/sitemap-xml'

export const revalidate = 3600

export async function GET() {
  return new Response(buildSitemapIndexXml(), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': SITEMAP_CACHE_CONTROL,
    },
  })
}
