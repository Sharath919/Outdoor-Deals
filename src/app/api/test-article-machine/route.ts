import { handleTestArticleMachine } from '@/lib/server/test-article-machine'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handleTestArticleMachine(request)
}

export async function POST(request: Request) {
  return handleTestArticleMachine(request)
}

export async function OPTIONS(request: Request) {
  return handleTestArticleMachine(request)
}
