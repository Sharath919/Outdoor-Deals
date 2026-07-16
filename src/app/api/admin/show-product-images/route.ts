import {
  corsHeaders,
  handleGetShowProductImages,
  handleSetShowProductImages,
} from '@/lib/server/show-product-images'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handleGetShowProductImages(request)
}

export async function POST(request: Request) {
  return handleSetShowProductImages(request)
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
