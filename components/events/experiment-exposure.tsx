'use client'
import { useEffect, useRef, type ReactNode } from 'react'
import { exposeUpcomingExperiment } from '@/app/(main)/events/experiment-actions'

/** Exposure means the tested heading became visible, not merely server-rendered. */
export function ExperimentExposure({ id, children }: { id: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    let sent = false
    let inView = false
    const sendIfVisible = () => {
      if (!sent && inView && document.visibilityState === 'visible') {
        sent = true
        observer.disconnect()
        void exposeUpcomingExperiment(id).catch(() => {})
      }
    }
    const observer = new IntersectionObserver((entries) => {
      inView = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5)
      sendIfVisible()
    }, { threshold: 0.5 })
    observer.observe(node)
    document.addEventListener('visibilitychange', sendIfVisible)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', sendIfVisible) }
  }, [id])
  return <div ref={ref}>{children}</div>
}
