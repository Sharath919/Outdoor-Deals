'use client'

import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { useAuth } from '@/context/AuthContext'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="text-sm text-foreground/50">LOADING…</span>
      </div>
    )
  }

  if (!user) return null
  return <>{children}</>
}
