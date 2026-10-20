import { useCallback, useEffect, useState } from 'react'
import { errorText } from './api'

// Load one remote value for a screen: on mount (and when `key` changes), and again on pull-to-refresh.
// State is only set from the promise's callbacks, never synchronously in the effect.
// `key` null means "do not load" (signed out); the last value is kept until the key changes.

export function useRemote<T>(key: string | null, fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchNow = useCallback(
    (onDone?: () => void) => {
      let alive = true
      fetcher().then(
        (d) => {
          if (!alive) return
          setData(d)
          setError(null)
          onDone?.()
        },
        (e: unknown) => {
          if (!alive) return
          setError(errorText(e))
          onDone?.()
        },
      )
      return () => {
        alive = false
      }
    },
    // The fetcher is read fresh on every key change; callers pass inline functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )

  useEffect(() => {
    if (key == null) return
    return fetchNow()
  }, [key, fetchNow])

  const refresh = useCallback(() => {
    if (key == null) return
    setRefreshing(true)
    fetchNow(() => setRefreshing(false))
  }, [key, fetchNow])

  return { data, error, refreshing, refresh }
}
