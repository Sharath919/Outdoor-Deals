import {
  buildUrlsetXml,
  SITEMAP_CACHE_CONTROL,
  STATIC_SITEMAP_ROUTES,
} from '@/lib/server/sitemap-xml'

export const revalidate = 3600

export async function GET() {
  return new Response(buildUrlsetXml(STATIC_SITEMAP_ROUTES, false), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': SITEMAP_CACHE_CONTROL,
    },
  })
}
