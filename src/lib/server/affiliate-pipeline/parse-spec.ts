import type { ArticleProductSpec, ArticleSpec } from './types'

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim()
}

function parseSpecList(ulHtml: string): {
  specs: Record<string, string>
  pros: string[]
  cons: string[]
  price_range?: string
} {
  const specs: Record<string, string> = {}
  const pros: string[] = []
  const cons: string[] = []
  let price_range: string | undefined

  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi
  let match: RegExpExecArray | null
  while ((match = liRe.exec(ulHtml)) !== null) {
    const labelMatch = match[1].match(/<strong\b[^>]*>([^<]+):<\/strong>\s*([\s\S]*)/i)
    if (!labelMatch) continue
    const label = labelMatch[1].trim().toLowerCase()
    const value = stripHtml(labelMatch[2])
    if (label === 'best for') {
      pros.push(...value.split(/,\s*/).filter(Boolean))
    } else if (label === 'not ideal for') {
      cons.push(...value.split(/,\s*/).filter(Boolean))
    } else if (label === 'price') {
      price_range = value
    } else {
      specs[label.replace(/\s+/g, '_')] = value
    }
  }

  return { specs, pros, cons, price_range }
}

function extractAsinFromHref(href: string): string | null {
  const dp = href.match(/\/dp\/([A-Z0-9]{10})/i)
  if (dp) return dp[1].toUpperCase()
  const gp = href.match(/\/gp\/product\/([A-Z0-9]{10})/i)
  if (gp) return gp[1].toUpperCase()
  return null
}

function parseProductHeading(raw: string): { name: string; tagline: string } {
  const text = stripHtml(raw)
  const parts = text.split(/\s*[—–-]\s*/)
  if (parts.length >= 2) {
    return { name: parts[0].trim(), tagline: parts.slice(1).join(' — ').trim() }
  }
  return { name: text, tagline: '' }
}

function isProductHeading(text: string): boolean {
  if (!/—|–|-/.test(text)) return false
  if (/worth it\?|difference between|how long|reddit|lumens|faq/i.test(text)) return false
  return true
}

function parseProductBlock(sectionHtml: string, headingRaw: string): ArticleProductSpec {
  const { name, tagline } = parseProductHeading(headingRaw)
  const ulMatch = sectionHtml.match(/<ul\b[\s\S]*?<\/ul>/i)
  const { specs, pros, cons, price_range } = parseSpecList(ulMatch?.[0] ?? '')

  const affiliateMatch = sectionHtml.match(/<a\b[^>]*href="([^"]*)"[^>]*class="affiliate-link"[^>]*>/i)
    ?? sectionHtml.match(/<a\b[^>]*class="affiliate-link"[^>]*href="([^"]*)"[^>]*>/i)
  const asin = affiliateMatch ? extractAsinFromHref(affiliateMatch[1]) : null

  let body = sectionHtml
    .replace(/<ul\b[\s\S]*?<\/ul>/i, '')
    .replace(/<a\b[^>]*class="affiliate-link"[^>]*>[\s\S]*?<\/a>/i, '')
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_, inner) => {
      const text = stripHtml(inner)
      if (/limitation|downside|tradeoff|catch|honest/i.test(text)) return ''
      return `<p>${inner}</p>`
    })
    .trim()

  const bottomMatch = sectionHtml.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)
  let bottom_line: string | undefined
  if (bottomMatch) {
    for (const p of [...bottomMatch].reverse()) {
      if (/limitation|downside|tradeoff|catch|honest/i.test(stripHtml(p))) {
        bottom_line = stripHtml(p)
        break
      }
    }
  }

  return {
    asin: asin ?? '',
    name,
    tagline,
    award_label: tagline,
    specs,
    pros,
    cons,
    body: body.replace(/<\/?p[^>]*>/gi, '\n\n').trim(),
    bottom_line,
    price_range,
    affiliate_url: affiliateMatch?.[1],
  }
}

export function parseHtmlToArticleSpec(html: string, meta: Partial<ArticleSpec> = {}): ArticleSpec {
  let working = html.trim()

  const tableMatch = working.match(/<table\b[\s\S]*?<\/table>/i)
  if (tableMatch) {
    working = working.replace(tableMatch[0], '')
    working = working.replace(/<h2\b[^>]*>\s*[^<]*(?:quick comparison|comparison table)[^<]*<\/h2>\s*/i, '')
  }

  const firstH2 = working.search(/<h2\b/i)
  const introHtml = firstH2 === -1 ? working : working.slice(0, firstH2)
  const afterIntro = firstH2 === -1 ? '' : working.slice(firstH2)

  const intro = introHtml
    .replace(/<\/?p[^>]*>/gi, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const h3Matches: Array<{ index: number; length: number; heading: string }> = []
  const h3Re = /<h3\b[^>]*>([\s\S]*?)<\/h3>/gi
  let h3Match: RegExpExecArray | null
  while ((h3Match = h3Re.exec(afterIntro)) !== null) {
    const heading = h3Match[1]
    if (isProductHeading(stripHtml(heading))) {
      h3Matches.push({ index: h3Match.index, length: h3Match[0].length, heading })
    }
  }

  let buyers_guide = ''
  let tail_html = ''
  const products: ArticleProductSpec[] = []

  if (h3Matches.length === 0) {
    tail_html = afterIntro
  } else {
    const buyersEnd = h3Matches[0].index
    buyers_guide = afterIntro.slice(0, buyersEnd).replace(/^<h2[^>]*>/i, '## ').replace(/<\/h2>/i, '\n\n')
    buyers_guide = buyers_guide
      .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n')
      .replace(/<\/?p[^>]*>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    h3Matches.forEach((h3, i) => {
      const sectionStart = h3.index + h3.length
      const nextStart = h3Matches[i + 1]?.index ?? afterIntro.length
      const sectionHtml = afterIntro.slice(sectionStart, nextStart)
      products.push(parseProductBlock(sectionHtml, h3.heading))
    })

    const lastProductEnd = h3Matches[h3Matches.length - 1].index + h3Matches[h3Matches.length - 1].length
    const afterLastH3 = afterIntro.slice(lastProductEnd)
    const nextH2 = afterLastH3.search(/<h2\b/i)
    if (nextH2 !== -1) {
      tail_html = afterLastH3.slice(nextH2)
    }
  }

  return {
    ...meta,
    intro: meta.intro ?? intro,
    buyers_guide: meta.buyers_guide ?? buyers_guide,
    products: meta.products?.length ? meta.products : products,
    tail_html: meta.tail_html ?? tail_html,
  }
}

export function mergeJsonProducts(
  htmlSpec: ArticleSpec,
  articleJson: Record<string, unknown>,
): ArticleSpec {
  const jsonProducts = articleJson.products
  if (!Array.isArray(jsonProducts) || jsonProducts.length === 0) return htmlSpec

  const parsedByName = new Map(
    htmlSpec.products.map((p) => [p.name?.toLowerCase() ?? '', p]),
  )

  const merged = jsonProducts.map((raw, index) => {
    const row = raw as Record<string, unknown>
    const asin = String(row.asin ?? '').trim()
    const name = String(row.name ?? row.title ?? '').trim()
    const htmlProduct = parsedByName.get(name.toLowerCase())

    return {
      asin: asin || htmlProduct?.asin || '',
      name: name || htmlProduct?.name,
      award_label: String(row.award_label ?? htmlProduct?.award_label ?? ''),
      award_color: String(row.award_color ?? htmlProduct?.award_color ?? (index === 0 ? 'gold' : index === 1 ? 'versatile' : 'value')),
      tagline: String(row.tagline ?? htmlProduct?.tagline ?? ''),
      best_for: String(row.best_for ?? htmlProduct?.best_for ?? ''),
      specs: (row.specs as Record<string, string>) ?? htmlProduct?.specs ?? {},
      pros: (row.pros as string[]) ?? htmlProduct?.pros ?? [],
      cons: (row.cons as string[]) ?? htmlProduct?.cons ?? [],
      body: String(row.body ?? htmlProduct?.body ?? ''),
      bottom_line: String(row.bottom_line ?? htmlProduct?.bottom_line ?? ''),
      image_url: String(row.image_url ?? htmlProduct?.image_url ?? ''),
      price_range: String(row.price_range ?? htmlProduct?.price_range ?? ''),
      affiliate_url: String(row.affiliate_url ?? htmlProduct?.affiliate_url ?? ''),
    } satisfies ArticleProductSpec
  })

  return { ...htmlSpec, products: merged }
}

export function buildSpecFromClaudeOutput(
  contentHtml: string,
  articleJson: Record<string, unknown>,
): ArticleSpec {
  const meta: Partial<ArticleSpec> = {
    slug: String(articleJson.slug ?? ''),
    title: String(articleJson.title ?? ''),
    deck: String(articleJson.meta_description ?? articleJson.deck ?? ''),
    eyebrow: String(articleJson.eyebrow ?? articleJson.category ?? ''),
  }

  const htmlSpec = parseHtmlToArticleSpec(contentHtml, meta)
  return mergeJsonProducts(htmlSpec, articleJson)
}
