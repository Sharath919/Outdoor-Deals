export function getArticleCardName(title: string): string {
  const fromAs = title.split(' as ')[0]?.trim()
  if (fromAs) return fromAs
  const fromColon = title.split(':')[0]?.trim()
  if (fromColon) return fromColon
  return title.trim()
}

export const LIMANSA_PREFILL_KEY = 'limansa_prefill'

/** Use in questions without doubling "the" (e.g. avoid "I drew the The Moon"). */
export function formatCardForQuestion(cardName: string): string {
  return cardName.trim()
}

export function getPrefillQuestion(cardName: string, template: string): string {
  const card = formatCardForQuestion(cardName)
  const questions: Record<string, string> = {
    'as-a-person': `The person I'm dealing with seems like a ${card} type. What does this mean for my situation with him?`,
    'as-feelings': `I drew ${card} when asking how he feels about me. What does this mean for my situation?`,
    'as-intentions': `I drew ${card} for his intentions toward me. Should I trust this? What should I do?`,
    'yes-or-no': `I drew ${card} for a yes or no question about him. Can you help me understand the full answer?`,
    'as-advice': `I drew ${card} as advice for my situation with him. What exactly should I do next?`,
    'as-no-contact': `I drew ${card} during no contact. Will he reach out, and what should I do?`,
    'as-reconciliation': `I drew ${card} about getting back together with him. What does this mean for reconciliation?`,
    'as-love-outcome': `I drew ${card} about where this relationship is headed. What is the likely outcome?`,
    'as-situation': `I drew ${card} for the current situation between us. What is really going on?`,
    'as-past': `I drew ${card} for what happened between us in the past. How does this affect things now?`,
    'as-future': `I drew ${card} about where things are going with him. What should I expect?`,
    'as-obstacle': `I drew ${card} as the obstacle in my situation with him. How do I work through this?`,
    'as-action': `I drew ${card} as the action I should take with him. What exactly should I do?`,
    'as-career-advice': `I drew ${card} for career advice. What should I focus on next?`,
    'does-he-miss-me': `I drew ${card} asking if he misses me. What does this really mean?`,
    'will-he-contact-me': `I drew ${card} asking if he will contact me. What should I expect?`,
    'as-how-someone-sees-you': `I drew ${card} for how he sees me. What does this mean?`,
    'as-what-someone-thinks-of-you': `I drew ${card} for what he thinks of me. What is he really thinking?`,
    'as-what-someone-wants': `I drew ${card} for what he wants. What does he actually want?`,
    'as-what-someone-wants-from-you': `I drew ${card} for what he wants from me. What should I do?`,
  }
  return (
    questions[template] ||
    `I drew ${card} in my reading. Can you help me understand what it means?`
  )
}

export function consumeLimansaPrefill(): string | null {
  if (typeof window === 'undefined') return null
  const prefill = localStorage.getItem(LIMANSA_PREFILL_KEY)
  if (!prefill) return null
  localStorage.removeItem(LIMANSA_PREFILL_KEY)
  return prefill
}

export function saveLimansaPrefill(question: string): void {
  localStorage.setItem(LIMANSA_PREFILL_KEY, question)
}
