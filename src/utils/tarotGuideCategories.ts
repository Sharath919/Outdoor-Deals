import { supabase } from '@/lib/supabase'
import type { TarotGuideCategory } from '@/types/tarotGuideCategory'

export async function getAllTarotGuideCategories(): Promise<TarotGuideCategory[]> {
  const { data, error } = await supabase
    .from('tarot_guide_categories')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[tarotGuideCategories] getAll:', error.message)
    return []
  }
  return (data ?? []) as TarotGuideCategory[]
}

export async function getVisibleTarotGuideCategories(): Promise<TarotGuideCategory[]> {
  const { data, error } = await supabase
    .from('tarot_guide_categories')
    .select('*')
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[tarotGuideCategories] getVisible:', error.message)
    return []
  }
  return (data ?? []) as TarotGuideCategory[]
}

export async function getTarotGuideCategoryByTemplateType(
  templateType: string,
): Promise<TarotGuideCategory | null> {
  const { data, error } = await supabase
    .from('tarot_guide_categories')
    .select('*')
    .eq('template_type', templateType)
    .maybeSingle()

  if (error) {
    console.error('[tarotGuideCategories] getByTemplate:', error.message)
    return null
  }
  return (data as TarotGuideCategory | null) ?? null
}

export async function getPublishedTemplateCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('articles')
    .select('template_type')
    .eq('status', 'published')

  if (error) {
    console.error('[tarotGuideCategories] template counts:', error.message)
    return {}
  }

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    const key = String(row.template_type ?? '').trim()
    if (!key) continue
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

export function filterVisibleCategoryTabs(
  categories: TarotGuideCategory[],
  countsByTemplate: Record<string, number>,
): TarotGuideCategory[] {
  return categories.filter(
    (cat) => cat.is_coming_soon || (countsByTemplate[cat.template_type] ?? 0) > 0,
  )
}

export function isTemplateCategorySlug(
  slug: string,
  categories: TarotGuideCategory[],
): TarotGuideCategory | null {
  return categories.find((c) => c.template_type === slug && c.is_visible) ?? null
}
