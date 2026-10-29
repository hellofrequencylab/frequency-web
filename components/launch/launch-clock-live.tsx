'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { LaunchClock } from '@/components/launch/launch-clock'
import { clockBeatAction } from '@/lib/launch/actions'
import { BEAT_EVERY_MS, IDLE_AFTER_MS, clockView, type BeatKind } from '@/lib/launch/clock'

// THE LAUNCH CLOCK (the live half). Wraps the face: ticks the clock while the person is working, pauses it when the tab
// is hidden or nothing has been touched for a minute, and reports in to the server every 15 seconds (the server is the
// one that keeps the time and caps what a beat can add). The hero card sits at the top of the page; once it scrolls
// away the same clock rides along as a slim pill, measured to the hero's own column so it lines up with the page.

const INPUTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

export function LaunchClockLive({ initialActiveMs, done, total, stages, stagesDone }: { initialActiveMs: number; done: number; total: number; stages: readonly string[]; stagesDone: number }) {
  const [active, setActive] = useState(initialActiveMs)
  const [running, setRunning] = useState(true)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const runningRef = useRef(false)
  const idleRef = useRef(false)
  const lastInputRef = useRef(0)
  const lastTickRef = useRef(0)

  const beat = useCallback((kind: BeatKind) => {
    void clockBeatAction(kind).then((r) => {
      if ('data' in r && kind !== 'start') setActive(r.data.activeMs)
    }).catch(() => {})
  }, [])

  // Running means: the tab is showing and the person has touched something in the last minute.
  const sync = useCallback(() => {
    const want = document.visibilityState === 'visible' && !idleRef.current
    if (want === runningRef.current) return
    runningRef.current = want
    lastTickRef.current = Date.now()
    setRunning(want)
    beat(want ? 'start' : 'stop')
  }, [beat])

  useEffect(() => {
    lastInputRef.current = Date.now()
    sync()
    const onInput = () => {
      lastInputRef.current = Date.now()
      if (idleRef.current) {
        idleRef.current = false
        sync()
      }
    }
    for (const e of INPUTS) window.addEventListener(e, onInput, { passive: true })
    document.addEventListener('visibilitychange', sync)
    const idleCheck = setInterval(() => {
      if (!idleRef.current && Date.now() - lastInputRef.current >= IDLE_AFTER_MS) {
        idleRef.current = true
        sync()
      }
    }, 5_000)
    const tick = setInterval(() => {
      const now = Date.now()
      // A laptop that slept must not jump the clock: no tick counts for more than two seconds.
      if (runningRef.current) setActive((a) => a + Math.min(now - lastTickRef.current, 2_000))
      lastTickRef.current = now
    }, 1_000)
    const beating = setInterval(() => { if (runningRef.current) beat('beat') }, BEAT_EVERY_MS)
    return () => {
      for (const e of INPUTS) window.removeEventListener(e, onInput)
      document.removeEventListener('visibilitychange', sync)
      clearInterval(idleCheck)
      clearInterval(tick)
      clearInterval(beating)
      if (runningRef.current) {
        runningRef.current = false
        beat('stop')
      }
    }
  }, [beat, sync])

  // The hero scrolls away above the viewport: show the pill, lined up with the hero's column.
  useEffect(() => {
    const el = heroRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => {
      const r = entry.boundingClientRect
      setPill(!entry.isIntersecting && r.bottom < 0 ? { left: r.left, width: r.width } : null)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  useLayoutEffect(() => {
    if (!pill) return
    const place = () => {
      const r = heroRef.current?.getBoundingClientRect()
      if (r) setPill((p) => (p && (p.left !== r.left || p.width !== r.width) ? { left: r.left, width: r.width } : p))
    }
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [pill])

  const view = clockView({ activeMs: active, done, total, running })
  return (
    <>
      <div ref={heroRef}>
        <LaunchClock view={view} stages={stages} done={stagesDone} variant="hero" />
      </div>
      {pill ? (
        <div style={{ position: 'fixed', top: 'calc(var(--fq-hdr, 64px) + 8px)', left: pill.left, width: pill.width, zIndex: 40 }}>
          <LaunchClock view={view} stages={stages} done={stagesDone} variant="pill" />
        </div>
      ) : null}
    </>
  )
}
