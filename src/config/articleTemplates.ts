/** Valid article template_type slugs for scheduling and category admin. */
export const ARTICLE_TEMPLATE_TYPES = [
  'as-a-person',
  'as-feelings',
  'as-intentions',
  'yes-or-no',
  'as-advice',
  'as-no-contact',
  'as-reconciliation',
  'as-love-outcome',
  'as-situation',
  'as-past',
  'as-future',
  'as-obstacle',
  'as-action',
  'as-career-advice',
  'does-he-miss-me',
  'will-he-contact-me',
  'as-how-someone-sees-you',
  'as-what-someone-thinks-of-you',
  'as-what-someone-wants',
  'as-what-someone-wants-from-you',
] as const

export type ArticleTemplateSlug = (typeof ARTICLE_TEMPLATE_TYPES)[number]
