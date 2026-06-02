'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()
  const [message, setMessage] = useState('SIGNING IN…')

  useEffect(() => {
    let mounted = true

    async function finishWithError(detail: string) {
      if (!mounted) return
      setMessage('SIGN IN FAILED')
      setTimeout(() => {
        router.replace(`/login?error=${encodeURIComponent(detail)}`)
      }, 1200)
    }

    async function handleCallback() {
      const params = new URLSearchParams(window.location.search)
      const oauthError = params.get('error_description') || params.get('error')
      if (oauthError) {
        await finishWithError(oauthError)
        return
      }

      const code = params.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          await finishWithError(error.message)
          return
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        await finishWithError('No session after callback')
        return
      }

      if (mounted) router.replace('/admin')
    }

    void handleCallback()
    return () => {
      mounted = false
    }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f0]">
      <p className="text-sm tracking-widest text-[#2d5a27]/70">{message}</p>
    </div>
  )
}
