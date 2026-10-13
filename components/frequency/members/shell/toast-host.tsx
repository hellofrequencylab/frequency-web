'use client'

// The `.ap-toast` host from shell.js: a polite live region, shown for 2.8s per message.

import { useEffect, useRef, useState } from 'react'
import { FQ_TOAST_EVENT } from './toast'

export function FqToastHost() {
  const [text, setText] = useState('')
  const [on, setOn] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const show = (e: Event) => {
      const msg = (e as CustomEvent<string>).detail
      if (!msg) return
      setText(msg)
      setOn(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setOn(false), 2800)
    }
    window.addEventListener(FQ_TOAST_EVENT, show)
    return () => {
      window.removeEventListener(FQ_TOAST_EVENT, show)
      clearTimeout(timer.current)
    }
  }, [])

  return (
    <div className={on ? 'ap-toast on' : 'ap-toast'} role="status" aria-live="polite">
      {text}
    </div>
  )
}
