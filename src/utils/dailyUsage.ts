export const DAILY_USAGE_CHANGED = 'limansa:daily-usage-changed'
export const BEGIN_READING_EVENT = 'limansa:begin-reading'

export function getLocalToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getTodayUsageKey() {
  return `limansa_daily_readings_${getLocalToday()}`
}

export function getGuestReadingsUsedToday(): number {
  return parseInt(localStorage.getItem(getTodayUsageKey()) || '0', 10)
}

export function notifyDailyUsageChanged() {
  window.dispatchEvent(new CustomEvent(DAILY_USAGE_CHANGED))
}
