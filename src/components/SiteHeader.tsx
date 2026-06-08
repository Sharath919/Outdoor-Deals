import Link from 'next/link'

type SiteHeaderProps = {
  variant?: 'home' | 'guide'
}

export default function SiteHeader({ variant = 'home' }: SiteHeaderProps) {
  return (
    <nav className="topnav">
      <div className="topnav-inner">
        <Link href="/" className="logo">
          Gear<span>AndSteer</span>
        </Link>
        <div className="nav-links">
          <Link href="/guides">Guides</Link>
          {variant === 'home' && (
            <Link href="/login">Admin</Link>
          )}
        </div>
      </div>
    </nav>
  )
}
