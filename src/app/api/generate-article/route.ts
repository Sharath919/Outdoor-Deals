import { corsHeaders, handlePost } from '@/lib/server/generate-article'

export const maxDuration = 180
export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new Response('ok', { headers: corsHeaders })
}

export async function POST(request: Request) {
  return handlePost(request)
}
