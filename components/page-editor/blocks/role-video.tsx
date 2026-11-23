'use client'

import { useEffect, useRef } from 'react'

// A GALLERY PHOTO'S BACKGROUND VIDEO (LIVE-2520). A silent loop laid over the photo. The photo stays underneath as the poster, the
// still while the clip loads, and the whole picture for anyone who turns motion off. Nothing downloads until the section is near the
// screen (the sources carry data-src until then), and the clip pauses when it scrolls away. Markup is the role contract.

export function RoleBgVideo({ mp4, webm, poster, focus }: { mp4: string; webm: string | null; poster: string | null; focus: string | null }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (!v || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return void v.pause()
        if (!v.dataset.ready) {
          v.querySelectorAll('source').forEach((s) => { if (s.dataset.src) s.src = s.dataset.src })
          v.load()
          v.dataset.ready = '1'
        }
        v.play().catch(() => {})
      },
      { rootMargin: '200px 0px' },
    )
    io.observe(v)
    return () => io.disconnect()
  }, [])
  return (
    <video ref={ref} data-part="video" muted loop playsInline preload="none" poster={poster ?? undefined} aria-hidden="true" tabIndex={-1} style={focus ? { objectPosition: focus } : undefined}>
      {webm && <source data-src={webm} type="video/webm" />}
      <source data-src={mp4} type="video/mp4" />
    </video>
  )
}
