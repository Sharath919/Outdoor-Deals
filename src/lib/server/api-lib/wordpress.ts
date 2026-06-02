/** Server copy — keep in sync with src/lib/wordpress.ts */

export interface WordPressPublishParams {
  wpSiteUrl: string
  wpUsername: string
  wpAppPassword: string
  title: string
  slug: string
  contentHtml: string
  metaDescription: string
  seoTitle: string
  categoryId?: number
  heroImageBuffer?: Buffer
  heroImageFilename?: string
  status?: 'publish' | 'draft'
}

export interface WordPressCategory {
  id: number
  name: string
  slug: string
}

function normalizeSiteUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function basicAuthHeader(username: string, appPassword: string): string {
  return `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`
}

function prepareWpContent(contentHtml: string): string {
  const html = contentHtml.trim()
  if (!html) return html
  if (html.includes('<!-- wp:')) return html
  return `<!-- wp:freeform -->\n${html}\n<!-- /wp:freeform -->`
}

export async function publishToWordPress(
  params: WordPressPublishParams,
): Promise<{ wp_post_id: number; wp_post_url: string }> {
  const {
    wpSiteUrl,
    wpUsername,
    wpAppPassword,
    title,
    slug,
    contentHtml,
    metaDescription,
    seoTitle,
    categoryId,
    heroImageBuffer,
    heroImageFilename,
    status = 'publish',
  } = params

  const siteUrl = normalizeSiteUrl(wpSiteUrl)
  const auth = basicAuthHeader(wpUsername, wpAppPassword)

  let featuredMediaId: number | null = null

  if (heroImageBuffer && heroImageFilename) {
    try {
      const mediaRes = await fetch(`${siteUrl}/wp-json/wp/v2/media`, {
        method: 'POST',
        headers: {
          Authorization: auth,
          'Content-Disposition': `attachment; filename="${heroImageFilename}"`,
          'Content-Type': 'image/jpeg',
        },
        body: new Uint8Array(heroImageBuffer),
      })

      if (mediaRes.ok) {
        const mediaData = (await mediaRes.json()) as { id?: number }
        featuredMediaId = mediaData.id ?? null
      } else {
        console.warn('[wordpress] media upload failed:', await mediaRes.text())
      }
    } catch (err) {
      console.warn('[wordpress] media upload error:', err)
    }
  }

  const postBody: Record<string, unknown> = {
    title,
    slug,
    content: prepareWpContent(contentHtml),
    status,
    excerpt: metaDescription,
    meta: {
      _yoast_wpseo_title: seoTitle,
      _yoast_wpseo_metadesc: metaDescription,
    },
  }

  if (categoryId) postBody.categories = [categoryId]
  if (featuredMediaId) postBody.featured_media = featuredMediaId

  console.log('Content length:', contentHtml?.length)

  const postRes = await fetch(`${siteUrl}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(postBody),
  })

  if (!postRes.ok) {
    const errorText = await postRes.text()
    throw new Error(`WordPress publish failed: ${errorText}`)
  }

  const postData = (await postRes.json()) as { id?: number; link?: string; content?: unknown }

  console.log('WP post response:', JSON.stringify(postData))

  if (!postData.id) {
    throw new Error('WordPress returned no post ID')
  }

  return {
    wp_post_id: postData.id,
    wp_post_url: postData.link || `${siteUrl}/${slug}`,
  }
}

export async function testWordPressConnection(
  wpSiteUrl: string,
  wpUsername: string,
  wpAppPassword: string,
): Promise<{ success: boolean; username?: string; error?: string }> {
  try {
    const siteUrl = normalizeSiteUrl(wpSiteUrl)
    const auth = basicAuthHeader(wpUsername, wpAppPassword)

    const res = await fetch(`${siteUrl}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: auth },
    })

    if (res.ok) {
      const user = (await res.json()) as { name?: string; slug?: string }
      return { success: true, username: user.name || user.slug || wpUsername }
    }

    return {
      success: false,
      error: `Authentication failed: ${res.status}`,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function getWordPressCategories(
  wpSiteUrl: string,
  wpUsername: string,
  wpAppPassword: string,
): Promise<WordPressCategory[]> {
  const siteUrl = normalizeSiteUrl(wpSiteUrl)
  const auth = basicAuthHeader(wpUsername, wpAppPassword)

  const res = await fetch(`${siteUrl}/wp-json/wp/v2/categories?per_page=100`, {
    headers: { Authorization: auth },
  })

  if (!res.ok) return []
  return res.json() as Promise<WordPressCategory[]>
}
