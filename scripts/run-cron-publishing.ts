/**
 * Run publishing cron — calls Next.js API route.
 */
import 'dotenv/config'

const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.VITE_SITE_URL ||
  `http://localhost:${process.env.PORT || 3000}`
).replace(/\/$/, '')
const secret = process.env.CRON_SECRET || ''

async function main() {
  if (!secret) {
    console.error('CRON_SECRET is required')
    process.exit(1)
  }
  const res = await fetch(`${siteUrl}/api/cron/publishing`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  })
  const body = await res.json().catch(() => ({}))
  console.log(res.status, body)
  if (!res.ok) process.exit(1)
}

main()
