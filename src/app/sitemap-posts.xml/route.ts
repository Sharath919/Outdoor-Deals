import {
  buildUrlsetXml,
  fetchPublishedArticleUrls,
  SITEMAP_CACHE_CONTROL,
} from '@/lib/server/sitemap-xml'

export const revalidate = 3600

export async function GET() {
  const articleUrls = await fetchPublishedArticleUrls()
  return new Response(buildUrlsetXml(articleUrls, true), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': SITEMAP_CACHE_CONTROL,
    },
  })
}
