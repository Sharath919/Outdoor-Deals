import { useEffect } from 'react'
import { preloadCardImages } from '@/utils/cardImages'
import { fetchSpreads } from '@/hooks/useSpreads'
import { fetchTierConfig } from '@/hooks/useTierConfig'

/** Client-only app boot (card preload, config). Safe to skip during SSR. */
export function useClientBoot() {
  useEffect(() => {
    void preloadCardImages()
    void fetchSpreads()
    void fetchTierConfig()
  }, [])
}
