import type { SupabaseClient } from '@supabase/supabase-js'
import type { HydratedProduct } from '@/lib/server/affiliate-pipeline/types'

/** Upsert ASINs from publish/hydration — never overwrite priority or current_price on conflict. */
export async function upsertTrackedProductsFromHydration(
  supabase: SupabaseClient,
  products: HydratedProduct[],
): Promise<void> {
  for (const product of products) {
    const asinRaw = product.asin?.trim() ?? ''
    if (!/^[A-Z0-9]{10}$/i.test(asinRaw)) continue

    const asin = asinRaw.toUpperCase()
    const productName = product.name?.trim() || asin
    const imageUrl = product.image_url ?? null

    const { data: existing } = await supabase
      .from('tracked_products')
      .select('asin')
      .eq('asin', asin)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('tracked_products')
        .update({ product_name: productName, image_url: imageUrl })
        .eq('asin', asin)
    } else {
      await supabase.from('tracked_products').insert({
        asin,
        product_name: productName,
        image_url: imageUrl,
        priority: 3,
        active: true,
      })
    }
  }
}

export async function upsertTrackedProductForWatch(
  supabase: SupabaseClient,
  input: {
    asin: string
    productName: string
    imageUrl?: string | null
  },
): Promise<void> {
  const asin = input.asin.trim().toUpperCase()
  const { data: existing } = await supabase
    .from('tracked_products')
    .select('asin, priority')
    .eq('asin', asin)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('tracked_products')
      .update({
        product_name: input.productName,
        image_url: input.imageUrl ?? undefined,
        priority: 1,
        active: true,
      })
      .eq('asin', asin)
  } else {
    await supabase.from('tracked_products').insert({
      asin,
      product_name: input.productName,
      image_url: input.imageUrl ?? null,
      priority: 1,
      active: true,
    })
  }
}
