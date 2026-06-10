'use client'

import { useState } from 'react'
import { Zap } from 'lucide-react'

// Inlined (must match DEMO_HIDE_COOKIE in lib/demo-preference.ts). That module
// imports next/headers (server-only), so a client component can't import from it.
const DEMO_HIDE_COOKIE = 'fq_hide_demo'

// The header "Demo content" on/off switch (members only). Flips a cookie the
// server reads to show/hide seeded demo content across the feed + listings.
// Two variants:
//   • pill (default, sm+) — a ⚡ pill with a mini switch, sized to match the
//     Search pill it sits beside.
//   • mini (mobile) — just the bolt + a tiny switch, centered in the tight
//     mobile header. Tapping flashes a "Demo Content" tip (touch has no hover)
//     before the reload picks up the cookie.
// Reloads so server-rendered listings pick up the change.
export function DemoToggle({
  initialHidden,
  variant = 'pill',
}: {
  initialHidden: boolean
  variant?: 'pill' | 'mini'
}) {
  const [on, setOn] = useState(!initialHidden) // on = demo content showing
  const [tip, setTip] = useState(false)

  function setCookie(next: boolean) {
    // hide when OFF
    document.cookie = `${DEMO_HIDE_COOKIE}=${next ? '0' : '1'}; path=/; max-age=31536000; samesite=lax`
  }

  function toggle() {
    const next = !on
    setOn(next)
    setCookie(next)
    window.location.reload()
  }

  // Mini: show the tip first so the tap reads, then reload.
  function toggleMini() {
    const next = !on
    setOn(next)
    setTip(true)
    setCookie(next)
    setTimeout(() => window.location.reload(), 700)
  }

  if (variant === 'mini') {
    return (
      <button
        type="button"
        onClick={toggleMini}
        role="switch"
        aria-checked={on}
        aria-label="Demo Content"
        className="relative inline-flex items-center gap-1 rounded-full px-1.5 py-1"
      >
        <Zap className={`h-3.5 w-3.5 ${on ? 'fill-warning text-warning' : 'text-subtle'}`} aria-hidden />
        <span className={`relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors ${on ? 'bg-warning' : 'bg-border-strong'}`}>
          <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${on ? 'translate-x-3' : 'translate-x-0.5'}`} />
        </span>
        {tip && (
          <span
            role="tooltip"
            className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-text px-2 py-1 text-2xs font-semibold text-on-primary shadow-lg"
          >
            Demo Content
          </span>
        )}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={on}
      aria-label="Demo content"
      title={on ? 'Demo content is showing. Click to hide' : 'Demo content is hidden. Click to show'}
      className="hidden items-center gap-1.5 rounded-full border border-border bg-surface-elevated/70 py-1.5 pl-3 pr-1.5 text-sm font-semibold text-muted transition-colors hover:border-border-strong hover:text-text sm:inline-flex"
    >
      <Zap className={`h-4 w-4 ${on ? 'fill-warning text-warning' : 'text-subtle'}`} aria-hidden />
      <span>Demo</span>
      <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${on ? 'bg-warning' : 'bg-border-strong'}`}>
        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${on ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
      </span>
    </button>
  )
}
