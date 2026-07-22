/**
 * One-shot: set amazon_associate_tag to gearnsteer-20 and rewrite stored Amazon links.
 * Does not touch Creators API / PAAPI partner tag credentials.
 *
 * Usage: node scripts/rewrite-associate-tag.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const NEW_TAG = 'gearnsteer-20'

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq)
      let value = trimmed.slice(eq + 1)
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // ignore missing .env.local
  }
}

loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

function applyTagToUrl(href) {
  if (!href || typeof href !== 'string') return href
  const raw = href.trim().replace(/&amp;/gi, '&')
  if (new RegExp(`[?&]tag=${NEW_TAG}(?:[&]|$)`, 'i').test(raw) && /amazon\./i.test(raw)) {
    return href
  }
  try {
    const u = new URL(raw)
    if (!/(^|\.)amazon\./i.test(u.hostname)) return href
    if (u.searchParams.get('tag') === NEW_TAG) return href
    u.searchParams.set('tag', NEW_TAG)
    return u.toString()
  } catch {
    if (/[?&]tag=/i.test(raw)) {
      return raw.replace(/([?&]tag=)[^&#"'\s]*/gi, `$1${NEW_TAG}`)
    }
    return href
  }
}

function rewriteText(text) {
  if (typeof text !== 'string' || !text) return text
  // Known previous site tag + any other Amazon tag= values.
  let out = text.replace(/gearandsteer-20/gi, NEW_TAG)
  out = out.replace(
    /(\bhttps?:\/\/(?:www\.)?amazon\.[^\s"'<>]*?[?&]tag=)(?!gearnsteer-20(?:[&"'\s<>]|$))[^&#"'\s<>]*/gi,
    `$1${NEW_TAG}`,
  )
  return out
}

function rewriteHtml(html) {
  return rewriteText(html)
}

function rewriteJsonValue(value) {
  if (typeof value === 'string') return rewriteText(value)
  if (Array.isArray(value)) return value.map(rewriteJsonValue)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = rewriteJsonValue(v)
    return out
  }
  return value
}

async function fetchAll(table, columns) {
  const page = 1000
  const rows = []
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + page - 1)
    if (error) throw new Error(`${table} select: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data ?? []).length < page) break
  }
  return rows
}

async function main() {
  const now = new Date().toISOString()

  const { error: configError } = await supabase.from('ai_config').upsert(
    { key: 'amazon_associate_tag', value: NEW_TAG, updated_at: now },
    { onConflict: 'key' },
  )
  if (configError) throw new Error(`ai_config: ${configError.message}`)
  console.log(`ai_config.amazon_associate_tag → ${NEW_TAG}`)

  const { data: partnerRow } = await supabase
    .from('ai_config')
    .select('value')
    .eq('key', 'amazon_paapi_partner_tag')
    .maybeSingle()
  console.log(
    'Creators API partner tag unchanged:',
    partnerRow?.value ?? '(not set in DB — uses env PAAPI_PARTNER_TAG)',
  )

  const products = await fetchAll('products', 'id, affiliate_url')
  let productsUpdated = 0
  let productsSkipped = 0
  for (const row of products) {
    const next = applyTagToUrl(row.affiliate_url)
    if (next === row.affiliate_url) {
      productsSkipped += 1
      continue
    }
    const { error } = await supabase
      .from('products')
      .update({ affiliate_url: next })
      .eq('id', row.id)
    if (error) throw new Error(`products update ${row.id}: ${error.message}`)
    productsUpdated += 1
  }
  console.log(
    `products updated: ${productsUpdated}, already ok: ${productsSkipped}, total: ${products.length}`,
  )

  const articles = await fetchAll('articles', 'id, content_html, import_json')
  let articlesUpdated = 0
  let articlesSkipped = 0
  for (const row of articles) {
    const nextHtml = rewriteHtml(row.content_html)
    const nextImport =
      row.import_json != null ? rewriteJsonValue(row.import_json) : row.import_json
    const htmlChanged = nextHtml !== row.content_html
    const importChanged = JSON.stringify(nextImport) !== JSON.stringify(row.import_json)
    if (!htmlChanged && !importChanged) {
      articlesSkipped += 1
      continue
    }
    const patch = {}
    if (htmlChanged) patch.content_html = nextHtml
    if (importChanged) patch.import_json = nextImport
    const { error } = await supabase.from('articles').update(patch).eq('id', row.id)
    if (error) throw new Error(`articles update ${row.id}: ${error.message}`)
    articlesUpdated += 1
  }
  console.log(
    `articles updated: ${articlesUpdated}, already ok: ${articlesSkipped}, total: ${articles.length}`,
  )
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
