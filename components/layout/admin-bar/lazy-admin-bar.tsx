'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { OPEN_ADMIN_BAR, type OpenAdminBarDetail } from '@/components/admin/open-admin-bar'
import type { AdminBarState } from './admin-bar'

// Merely declaring a split does not defer its download: mount it only after a request or desktop restore.
const AdminBar = dynamic(() => import('./admin-bar').then((m) => m.AdminBar), { ssr: false })

export function LazyAdminBar({ onStateChange }: { onStateChange?: (state: AdminBarState) => void }) {
  const [requested, setRequested] = useState(false)
  const pending = useRef<OpenAdminBarDetail | null>(null)
  const listening = useRef(false)

  useEffect(() => {
    function request(event: Event) {
      if (listening.current) return
      pending.current = (event as CustomEvent<OpenAdminBarDetail>).detail ?? {}
      setRequested(true)
    }
    const desktop = window.matchMedia('(min-width: 1024px)')
    function restore() {
      try {
        if (desktop.matches && localStorage.getItem('freq-settings-open') === '1') setRequested(true)
      } catch { /* Storage denial must not prevent the typed trigger from working. */ }
    }
    window.addEventListener(OPEN_ADMIN_BAR, request)
    desktop.addEventListener('change', restore)
    restore()
    return () => {
      window.removeEventListener(OPEN_ADMIN_BAR, request)
      desktop.removeEventListener('change', restore)
    }
  }, [])

  const onListening = useCallback(() => {
    listening.current = true
    const detail = pending.current
    pending.current = null
    if (detail) window.dispatchEvent(new CustomEvent(OPEN_ADMIN_BAR, { detail }))
  }, [])

  return requested ? <AdminBar onStateChange={onStateChange} onListening={onListening} /> : null
}
