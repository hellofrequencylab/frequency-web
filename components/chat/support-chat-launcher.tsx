'use client'

// THE SUPPORT CHAT LAUNCHER (SCAN-674): the only part of the public contact dock that ships in a
// public page's first-load JS. It is the floating button and nothing else. The panel
// (./support-chat-widget.tsx) reaches @supabase/supabase-js through its auth probe, the Broadcast
// hook and the typing indicator (~57 KB gzip, the weight components/layout/marketing-header.tsx
// records removing from every marketing page), so it is mounted through next/dynamic: fetched when
// the browser is idle after paint, mounted on the first tap, never parsed before the page is
// interactive. OWN-052 found the widget in the RSC payload of /what-is-frequency; this is the seam
// that keeps it out. The three public layouts ((marketing), (help), discover) render THIS and never
// the widget directly; the SCAN-674 probe reads those three imports.

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { MessageCircle, X, Loader2 } from 'lucide-react'

const loadPanel = () => import('./support-chat-widget')

const SupportChatPanel = dynamic(() => loadPanel().then((m) => m.SupportChatPanel), {
  ssr: false,
  loading: () => (
    <div className="mb-3 flex h-[32rem] max-h-[calc(100dvh-6rem)] w-[22rem] max-w-[calc(100vw-2rem)] items-center justify-center rounded-2xl border border-border bg-surface shadow-pop">
      <Loader2 className="h-5 w-5 animate-spin text-muted" aria-hidden />
    </div>
  ),
})

export function SupportChatLauncher() {
  const [open, setOpen] = useState(false)

  // Warm the chunk once the page is idle so the first tap opens without a spinner. A prefetch is
  // not a mount: nothing in the panel runs (no auth probe, no channel) until the visitor opens it.
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void }
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(() => void loadPanel().catch(() => {}))
      return () => w.cancelIdleCallback?.(id)
    }
    const id = window.setTimeout(() => void loadPanel().catch(() => {}), 2500)
    return () => window.clearTimeout(id)
  }, [])

  return (
    // `data-visual-mask`: the visual suite paints over this box (test/e2e/surfaces.ts,
    // VISUAL_MASK_SITES). The launcher mounts only where SUPPORT_CHAT is set. That was one
    // Vercel environment and not another until 2026-09-29, so a capture encoded the
    // environment it was taken on; Preview carries it too since then (LIVE-213, ADR-1694).
    <div
      data-visual-mask="support-chat"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 print:hidden"
    >
      {open && <SupportChatPanel onClose={() => setOpen(false)} />}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close contact panel' : 'Contact us'}
        className="flex h-14 w-14 items-center justify-center rounded-pill bg-primary text-on-primary shadow-pop transition-transform hover:scale-105"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  )
}
