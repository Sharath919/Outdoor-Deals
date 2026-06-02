import { corsHeaders, handleHydrateArticle } from '@/lib/server/hydrate-article'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return handleHydrateArticle(request)
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
