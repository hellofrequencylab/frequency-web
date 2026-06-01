'use client'

import { useEffect, useRef, useState } from 'react'

// Types a sequence of lines out one character at a time, like someone speaking
// into the page. Returns the visible lines, whether it's done, and a `skip` to
// reveal everything instantly (tap-ahead). Respects prefers-reduced-motion: the
// lines appear whole. All state updates are scheduled async (never synchronously
// inside the effect body) to satisfy the react-hooks purity rule.
export function useTypewriter(lines: string[], opts?: { speed?: number; lineGap?: number; start?: boolean }) {
  const speed = opts?.speed ?? 26
  const lineGap = opts?.lineGap ?? 420
  const start = opts?.start ?? true

  const [shown, setShown] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const clearAll = () => {
      timers.current.forEach(clearTimeout)
      timers.current = []
    }
    clearAll()

    // Kick off on the next tick so the reset + typing setState calls never run
    // synchronously within the effect.
    timers.current.push(setTimeout(() => {
      setShown([])
      setDone(false)

      if (!start || lines.length === 0) {
        setDone(true)
        return
      }

      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (reduced) {
        setShown(lines)
        setDone(true)
        return
      }

      let li = 0
      const typeLine = () => {
        const full = lines[li]
        let ci = 0
        setShown((prev) => [...prev.slice(0, li), ''])
        const tick = () => {
          ci++
          setShown((prev) => {
            const next = [...prev]
            next[li] = full.slice(0, ci)
            return next
          })
          if (ci < full.length) {
            timers.current.push(setTimeout(tick, speed))
          } else if (li < lines.length - 1) {
            li++
            timers.current.push(setTimeout(typeLine, lineGap))
          } else {
            setDone(true)
          }
        }
        timers.current.push(setTimeout(tick, speed))
      }
      typeLine()
    }, 0))

    return clearAll
    // `lines` identity changes per step; that's the intended reset trigger.
  }, [lines, speed, lineGap, start])

  const skip = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setShown(lines)
    setDone(true)
  }

  return { shown, done, skip }
}
