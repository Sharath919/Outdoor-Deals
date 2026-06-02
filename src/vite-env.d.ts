/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string
  readonly NEXT_PUBLIC_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  __staticRouterHydrationData?: {
    loaderData?: Record<string, unknown>
    errors?: Record<string, unknown> | null
  }
}
