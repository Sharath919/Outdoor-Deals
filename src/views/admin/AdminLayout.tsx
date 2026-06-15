'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { ADMIN_NAV } from '@/lib/admin'

const PAGE_TITLES: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/schedule': 'Publishing Schedule',
  '/admin/articles': 'Articles',
  '/admin/products': 'Products',
  '/admin/settings/amazon-affiliate': 'Amazon Affiliate',
  '/admin/settings/article-machine': 'Article Machine',
  '/admin/analytics/api-usage': 'API Usage',
  '/admin/analytics/price-alerts': 'Price Alerts',
  '/admin/system': 'System',
}

function pageTitle(pathname: string) {
  if (pathname === '/admin/articles/new') return 'New Article'
  if (pathname.match(/^\/admin\/articles\/[^/]+\/edit$/)) return 'Edit Article'
  return PAGE_TITLES[pathname] ?? 'Admin'
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, logout } = useAuth()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const email = profile?.email ?? user?.email ?? ''
  const title = pageTitle(pathname)

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed md:sticky top-0 left-0 z-50 h-screen w-60 flex flex-col shrink-0 transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        style={{ background: '#0d0d1f', borderRight: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="px-5 py-5 border-b border-white/10">
          <p className="text-sm font-semibold text-[#c9a84c] tracking-wide">🏕️ Outdoor Deals Admin</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {ADMIN_NAV.map(({ icon, label, path }) => {
            const active =
              path === '/admin' ? pathname === '/admin' : pathname === path || pathname.startsWith(`${path}/`)
            return (
              <Link
                key={path}
                href={path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm no-underline transition-colors ${
                  active
                    ? 'text-[#c9a84c] border-l-2 border-[#c9a84c] bg-[#c9a84c]/10'
                    : 'text-foreground/60 border-l-2 border-transparent hover:text-foreground/90 hover:bg-white/5'
                }`}
              >
                <span>{icon}</span>
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <p className="text-xs text-foreground/40 truncate mb-2">{email}</p>
          <button
            type="button"
            onClick={() => logout()}
            className="w-full text-xs py-2 rounded-lg border border-white/15 text-foreground/60 hover:text-foreground hover:border-[#c9a84c]/40 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 md:px-8 py-4 border-b border-white/10"
          style={{ background: '#0a0a1a' }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="md:hidden text-foreground/70"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          </div>
          <Link href="/" className="text-sm text-[#c9a84c] no-underline hover:opacity-80">
            View Site →
          </Link>
        </header>

        <main className="flex-1 p-4 md:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
