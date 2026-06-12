const RESEND_API = 'https://api.resend.com/emails'

export async function sendEmail(input: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.ALERT_FROM_EMAIL?.trim() ?? 'GearAndSteer Alerts <alerts@mail.gearandsteer.com>'

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured')
  }

  const response = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Resend API error ${response.status}: ${body}`)
  }
}

export function emailFooter(unsubscribeUrl: string, extra?: string): string {
  return `
    <p style="margin:32px 0 0;font-size:12px;color:#888;line-height:1.5;">
      ${extra ?? ''}
      <a href="${unsubscribeUrl}" style="color:#888;">Unsubscribe</a>
    </p>`
}
