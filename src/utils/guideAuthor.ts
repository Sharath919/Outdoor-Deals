import type { Article } from '@/types/article'

const DEFAULT_AUTHOR = 'GearAndSteer Team'
const LEGACY_AUTHOR_NAMES = new Set(['Outdoor Deals Team', 'Outdoor Deals'])

export function resolveAuthorDisplayName(
  article: Pick<Article, 'display_name' | 'author_name'>,
): string {
  if (article.display_name?.trim()) return article.display_name.trim()
  const author = article.author_name?.trim()
  if (author && !author.includes('@') && !LEGACY_AUTHOR_NAMES.has(author)) return author
  return DEFAULT_AUTHOR
}
