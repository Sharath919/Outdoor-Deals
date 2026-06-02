/** Gear categories for guides, filters, and article metadata. */

export const OUTDOOR_CATEGORY_OPTIONS = [
  { value: '', label: 'Select category…' },
  { value: 'camping', label: 'Camping' },
  { value: 'hiking', label: 'Hiking' },
  { value: 'backpacking', label: 'Backpacking' },
  { value: 'climbing', label: 'Climbing' },
  { value: 'fishing', label: 'Fishing' },
  { value: 'cycling', label: 'Cycling' },
  { value: 'winter-sports', label: 'Winter sports' },
  { value: 'footwear', label: 'Footwear' },
  { value: 'sleep-systems', label: 'Sleep systems' },
  { value: 'cooking', label: 'Camp cooking' },
  { value: 'general-gear', label: 'General gear' },
] as const

export const OUTDOOR_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  OUTDOOR_CATEGORY_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
)

export function outdoorCategoryLabel(slug: string | null | undefined): string {
  if (!slug) return ''
  return OUTDOOR_CATEGORY_LABELS[slug] ?? slug.replace(/-/g, ' ')
}
