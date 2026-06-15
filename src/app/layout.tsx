import type { Metadata } from 'next'
import Script from 'next/script'
import { Toaster } from '@/components/ui/sonner'
import { Providers } from '@/components/Providers'
import { publicEnvScript, readPublicEnvFromProcess } from '@/lib/publicEnv'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'GearAndSteer',
    template: '%s | GearAndSteer',
  },
  description: 'Outdoor gear guides, budget roundups, and smart product picks.',
  verification: {
    other: {
      'msvalidate.01': 'F266E1E0DE817DB3C843EEAF9AB2887F',
    },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const publicEnv = readPublicEnvFromProcess()

  return (
    <html lang="en">
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-RHSZMYBHS0"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-RHSZMYBHS0');
          `}
        </Script>
      </head>
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
