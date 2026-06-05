export type PublishArticleResponse = {
  success?: boolean
  article_id?: string
  slug?: string
  hydration_skipped?: boolean
  hydration_success?: boolean
  products_linked?: number
  warnings?: string[]
  error?: string
}

export async function publishArticleWithHydration(params: {
  articleId: string
  existingPublishedAt?: string | null
  accessToken: string
  signal?: AbortSignal
}): Promise<{ ok: boolean; data: PublishArticleResponse; status: number }> {
  const res = await fetch('/api/admin/publish-article', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({
      article_id: params.articleId,
      existing_published_at: params.existingPublishedAt ?? null,
    }),
    signal: params.signal,
  })

  const data = (await res.json().catch(() => ({}))) as PublishArticleResponse
  return { ok: res.ok, data, status: res.status }
}
