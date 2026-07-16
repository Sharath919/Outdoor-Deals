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
  title: 'Terms of Use',
  description: `The terms and conditions for using ${EDITORIAL_SITE_DOMAIN}, including affiliate disclosures and limitations of liability.`,
  alternates: { canonical: `${SITE_URL}/terms` },
}

export default function TermsPage() {
  const lastUpdated = 'July 2026'

  return (
    <div className="guide-page">
      <SiteHeader />

      <div className="guides-breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden> / </span>
        <span>Terms of Use</span>
      </div>

      <article className="article-body">
        <header className="article-header" style={{ paddingTop: 0 }}>
          <span className="eyebrow">Legal</span>
          <h1 className="article-title">Terms of Use</h1>
          <p className="deck">Last updated: {lastUpdated}</p>
        </header>

        <div className="article-content">
          <p>
            Welcome to {EDITORIAL_SITE_DOMAIN}. By accessing or using this website, you agree to these
            Terms of Use. If you do not agree, please do not use the site.
          </p>

          <h2>Editorial independence</h2>
          <p>
            Our guides, roundups, and recommendations reflect our own research and opinions. We are not
            directed by any manufacturer or retailer on what to recommend. Product availability, pricing,
            specifications, and features change frequently and are outside our control.
          </p>

          <h2>Affiliate disclosure</h2>
          <p>{AMAZON_ASSOCIATES_DISCLOSURE}</p>
          <p>
            Some links on this site are affiliate links. If you click one and make a purchase, we may
            earn a commission at no additional cost to you. This does not influence the price you pay or
            our editorial recommendations.
          </p>

          <h2>No warranties</h2>
          <p>
            All content is provided &ldquo;as is&rdquo; for general informational purposes only. While we
            work to keep information accurate and current, we make no warranties or guarantees about the
            completeness, reliability, or accuracy of any content, including prices, specifications, and
            availability. Always confirm current details on the retailer&rsquo;s website before purchasing.
          </p>

          <h2>Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, {EDITORIAL_SITE_DOMAIN} and its contributors will not
            be liable for any loss or damage arising from your use of the site or reliance on its content,
            or from any purchase you make through third-party retailers.
          </p>

          <h2>Third-party links</h2>
          <p>
            Our site contains links to third-party websites, including Amazon and other retailers. We are
            not responsible for the content, products, or practices of those sites, which are governed by
            their own terms and policies.
          </p>

          <h2>Intellectual property</h2>
          <p>
            The content on this site, including text, layout, and original graphics, is owned by
            {' '}{EDITORIAL_SITE_DOMAIN} unless otherwise noted. You may not reproduce or redistribute our
            content without permission. Product names, images, and trademarks belong to their respective
            owners.
          </p>

          <h2>Changes to these terms</h2>
          <p>
            We may update these Terms of Use at any time. Continued use of the site after changes are
            posted constitutes acceptance of the revised terms.
          </p>

          <h2>Contact us</h2>
          <p>
            Questions about these terms? Email us at{' '}
            <a href={`mailto:${EDITORIAL_CONTACT_EMAIL}`}>{EDITORIAL_CONTACT_EMAIL}</a>.
          </p>
        </div>
      </article>

      <SiteFooter />
    </div>
  )
}
