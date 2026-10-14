'use client'

import type { ReactNode } from 'react'

// VERA'S COMMAND BAR (Site Editor handoff): always at the bottom centre of the stage, never a collapsed
// toggle. The reply card and suggestion chips stack above the bar, all in one labelled region.
export function VeraDock({ children }: { children: ReactNode }) {
  return <section className="we-vera" aria-label="Vera writing assistant">{children}</section>
}
