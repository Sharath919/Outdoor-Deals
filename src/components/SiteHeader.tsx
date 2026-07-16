import Link from 'next/link'
import { NAV_CATEGORIES } from '@/config/outdoorCategories'

export default function SiteHeader() {
  return (
    <nav className="topnav">
      <div className="topnav-inner">
        <Link href="/" className="logo">
          Gear<span>AndSteer</span>
        </Link>
        <div className="nav-links">
          <Link href="/guides">Guides</Link>
          {NAV_CATEGORIES.map((category) => (
            <Link key={category.value} href={`/guides?category=${category.value}`}>
              {category.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
