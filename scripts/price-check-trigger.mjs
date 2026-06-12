#!/usr/bin/env node
/**
 * Railway cron entrypoint — POST /api/cron/price-check with CRON_SECRET.
 * Schedule: daily at 11:00 UTC.
 */

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://gearandsteer.com').replace(/\/$/, '')
const cronSecret = process.env.CRON_SECRET

if (!cronSecret) {
  console.error('CRON_SECRET is not set')
  process.exit(1)
}

const url = `${siteUrl}/api/cron/price-check`

const response = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${cronSecret}` },
})

const body = await response.text()
console.log(`[price-check-trigger] ${response.status}`, body)

if (!response.ok) {
  process.exit(1)
}
