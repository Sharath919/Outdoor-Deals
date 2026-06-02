/** Article Machine prompt tabs — commercial / outdoor affiliate templates. */

export type ArticleMachinePromptTab = {
  id: string
  configKey: string
  tabLabel: string
  label: string
  saveLabel: string
  templateType: string | null
  testTemplateType: string
}

export const ARTICLE_MACHINE_PROMPT_TABS: ArticleMachinePromptTab[] = [
  {
    id: 'default',
    configKey: 'article_machine_prompt_default',
    tabLabel: 'Default',
    label: 'Default (fallback)',
    saveLabel: 'Default',
    templateType: null,
    testTemplateType: 'roundup-under-budget',
  },
  {
    id: 'roundup-under-budget',
    configKey: 'article_machine_prompt_roundup_under_budget',
    tabLabel: 'Under $X',
    label: 'Best X Under $Y',
    saveLabel: 'Under budget roundup',
    templateType: 'roundup-under-budget',
    testTemplateType: 'roundup-under-budget',
  },
  {
    id: 'best-of-category',
    configKey: 'article_machine_prompt_best_of_category',
    tabLabel: 'Best of',
    label: 'Best [Category] 2026',
    saveLabel: 'Best of category',
    templateType: 'best-of-category',
    testTemplateType: 'best-of-category',
  },
  {
    id: 'comparison',
    configKey: 'article_machine_prompt_comparison',
    tabLabel: 'Vs / Compare',
    label: 'Product A vs B',
    saveLabel: 'Comparison',
    templateType: 'comparison',
    testTemplateType: 'comparison',
  },
  {
    id: 'buying-guide',
    configKey: 'article_machine_prompt_buying_guide',
    tabLabel: 'Buying guide',
    label: 'How to choose X',
    saveLabel: 'Buying guide',
    templateType: 'buying-guide',
    testTemplateType: 'buying-guide',
  },
]

export const ARTICLE_MACHINE_PROMPT_CONFIG_KEYS = [
  ...ARTICLE_MACHINE_PROMPT_TABS.map((t) => t.configKey),
  'article_machine_prompt',
] as const

export const SCHEDULE_TEMPLATE_TYPES = [
  'roundup-under-budget',
  'best-of-category',
  'comparison',
  'buying-guide',
] as const

export type ScheduleTemplateType = (typeof SCHEDULE_TEMPLATE_TYPES)[number]

export const TEMPLATE_HUMAN_NAMES: Record<string, string> = {
  'roundup-under-budget': 'Best picks under a budget',
  'best-of-category': 'Best of category roundup',
  comparison: 'Head-to-head comparison',
  'buying-guide': 'Buying guide',
}

export function countTemplatesUsingDefault(
  prompts: Record<string, string>,
): number {
  return SCHEDULE_TEMPLATE_TYPES.filter((t) => {
    const key = `article_machine_prompt_${t.replace(/-/g, '_')}`
    return !prompts[key]?.trim()
  }).length
}

export function estimatePromptTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function promptKeyBadge(key: string | null | undefined): string {
  if (!key) return 'default'
  return key.replace(/^article_machine_prompt_/, '').replace(/_/g, ' ')
}
