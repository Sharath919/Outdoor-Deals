import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase'
import SiteHeader from '@/components/SiteHeader'

export const dynamic = 'force-dynamic'

export default async function WatchConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  let productName = 'this product'
  let articleSlug: string | null = null

  if (token) {
    const supabase = createServerSupabase()
    if (supabase) {
      const { data } = await supabase
        .from('price_watches')
        .select('product_name, article_slug')
        .eq('confirm_token', token)
        .maybeSingle()

      if (data) {
        productName = data.product_name
        articleSlug = data.article_slug
      }
    }
  }

  return (
    <div className="guide-page watch-page">
      <SiteHeader />
      <main className="watch-main">
        <h1>You&apos;re watching {productName}</h1>
        <p>
          We&apos;ll email you when the price drops at least 5%.
        </p>
        {articleSlug ? (
          <p>
            <Link href={`/guides/${articleSlug}`} className="btn">
              Back to the guide
            </Link>
          </p>
        ) : (
          <p>
            <Link href="/guides" className="btn">
              Browse guides
            </Link>
          </p>
        )}
      </main>
    </div>
  )
}
