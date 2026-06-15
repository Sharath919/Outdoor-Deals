<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">

  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html lang="en">
      <head>
        <title>XML Sitemap — GearAndSteer</title>
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
          <h1>XML Sitemap — GearAndSteer</h1>
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
          GearAndSteer · gearandsteer.com · Sitemap generated at build time
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

</xsl:stylesheet>