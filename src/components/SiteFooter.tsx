import Link from 'next/link'
import { AMAZON_ASSOCIATES_DISCLOSURE, EDITORIAL_SITE_DOMAIN } from '@/config/editorial'

export default function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="guide-footer site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link href="/" className="logo">
            Gear<span>AndSteer</span>
          </Link>
          <p className="site-footer-disclosure">{AMAZON_ASSOCIATES_DISCLOSURE}</p>
        </div>

        <div className="site-footer-meta">
          <nav className="site-footer-links" aria-label="Footer">
            <Link href="/guides">Guides</Link>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Use</Link>
          </nav>
          <p className="site-footer-copy">
            &copy; {EDITORIAL_SITE_DOMAIN} {year}
          </p>
        </div>
      </div>
    </footer>
  )
}
