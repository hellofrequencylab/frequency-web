'use client'

import { useState } from 'react'
import { Zap } from 'lucide-react'
import { DEMO_HIDE_COOKIE } from '@/lib/demo-preference'

// The header "Beta content" on/off switch (members only). Flips a cookie the
// server reads to show/hide seeded demo content across the feed + listings.
// Obvious-but-classy: a ⚡ pill with a mini switch. Reloads so server-rendered
// listings pick up the new preference.
export function DemoToggle({ initialHidden }: { initialHidden: boolean }) {
  const [on, setOn] = useState(!initialHidden) // on = beta content showing

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
      aria-label="Beta content"
      title={on ? 'Beta content is showing — click to hide' : 'Beta content is hidden — click to show'}
      className="hidden items-center gap-1.5 rounded-full border border-border bg-surface-elevated/70 py-1 pl-2.5 pr-1 text-xs font-semibold text-muted transition-colors hover:border-border-strong hover:text-text sm:inline-flex"
    >
      <Zap className={`h-3.5 w-3.5 ${on ? 'fill-warning text-warning' : 'text-subtle'}`} aria-hidden />
      <span>Beta</span>
      <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${on ? 'bg-warning' : 'bg-border-strong'}`}>
        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${on ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
      </span>
    </button>
  )
}
