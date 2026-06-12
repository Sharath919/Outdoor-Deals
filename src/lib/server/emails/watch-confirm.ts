import { sendEmail, emailFooter } from '@/lib/server/emails/resend'

export async function sendWatchConfirmEmail(input: {
  to: string
  productName: string
  priceAtWatch: number
  confirmUrl: string
  unsubscribeUrl: string
}): Promise<void> {
  const price = input.priceAtWatch.toFixed(2)

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;">
      <p style="font-size:16px;line-height:1.6;">
        Confirm to start watching <strong>${escapeHtml(input.productName)}</strong> — current price $${price}.
        We'll email you when it drops at least 5%.
      </p>
      <p style="margin:28px 0;">
        <a href="${input.confirmUrl}"
           style="display:inline-block;background:#2d4a2b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;">
          Confirm price watch
        </a>
      </p>
      ${emailFooter(input.unsubscribeUrl, "Didn't request this? Ignore this email. ")}
    </div>`

  await sendEmail({
    to: input.to,
    subject: `Confirm your price watch: ${input.productName}`,
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
