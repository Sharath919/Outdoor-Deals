import type { SupabaseClient } from '@supabase/supabase-js'
import type { HydratedProduct } from './types'

function parsePriceCents(priceRange: string | null | undefined): number | null {
  if (!priceRange) return null
  const match = priceRange.replace(/,/g, '').match(/\$?\s*(\d+(?:\.\d{2})?)/)
  if (!match) return null
  return Math.round(parseFloat(match[1]) * 100)
}

export async function linkProductsToArticle(
  supabase: SupabaseClient,
  articleId: string,
  products: HydratedProduct[],
  category: string | null,
): Promise<void> {
  await supabase.from('article_products').delete().eq('article_id', articleId)

  for (let rank = 0; rank < products.length; rank++) {
    const product = products[rank]
    if (!product.affiliate_url?.trim()) continue

    const title = product.name?.trim() || `Product ${product.asin}`
    const asin = product.asin?.trim() || null

    let productId: string | null = null

    if (asin) {
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('asin', asin)
        .maybeSingle()

      if (existing?.id) {
        productId = existing.id
        await supabase
          .from('products')
          .update({
            title,
            image_url: product.image_url,
            affiliate_url: product.affiliate_url,
            category: category ?? undefined,
            last_price_cents: parsePriceCents(product.price_range),
            last_checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', productId)
      }
    }

    if (!productId) {
      const { data: inserted, error } = await supabase
        .from('products')
        .insert({
          asin,
          title,
          image_url: product.image_url,
          affiliate_url: product.affiliate_url,
          category,
          last_price_cents: parsePriceCents(product.price_range),
          last_checked_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (error) {
        console.error('[affiliate-pipeline] product insert failed:', error.message)
        continue
      }
      productId = inserted.id
    }

    await supabase.from('article_products').upsert({
      article_id: articleId,
      product_id: productId,
      rank,
    })
  }
}
