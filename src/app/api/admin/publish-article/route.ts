import { corsHeaders, handlePublishArticle } from '@/lib/server/publish-article'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return handlePublishArticle(request)
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
