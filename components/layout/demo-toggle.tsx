'use client'

import { useState } from 'react'
import { Zap } from 'lucide-react'

// Inlined (must match DEMO_HIDE_COOKIE in lib/demo-preference.ts). That module
// imports next/headers (server-only), so a client component can't import from it.
const DEMO_HIDE_COOKIE = 'fq_hide_demo'

// The header "Demo content" on/off switch (members only). Flips a cookie the
// server reads to show/hide seeded demo content across the feed + listings.
// Obvious-but-classy: a ⚡ pill with a mini switch, sized to match the Search
// pill it sits beside. Reloads so server-rendered listings pick up the change.
export function DemoToggle({ initialHidden }: { initialHidden: boolean }) {
  const [on, setOn] = useState(!initialHidden) // on = demo content showing

  function toggle() {
    const next = !on
    setOn(next)
    // hide when OFF
    document.cookie = `${DEMO_HIDE_COOKIE}=${next ? '0' : '1'}; path=/; max-age=31536000; samesite=lax`
    window.location.reload()
  }

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={on}
      aria-label="Demo content"
      title={on ? 'Demo content is showing — click to hide' : 'Demo content is hidden — click to show'}
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
