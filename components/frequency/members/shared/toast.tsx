'use client'

import { useEffect, useRef, useState } from 'react'

// The page-body toast (design: a fixed pill, bottom-centre 76px, auto-hiding after 2.8s; the kit's
// .ap-toast). Islands call fqToast(); one <FqToaster /> per page renders it. A window event rather
// than a context, so a Server Component page can mount the toaster beside unrelated islands.

const EVENT = 'fq:toast'

export function fqToast(message: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: message }))
}

export function FqToaster() {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const on = (e: Event) => {
      const text = (e as CustomEvent<string>).detail
      if (timer.current) clearTimeout(timer.current)
      setMsg(text)
      timer.current = setTimeout(() => setMsg(null), 2800)
    }
    window.addEventListener(EVENT, on)
    return () => {
      window.removeEventListener(EVENT, on)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])
  return (
    <div className={msg ? 'ap-toast on' : 'ap-toast'} role="status" aria-live="polite">
      {msg}
    </div>
  )
}
