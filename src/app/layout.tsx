import type { Metadata } from 'next'
import { Toaster } from '@/components/ui/sonner'
import { Providers } from '@/components/Providers'
import { publicEnvScript, readPublicEnvFromProcess } from '@/lib/publicEnv'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Outdoor Deals',
    template: '%s | Outdoor Deals',
  },
  description: 'Outdoor gear guides, budget roundups, and smart product picks.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const publicEnv = readPublicEnvFromProcess()

  return (
    <html lang="en">
      <body>
        <script
          dangerouslySetInnerHTML={{ __html: publicEnvScript(publicEnv) }}
        />
        <Providers>
          {children}
          <Toaster position="bottom-center" />
        </Providers>
      </body>
    </html>
  )
}
