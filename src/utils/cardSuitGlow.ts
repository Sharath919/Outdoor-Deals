/** Suit-based glow colours for tarot card overlays (Sharp + CSS). */

export function getCardSuitGlowFilter(cardId: string | null): string {
  const id = (cardId || '').toLowerCase()
  if (id.includes('-of-cups')) return 'drop-shadow(0 8px 24px rgba(201, 168, 76, 0.5))'
  if (id.includes('-of-wands')) return 'drop-shadow(0 8px 24px rgba(234, 88, 12, 0.5))'
  if (id.includes('-of-swords')) return 'drop-shadow(0 8px 24px rgba(148, 163, 184, 0.5))'
  if (id.includes('-of-pentacles')) return 'drop-shadow(0 8px 24px rgba(34, 197, 94, 0.4))'
  return 'drop-shadow(0 8px 24px rgba(139, 92, 246, 0.4))'
}

export function getCardSuitGlowBoxShadow(cardId: string | null): string {
  const id = (cardId || '').toLowerCase()
  if (id.includes('-of-cups')) return '0 0 30px rgba(201, 168, 76, 0.3)'
  if (id.includes('-of-wands')) return '0 0 30px rgba(234, 88, 12, 0.3)'
  if (id.includes('-of-swords')) return '0 0 30px rgba(148, 163, 184, 0.3)'
  if (id.includes('-of-pentacles')) return '0 0 30px rgba(34, 197, 94, 0.25)'
  return '0 0 30px rgba(139, 92, 246, 0.3)'
}

/** Primary glow colour for CTA card image box-shadow. */
export function getCardGlow(cardId: string | null): string {
  if (!cardId) return 'rgba(139, 92, 246, 0.35)'
  const id = cardId.toLowerCase()
  if (id.includes('-of-cups')) return 'rgba(201, 168, 76, 0.4)'
  if (id.includes('-of-wands')) return 'rgba(234, 88, 12, 0.4)'
  if (id.includes('-of-swords')) return 'rgba(148, 163, 184, 0.4)'
  if (id.includes('-of-pentacles')) return 'rgba(34, 197, 94, 0.3)'
  return 'rgba(139, 92, 246, 0.35)'
}
