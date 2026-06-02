'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { checkIsAdmin } from '@/lib/checkAdmin'

export default function AdminRoute({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let mounted = true

    async function verifyAdmin() {
      if (authLoading) return

      if (!user) {
        if (mounted) {
          setChecking(false)
          setIsAdmin(false)
        }
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      const activeUser = session?.user ?? user
      const admin = await checkIsAdmin(activeUser.id, activeUser.email)

      if (!mounted) return
      setIsAdmin(admin)
      setChecking(false)
    }

    verifyAdmin()
    return () => {
      mounted = false
    }
  }, [user, authLoading])

  useEffect(() => {
    if (!authLoading && !checking && !user) {
      router.replace('/login')
    }
    if (!authLoading && !checking && user && !isAdmin) {
      router.replace('/')
    }
  }, [authLoading, checking, user, isAdmin, router])

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a1a]">
        <span className="text-sm tracking-[0.2em] text-[#c9a84c]/50">LOADING…</span>
      </div>
    )
  }

  if (!user || !isAdmin) return null

  return <>{children}</>
}
