import { useEffect, useState } from 'react'
import { readers } from '@/data/readers'
import { supabase } from '@/lib/supabase'

export interface ActivePersona {
  id: string
  name: string
  emoji: string
  description: string
}

const fallbackPersona: ActivePersona = {
  id: readers[0].id,
  name: readers[0].name,
  emoji: readers[0].emoji,
  description: readers[0].description,
}

interface DbPersonaRow {
  id: string
  name: string
  emoji: string
  description: string
}

export function useActivePersona(): ActivePersona {
  const [persona, setPersona] = useState<ActivePersona>(fallbackPersona)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data, error } = await supabase
        .from('personas')
        .select('id, name, emoji, description')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .limit(1)

      if (cancelled) return

      if (!error && data?.length) {
        const row = data[0] as DbPersonaRow
        setPersona({
          id: row.id,
          name: row.name,
          emoji: row.emoji,
          description: row.description,
        })
        return
      }

      const fallback = await supabase
        .from('personas')
        .select('id, name, emoji, description')
        .order('id')
        .limit(1)

      if (cancelled || fallback.error || !fallback.data?.length) return

      const row = fallback.data[0] as DbPersonaRow
      setPersona({
        id: row.id,
        name: row.name,
        emoji: row.emoji,
        description: row.description,
      })
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return persona
}
