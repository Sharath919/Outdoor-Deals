'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const authError = searchParams.get('error')
    if (authError) setError(decodeURIComponent(authError))
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: loginError } = await login(email, password)
    setLoading(false)
    if (loginError) {
      setError(loginError)
    } else {
      router.replace('/admin')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#f0f4f0]">
      <div className="w-full max-w-md rounded-2xl bg-white border border-[#1a2e1a]/10 px-8 py-10 shadow-sm">
        <Link href="/" className="text-[#2d5a27] font-semibold text-lg">
          Outdoor Deals
        </Link>
        <h1 className="mt-6 text-2xl font-bold text-[#1a2e1a]">Admin sign in</h1>
        <p className="mt-1 text-sm text-[#1a2e1a]/60">Publishing schedule &amp; article machine</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[#1a2e1a]/20 px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[#1a2e1a]/20 px-3 py-2"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#2d5a27] text-white py-2.5 font-medium hover:bg-[#234a1f] disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function Login() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f0f4f0]" />}>
      <LoginForm />
    </Suspense>
  )
}
