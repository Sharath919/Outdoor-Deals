import type { Metadata } from 'next'
import { Toaster } from '@/components/ui/sonner'
import { Providers } from '@/components/Providers'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Outdoor Deals',
    template: '%s | Outdoor Deals',
  },
  description: 'Outdoor gear guides, budget roundups, and smart product picks.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
          <Toaster position="bottom-center" />
        </Providers>
      </body>
    </html>
  )
}
