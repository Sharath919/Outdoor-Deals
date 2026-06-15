import { createClient } from '@supabase/supabase-js'
import { EDITORIAL_SITE_NAME } from '@/config/editorial'
import { SITE_URL } from '@/config/site'

export interface SitemapImage {
  loc: string
  title?: string
  caption?: string
}

export interface SitemapUrl {
  loc: string
  lastmod?: string
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority: string
  images?: SitemapImage[]
}

interface Article {
  slug: string
  title: string
  updated_at: string
  published_at: string
  hero_image_url: string | null
}

export const STATIC_SITEMAP_ROUTES: SitemapUrl[] = [
  { loc: '/', priority: '1.0', changefreq: 'daily' },
  { loc: '/guides', priority: '0.9', changefreq: 'daily' },
]

const SITE_HOST = new URL(SITE_URL).hostname

export const SITEMAP_XSL_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">

  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html lang="en">
      <head>
        <title>XML Sitemap — ${EDITORIAL_SITE_NAME}</title>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #333; }
          #header { background: #2D4A2B; color: #fff; padding: 24px 32px; }
          #header h1 { font-size: 22px; font-weight: 600; margin-bottom: 6px; }
          #header p { font-size: 13px; opacity: 0.85; line-height: 1.5; }
          #header a { color: #b8d4b5; text-decoration: underline; }
          #content { padding: 24px 32px; max-width: 1200px; }
          .count { margin: 0 0 16px; font-size: 14px; color: #444; }
          .count strong { color: #111; }
          table { width: 100%; border-collapse: collapse; }
          thead tr { background: #2D4A2B; color: #fff; text-align: left; }
          thead th { padding: 10px 14px; font-weight: 500; font-size: 13px; }
          tbody tr:nth-child(even) { background: #f4f7f3; }
          tbody tr:hover { background: #e8efe6; }
          tbody td { padding: 9px 14px; border-bottom: 1px solid #dde5da; font-size: 13px; }
          tbody td a { color: #2D4A2B; text-decoration: none; word-break: break-all; }
          tbody td a:hover { text-decoration: underline; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; background: #e8efe6; color: #2D4A2B; }
          #footer { padding: 16px 32px; font-size: 12px; color: #999; border-top: 1px solid #eee; margin-top: 24px; }
        </style>
      </head>
      <body>
        <div id="header">
          <h1>XML Sitemap — ${EDITORIAL_SITE_NAME}</h1>
          <p>
            Generated automatically on every deploy. Submit to
            <a href="https://search.google.com/search-console" target="_blank">Google Search Console</a>
            and <a href="https://www.bing.com/webmasters" target="_blank">Bing Webmaster Tools</a>.
            Learn more about <a href="https://www.sitemaps.org/" target="_blank">XML Sitemaps</a>.
          </p>
        </div>
        <div id="content">
          <xsl:apply-templates/>
        </div>
        <div id="footer">
          ${EDITORIAL_SITE_NAME} · ${SITE_HOST} · Sitemap generated at build time
        </div>
      </body>
    </html>
  </xsl:template>

  <xsl:template match="sitemap:sitemapindex">
    <p class="count">This Sitemap Index contains <strong><xsl:value-of select="count(sitemap:sitemap)"/></strong> sitemaps.</p>
    <table>
      <thead>
        <tr>
          <th>Sitemap URL</th>
          <th>Last Modified</th>
        </tr>
      </thead>
      <tbody>
        <xsl:for-each select="sitemap:sitemap">
          <tr>
            <td><a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a></td>
            <td><xsl:value-of select="sitemap:lastmod"/></td>
          </tr>
        </xsl:for-each>
      </tbody>
    </table>
  </xsl:template>

  <xsl:template match="sitemap:urlset">
    <p class="count">This sitemap contains <strong><xsl:value-of select="count(sitemap:url)"/></strong> URLs.</p>
    <table>
      <thead>
        <tr>
          <th>URL</th>
          <th>Images</th>
          <th>Last Modified</th>
          <th>Priority</th>
          <th>Change Freq</th>
        </tr>
      </thead>
      <tbody>
        <xsl:for-each select="sitemap:url">
          <tr>
            <td><a href="{sitemap:loc}" target="_blank"><xsl:value-of select="sitemap:loc"/></a></td>
            <td>
              <xsl:if test="count(image:image) &gt; 0">
                <span class="badge"><xsl:value-of select="count(image:image)"/></span>
              </xsl:if>
            </td>
            <td><xsl:value-of select="sitemap:lastmod"/></td>
            <td><xsl:value-of select="sitemap:priority"/></td>
            <td><xsl:value-of select="sitemap:changefreq"/></td>
          </tr>
        </xsl:for-each>
      </tbody>
    </table>
  </xsl:template>

</xsl:stylesheet>`

function getSitemapSupabase() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ''
  )
    .trim()
    .replace(/\/$/, '')
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey)
}

export async function fetchPublishedArticleUrls(): Promise<SitemapUrl[]> {
  const supabase = getSitemapSupabase()
  if (!supabase) return []

  const { data: articles, error } = await supabase
    .from('articles')
    .select('slug, title, updated_at, published_at, hero_image_url')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(5000)

  if (error || !articles?.length) return []

  return (articles as Article[]).map((article) => {
    const images: SitemapImage[] = []

    if (article.hero_image_url) {
      images.push({
        loc: article.hero_image_url,
        title: article.title,
        caption: `${article.title} — ${EDITORIAL_SITE_NAME}`,
      })
    }

    return {
      loc: `/guides/${article.slug}`,
      lastmod: (article.updated_at || article.published_at).split('T')[0],
      changefreq: 'weekly' as const,
      priority: '0.8',
      images: images.length > 0 ? images : undefined,
    }
  })
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildImageTags(images: SitemapImage[]): string {
  return images
    .map(
      (img) => `
    <image:image>
      <image:loc>${escapeXml(img.loc)}</image:loc>${img.title ? `
      <image:title>${escapeXml(img.title)}</image:title>` : ''}${img.caption ? `
      <image:caption>${escapeXml(img.caption)}</image:caption>` : ''}
    </image:image>`,
    )
    .join('')
}

const XSL_PI = `<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>`

export function buildUrlsetXml(urls: SitemapUrl[], includeImages: boolean): string {
  const today = new Date().toISOString().split('T')[0]

  const urlBlocks = urls
    .map(({ loc, lastmod, changefreq, priority, images }) => {
      const imageXml =
        includeImages && images && images.length > 0 ? buildImageTags(images) : ''

      return `  <url>
    <loc>${SITE_URL}${loc}</loc>
    <lastmod>${lastmod ?? today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>${imageXml}
  </url>`
    })
    .join('\n')

  const imageNs = includeImages
    ? `\n  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
${XSL_PI}
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"${imageNs}
  xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
    http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">

${urlBlocks}

</urlset>`
}

export function buildSitemapIndexXml(): string {
  const today = new Date().toISOString().split('T')[0]
  return `<?xml version="1.0" encoding="UTF-8"?>
${XSL_PI}
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${SITE_URL}/sitemap-pages.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITE_URL}/sitemap-posts.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
</sitemapindex>`
}

export const SITEMAP_CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600'
