'use client'

// "Pause motion" in the public footer (WCAG 2.2.2: moving content that starts on its own and runs
// longer than five seconds needs a way to stop it). prefers-reduced-motion already quiets the site for
// people who set it at the OS; this is the control for everyone else. It marks the kit root
// `data-motion="paused"` (kit-site.css stops every keyframe and shows the reveals at once), tells
// SiteFx to stand down, and remembers the choice on this device.

import { useEffect, useState } from 'react'

const KEY = 'fq-motion'
export const MOTION_EVENT = 'fq-motion-change'

function apply(paused: boolean) {
  const root = document.querySelector<HTMLElement>('[data-kit="site"]')
  if (!root) return
  if (paused) root.dataset.motion = 'paused'
  else delete root.dataset.motion
  window.dispatchEvent(new Event(MOTION_EVENT))
}

export function MotionPause() {
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    let saved = false
    try {
      saved = window.localStorage.getItem(KEY) === 'paused'
    } catch {
      // Storage can be blocked; the control still works for this visit.
    }
    if (saved) {
      apply(true)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from storage after mount
      setPaused(true)
    }
  }, [])

  function toggle() {
    const next = !paused
    setPaused(next)
    apply(next)
    try {
      if (next) window.localStorage.setItem(KEY, 'paused')
      else window.localStorage.removeItem(KEY)
    } catch {
      // Not persisted; fine.
    }
  }

  return (
    <button type="button" className="ft2-pause" aria-pressed={paused} onClick={toggle}>
      {paused ? 'Play motion' : 'Pause motion'}
    </button>
  )
}
