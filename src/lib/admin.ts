import { supabase } from './supabase'

export const ADMIN_NAV = [
  { icon: '📊', label: 'Dashboard', path: '/admin' },
  { icon: '🗓️', label: 'Schedule', path: '/admin/schedule' },
  { icon: '📝', label: 'Articles', path: '/admin/articles' },
  { icon: '🏕️', label: 'Products', path: '/admin/products' },
  { icon: '🔗', label: 'Amazon Affiliate', path: '/admin/settings/amazon-affiliate' },
  { icon: '🧠', label: 'Article Machine', path: '/admin/settings/article-machine' },
  { icon: '📉', label: 'API Usage', path: '/admin/analytics/api-usage' },
  { icon: '🔔', label: 'Price Alerts', path: '/admin/analytics/price-alerts' },
  { icon: '🖥️', label: 'System', path: '/admin/system' },
] as const

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function truncate(str: string, len: number) {
  if (str.length <= len) return str
  return `${str.slice(0, len)}…`
}

export function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function tableExists(table: string): Promise<boolean> {
  const { error } = await supabase.from(table).select('*').limit(1)
  if (!error) return true
  if (error.code === 'PGRST205' || error.message.includes('does not exist')) return false
  return false
}
