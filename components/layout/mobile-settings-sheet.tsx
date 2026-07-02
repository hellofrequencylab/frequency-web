'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { useSettingsPanel, useIsDesktop } from '@/components/layout/settings-panel'
import { OPEN_ADMIN_BAR, type OpenAdminBarDetail } from '@/components/admin/open-admin-bar'

// The MOBILE settings surface (< lg). The desktop SettingsDrawer slides over the right-rail
// column, which doesn't exist on phones — so on mobile that drawer never renders and the
// "Settings" / "Edit X" buttons (which dispatch `open-settings`) did nothing. This sheet is the
// mobile equivalent: it listens to the SAME `open-settings` event and renders a full-screen
// overlay with the SAME content (useSettingsPanel, shared with the desktop drawer). It is
// `lg:hidden`, so on desktop it stays display:none and the slide-over owns the experience.
export function MobileSettingsSheet() {
  const [open, setOpen] = useState(false)
  // The pre-scoped detail a typed `open-admin-bar` dispatch carried; undefined on the legacy path.
  const [detail, setDetail] = useState<OpenAdminBarDetail | undefined>(undefined)
  const pathname = usePathname()
  const isDesktop = useIsDesktop()
  const { hasContent, content } = useSettingsPanel(detail)

  // Dual trigger seam (shared with the desktop SettingsDrawer, docs/ADMIN-RAIL.md Phase 1): the legacy
  // bare `open-settings` event TOGGLES + clears detail (exactly as before); the typed `open-admin-bar`
  // event stores its { scope, caps } and OPENS (never toggles).
  useEffect(() => {
    function onLegacy() {
      setDetail(undefined)
      setOpen((o) => !o)
    }
    window.addEventListener('open-settings', onLegacy)
    return () => window.removeEventListener('open-settings', onLegacy)
  }, [])
  useEffect(() => {
    function onTyped(e: Event) {
      setDetail((e as CustomEvent<OpenAdminBarDetail>).detail)
      setOpen(true)
    }
    window.addEventListener(OPEN_ADMIN_BAR, onTyped)
    return () => window.removeEventListener(OPEN_ADMIN_BAR, onTyped)
  }, [])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Close when the route changes (navigating away closes the sheet — mobile expectation).
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setOpen(false)
  }, [pathname])

  // Desktop is owned by the slide-over SettingsDrawer; this sheet only mounts content < lg.
  if (isDesktop || !hasContent || !open) return null

  return (
    <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Page settings">
      {/* Backdrop — tap to dismiss. */}
      <button
        type="button"
        aria-label="Close settings"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/40"
      />
      {/* Sheet — full-width on a phone (w-full), a right-side sheet on a tablet (max-w-md). */}
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-pop">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border pl-5 pr-3">
          <p className="text-sm font-bold text-text">Settings</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close settings"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto p-4">{content}</div>
      </div>
    </div>
  )
}
