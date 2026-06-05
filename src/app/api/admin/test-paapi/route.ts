import { corsHeaders, handleTestPaapi } from '@/lib/server/test-paapi'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return handleTestPaapi(request)
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
