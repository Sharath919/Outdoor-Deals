import type { HeadEntryOptions } from 'unhead/types'

/** Replace shell/index.html SEO tags so preview hosts never win over production URLs. */
export const SEO_HEAD_OPTIONS: HeadEntryOptions = {
  tagDuplicateStrategy: 'replace',
}
