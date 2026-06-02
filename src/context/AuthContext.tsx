import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, type Profile, type Tier } from '../lib/supabase'

interface AuthContextValue {
  user: User | null
  session: Session | null
  profile: Profile | null
  tier: Tier
  loading: boolean
  login: (email: string, password: string) => Promise<{ error: string | null }>
  signup: (
    email: string,
    password: string,
    name: string,
  ) => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>
  loginWithGoogle: () => Promise<{ error: string | null }>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function authRedirectUrl() {
  if (typeof window === 'undefined') return '/auth/callback'
  return `${window.location.origin}/auth/callback`
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(() => typeof window !== 'undefined')

  const tier: Tier = (profile?.tier as Tier) ?? 'free'

  async function ensureProfile(authUser: User): Promise<Profile | null> {
    const displayName =
      (authUser.user_metadata?.full_name as string | undefined) ||
      (authUser.user_metadata?.name as string | undefined) ||
      null

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: authUser.id,
        name: displayName,
        email: authUser.email ?? '',
        tier: 'free',
      })
      .select('*')
      .single()

    if (error) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()
      return (existing as Profile) ?? null
    }

    return data as Profile
  }

  async function fetchProfile(authUser: User): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return ensureProfile(authUser)
      }
      console.error('[auth] profile fetch failed:', error.message)
      return null
    }

    return data as Profile
  }

  async function loadUserProfile(authUser: User | null) {
    if (!authUser) {
      setProfile(null)
      return
    }
    const p = await fetchProfile(authUser)
    setProfile(p)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    let mounted = true

    async function initSession() {
      const { data: { session: initialSession }, error } = await supabase.auth.getSession()
      if (!mounted) return

      if (error) {
        console.error('[auth] getSession failed:', error.message)
      }

      setSession(initialSession)
      setUser(initialSession?.user ?? null)

      if (initialSession?.user) {
        await loadUserProfile(initialSession.user)
      } else {
        setProfile(null)
      }

      if (mounted) setLoading(false)
    }

    initSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Avoid async deadlocks inside the auth listener (Supabase recommendation)
      setTimeout(async () => {
        if (!mounted) return

        setSession(nextSession)
        setUser(nextSession?.user ?? null)

        if (event === 'SIGNED_OUT' || !nextSession?.user) {
          setProfile(null)
          return
        }

        await loadUserProfile(nextSession.user)
      }, 0)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      if (error.message.toLowerCase().includes('email not confirmed')) {
        return {
          error:
            'Please confirm your email before signing in. Check your inbox for the confirmation link.',
        }
      }
      return { error: error.message }
    }

    if (!data.session) {
      return { error: 'Sign in failed. Please try again.' }
    }

    return { error: null }
  }

  async function signup(email: string, password: string, name: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, name },
        emailRedirectTo: authRedirectUrl(),
      },
    })

    if (error) return { error: error.message }

    if (!data.session) {
      return { error: null, needsEmailConfirmation: true }
    }

    return { error: null }
  }

  async function loginWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirectUrl() },
    })
    return { error: error?.message ?? null }
  }

  async function logout() {
    setUser(null)
    setSession(null)
    setProfile(null)
    await supabase.auth.signOut()
  }

  async function refreshProfile() {
    if (user) await loadUserProfile(user)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        tier,
        loading,
        login,
        signup,
        loginWithGoogle,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
