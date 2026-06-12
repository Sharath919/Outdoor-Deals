import { sendEmail, emailFooter } from '@/lib/server/emails/resend'

export async function sendPriceDropAlertEmail(input: {
  to: string
  productName: string
  imageUrl: string | null
  priceAtWatch: number
  currentPrice: number
  dropPercent: number
  dealUrl: string
  unsubscribeUrl: string
}): Promise<void> {
  const was = input.priceAtWatch.toFixed(2)
  const now = input.currentPrice.toFixed(2)
  const imageBlock = input.imageUrl
    ? `<img src="${input.imageUrl}" alt="${escapeHtml(input.productName)}" style="max-width:200px;height:auto;border-radius:8px;margin:0 0 16px;" />`
    : ''

  // Amazon Associates ToS: affiliate/Amazon links must never appear in alert emails.
  // The only CTA links to our /deals page on gearandsteer.com.
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;">
      ${imageBlock}
      <h1 style="font-size:20px;margin:0 0 12px;">${escapeHtml(input.productName)}</h1>
      <p style="font-size:16px;line-height:1.6;">
        was $${was} → now $${now} (−${input.dropPercent}%)
      </p>
      <p style="margin:28px 0;">
        <a href="${input.dealUrl}"
           style="display:inline-block;background:#2d4a2b;color:#fff;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:700;font-size:16px;">
          See the deal →
        </a>
      </p>
      ${emailFooter(input.unsubscribeUrl)}
    </div>`

  await sendEmail({
    to: input.to,
    subject: `Price drop: ${input.productName} is down to $${now}`,
    html,
  })
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
