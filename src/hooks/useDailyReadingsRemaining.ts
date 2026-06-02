import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { fetchTierConfig, getUserLimit } from '@/hooks/useTierConfig'
import { UNLIMITED_CREDITS } from '@/lib/dodoPlans'
import {
  DAILY_USAGE_CHANGED,
  getGuestReadingsUsedToday,
  getTodayUsageKey,
  getLocalToday,
} from '@/utils/dailyUsage'

export type DailyReadingsState = {
  loading: boolean
  isPaid: boolean
  isUnlimited: boolean
  remaining: number
  limit: number
  planName: string
}

export function useDailyReadingsRemaining(): DailyReadingsState {
  const { user, tier, profile, loading: authLoading } = useAuth()
  const [state, setState] = useState<DailyReadingsState>({
    loading: true,
    isPaid: false,
    isUnlimited: false,
    remaining: 3,
    limit: 3,
    planName: 'Free',
  })
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    const onUsageChanged = () => refresh()
    const onFocus = () => refresh()
    const onStorage = (e: StorageEvent) => {
      if (e.key === getTodayUsageKey() || e.key === null) refresh()
    }

    window.addEventListener(DAILY_USAGE_CHANGED, onUsageChanged)
    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onFocus)

    return () => {
      window.removeEventListener(DAILY_USAGE_CHANGED, onUsageChanged)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refresh])

  useEffect(() => {
    if (authLoading) return

    let cancelled = false

    async function load() {
      const tierConfig = await fetchTierConfig()
      if (cancelled) return

      const userTier = tier || 'free'
      const limit = getUserLimit(userTier, 'daily_readings', tierConfig)
      const planName = tierConfig[userTier]?.display_name ?? 'Free'
      const credits = profile?.credits ?? 0
      const subActive = profile?.subscription_status === 'active'
      const isPaidTier = userTier !== 'free' || subActive
      const isUnlimited =
        limit >= 999 || credits >= UNLIMITED_CREDITS || (isPaidTier && userTier !== 'free')

      if (isUnlimited) {
        setState({
          loading: false,
          isPaid: isPaidTier,
          isUnlimited: true,
          remaining: limit >= 999 ? 999 : limit,
          limit,
          planName,
        })
        return
      }

      let used = 0
      if (user) {
        const today = getLocalToday()
        const { data } = await supabase
          .from('daily_usage')
          .select('readings_count')
          .eq('user_id', user.id)
          .eq('date', today)
          .maybeSingle()
        used = data?.readings_count ?? 0
      } else {
        used = getGuestReadingsUsedToday()
      }

      if (cancelled) return

      setState({
        loading: false,
        isPaid: false,
        isUnlimited: false,
        remaining: Math.max(0, limit - used),
        limit,
        planName,
      })
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [user?.id, tier, profile?.credits, profile?.subscription_status, authLoading, refreshKey])

  return state
}
