import Link from 'next/link'
import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import {
  AMAZON_ASSOCIATES_DISCLOSURE,
  EDITORIAL_CONTACT_EMAIL,
  EDITORIAL_SITE_DOMAIN,
} from '@/config/editorial'
import { SITE_URL } from '@/config/site'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `How ${EDITORIAL_SITE_DOMAIN} collects, uses, and protects information, including affiliate links and analytics.`,
  alternates: { canonical: `${SITE_URL}/privacy` },
}

export default function PrivacyPage() {
  const lastUpdated = 'July 2026'

  return (
    <div className="guide-page">
      <SiteHeader />

      <div className="guides-breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden> / </span>
        <span>Privacy Policy</span>
      </div>

      <article className="article-body">
        <header className="article-header" style={{ paddingTop: 0 }}>
          <span className="eyebrow">Legal</span>
          <h1 className="article-title">Privacy Policy</h1>
          <p className="deck">Last updated: {lastUpdated}</p>
        </header>

        <div className="article-content">
          <p>
            This Privacy Policy explains how {EDITORIAL_SITE_DOMAIN} (&ldquo;we,&rdquo;
            &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, and safeguards information when you
            visit our website. By using the site, you agree to the practices described here.
          </p>

          <h2>Information we collect</h2>
          <p>
            We aim to collect as little personal information as possible. We do not require you to
            create an account or submit personal details to read our guides. We may collect:
          </p>
          <ul>
            <li>
              <strong>Usage data</strong> — non-identifying information such as pages visited, browser
              type, device type, and referring pages, gathered through analytics tools.
            </li>
            <li>
              <strong>Cookies and similar technologies</strong> — small files used to understand site
              traffic and improve the experience. You can disable cookies in your browser settings.
            </li>
            <li>
              <strong>Information you provide voluntarily</strong> — for example, if you email us or
              sign up for a price-drop or content notification.
            </li>
          </ul>

          <h2>Affiliate links and Amazon</h2>
          <p>{AMAZON_ASSOCIATES_DISCLOSURE}</p>
          <p>
            When you click an affiliate link and make a purchase, the retailer (such as Amazon) may
            set cookies and process your transaction under its own privacy policy. We never see or
            store your payment details. We may earn a commission from qualifying purchases at no extra
            cost to you.
          </p>

          <h2>Analytics and third-party services</h2>
          <p>
            We use third-party analytics and hosting providers to operate the site. These providers
            may process aggregated, non-identifying usage data on our behalf. Amazon and other
            retailers we link to maintain their own privacy policies governing data they collect once
            you leave our site.
          </p>

          <h2>How we use information</h2>
          <ul>
            <li>To operate, maintain, and improve the website and its content.</li>
            <li>To understand which guides and topics are most useful to readers.</li>
            <li>To respond to inquiries you send us.</li>
            <li>To comply with legal obligations and prevent misuse.</li>
          </ul>
          <p>We do not sell your personal information.</p>

          <h2>Your choices</h2>
          <p>
            You can control cookies through your browser, opt out of analytics using available browser
            tools or extensions, and choose not to click affiliate links. If you have contacted us and
            would like your message and details removed, let us know.
          </p>

          <h2>Children&rsquo;s privacy</h2>
          <p>
            Our site is not directed to children under 13, and we do not knowingly collect personal
            information from them.
          </p>

          <h2>Changes to this policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Changes take effect when posted on
            this page, with the &ldquo;last updated&rdquo; date revised accordingly.
          </p>

          <h2>Contact us</h2>
          <p>
            Questions about this policy? Email us at{' '}
            <a href={`mailto:${EDITORIAL_CONTACT_EMAIL}`}>{EDITORIAL_CONTACT_EMAIL}</a>.
          </p>
        </div>
      </article>

      <SiteFooter />
    </div>
  )
}
