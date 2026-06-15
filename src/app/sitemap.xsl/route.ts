import { SITEMAP_CACHE_CONTROL, SITEMAP_XSL_CONTENT } from '@/lib/server/sitemap-xml'

export const revalidate = 86400

export async function GET() {
  return new Response(SITEMAP_XSL_CONTENT, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': SITEMAP_CACHE_CONTROL,
    },
  })
}
