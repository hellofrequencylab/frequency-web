'use client'

import { Zap } from 'lucide-react'
import { openUpgrade } from '@/components/crew/upgrade-launcher'

// THE UPGRADE TAB - a small orange tab sitting flush on top of the profile card in the left rail,
// for members who are not on the paid tier. One tap raises the app-wide upgrade prompt
// (components/crew/upgrade-launcher.tsx), the same dialog every feature gate raises.
//
// 🔴 IT USED TO BE A PITCH CARD, AND THE CARD WAS THE PROBLEM. The rail rendered a full panel -
// headline, blurb, CTA - that a member had to dismiss, after which it collapsed to a tab that
// re-expanded the panel inline. So the rail held a SECOND, differently-worded upgrade surface beside
// the lightbox every gate opens, with its own copy to keep in sync and its own dismissal state in
// localStorage. Two pitches, two wordings, one product.
//
// Now the rail's job is to be a door, not a pitch: the tab is always the tab, and the words live in
// exactly one place. The dismissal state went with the panel, because there is nothing to dismiss -
// a tab is not an interruption.
export function UpgradeCrew() {
  return (
    <button
      type="button"
      onClick={() => openUpgrade()}
      aria-label="Upgrade to Crew"
      className="mx-3 -mb-px flex items-center justify-center gap-1.5 rounded-t-lg bg-primary px-3 py-1.5 text-meta font-semibold text-on-primary transition-colors hover:bg-primary-hover"
    >
      <Zap className="h-3.5 w-3.5" aria-hidden />
      Upgrade
    </button>
  )
}
