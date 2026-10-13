'use client'

import { useState } from 'react'
import { WILDHEART_GLYPHS } from '@/lib/theme/wildheart-symbols'

// YOUR FIRST NIGHT (the design handoff's mobile Home, 2026-10-13): the four-way choice of how to arrive
// (join in, go gently, witness, not sure). Picking one shows its note and the button. A client island
// only for the pick; every word is the block's (components/page-editor/blocks/wildheart.tsx,
// WildheartFirstNightBlock), every colour a token.

export interface ArriveOption {
  label: string
  sub: string
  note: string
}

export function WildheartFirstNight({ options, chosen, cta, href }: { options: ArriveOption[]; chosen: string; cta: string; href: string | null }) {
  const [on, setOn] = useState<number | null>(null)
  const picked = on !== null ? options[on] : null
  return (
    <>
      <div className="wh-fn-grid" role="group">
        {options.map((o, i) => (
          <button key={i} type="button" className="wh-fn-option" aria-pressed={on === i} onClick={() => setOn(i)}>
            <span className="wh-fn-option-label">{o.label}</span>
            <span className="wh-fn-option-sub">{o.sub}</span>
            <span className="wh-label wh-label-ink wh-fn-chosen" hidden={on !== i}>{WILDHEART_GLYPHS.spark} {chosen}</span>
          </button>
        ))}
      </div>
      {/* Every note is in the page from the start (a reader without script, the content check); only the picked one shows. */}
      <div className="wh-fn-picked" hidden={!picked}>
        {options.map((o, i) => (
          <span key={i} className="wh-fn-note" hidden={on !== i}>{o.note}</span>
        ))}
          {href ? (
            <a className="hs-btn hs-btn-primary wh-btn-wide" href={href}>{cta}</a>
          ) : (
            <button type="button" className="hs-btn hs-btn-primary wh-btn-wide">{cta}</button>
          )}
      </div>
    </>
  )
}
