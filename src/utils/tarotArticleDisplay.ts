import type { Article } from '@/types/article'

export type TarotArticleListItem = Pick<
  Article,
  'id' | 'slug' | 'title' | 'hero_image_url' | 'card_id' | 'template_type' | 'category'
>

export function cardNameFromId(cardId: string | null | undefined): string {
  if (!cardId?.trim()) return ''
  return cardId
    .trim()
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function titleHookFromTitle(title: string): string {
  const colonIdx = title.indexOf(':')
  if (colonIdx === -1) return ''
  return title.slice(colonIdx + 1).trim()
}

export function categoryBadgeLabel(category: string | null | undefined): string {
  if (!category) return 'Tarot'
  return category
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function displayArticleTitle(title: string): string {
  return title.trim()
}
