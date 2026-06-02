export const WELCOME_DISCOUNT_CODE = 'WELCOME25'
export const WELCOME_SHOWN_KEY = 'limansa_welcome_shown'
export const WELCOME_EXPIRES_KEY = 'limansa_welcome_expires_at'
export const DISCOUNT_CODE_KEY = 'limansa_discount_code'

const OFFER_DURATION_MS = 10 * 60 * 1000

export function hasWelcomeOfferExpired(): boolean {
  const expires = localStorage.getItem(WELCOME_EXPIRES_KEY)
  if (!expires) return true
  return Date.now() > parseInt(expires, 10)
}

export function wasWelcomeShown(): boolean {
  return localStorage.getItem(WELCOME_SHOWN_KEY) === '1'
}

export function markWelcomeShown(): void {
  localStorage.setItem(WELCOME_SHOWN_KEY, '1')
  const expiresAt = Date.now() + OFFER_DURATION_MS
  localStorage.setItem(WELCOME_EXPIRES_KEY, String(expiresAt))
  localStorage.setItem(DISCOUNT_CODE_KEY, WELCOME_DISCOUNT_CODE)
}

export function getWelcomeExpiresAt(): number | null {
  const raw = localStorage.getItem(WELCOME_EXPIRES_KEY)
  if (!raw) return null
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

export function getActiveDiscountCodes(): string[] {
  if (wasWelcomeShown() && !hasWelcomeOfferExpired()) {
    return [WELCOME_DISCOUNT_CODE]
  }
  return []
}

export function formatCountdown(msRemaining: number): string {
  const totalSec = Math.max(0, Math.floor(msRemaining / 1000))
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}
