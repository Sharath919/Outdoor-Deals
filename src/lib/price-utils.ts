/** Parse a dollar midpoint from strings like "$45", "$45–$60", or "45.99". */
export function parsePriceMidpoint(priceRange: string | null | undefined): number | null {
  if (!priceRange?.trim()) return null
  const numbers = priceRange.replace(/,/g, '').match(/\d+(?:\.\d{2})?/g)
  if (!numbers?.length) return null
  const vals = numbers.map(Number).filter((n) => n > 0)
  if (!vals.length) return null
  if (vals.length === 1) return vals[0]
  return Math.round(((vals[0] + vals[vals.length - 1]) / 2) * 100) / 100
}

export function extractPriceFromDisplayAmount(displayAmount: string | null | undefined): number | null {
  if (!displayAmount?.trim()) return null
  const match = displayAmount.replace(/,/g, '').match(/\d+(?:\.\d{2})?/)
  if (!match) return null
  const value = parseFloat(match[0])
  return value > 0 ? value : null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim())
}
