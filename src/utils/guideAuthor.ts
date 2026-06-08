import type { Article } from '@/types/article'

const DEFAULT_AUTHOR = 'GearAndSteer Team'

export function resolveAuthorDisplayName(
  article: Pick<Article, 'display_name' | 'author_name'>,
): string {
  if (article.display_name?.trim()) return article.display_name.trim()
  const author = article.author_name?.trim()
  if (author && !author.includes('@')) return author
  return DEFAULT_AUTHOR
}
