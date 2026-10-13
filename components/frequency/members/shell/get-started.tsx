'use client'

import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'

// GET STARTED (README §3.1, Members.dc.html `gs`): the activation checklist from
// lib/onboarding/status.ts in the design's box. It leads the right rail on every member page, and the
// Feed repeats it inline below 680px, where the rails are hidden. Done-ness is detected server-side
// from member state; each CTA opens the step's real flow, so there is no client-side "mark done" and
// no setup bonus (the prototype's "⚡ 50 added" has no ledger entry behind it). × folds the box away
// for this visit: the platform keeps the guide until its steps are done (feed-onboarding-guide.tsx).

export interface GsStep {
  key: string
  label: string
  blurb: string
  cta: string
  href: string
  done: boolean
}

export function GetStarted({ steps, className }: { steps: GsStep[]; className?: string }) {
  const [hidden, setHidden] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const done = steps.filter((s) => s.done).length
  const firstTodo = steps.find((s) => !s.done)?.key ?? null
  const active = open ?? firstTodo
  if (hidden || steps.length === 0) return null
  const left = steps.length - done
  const later = (key: string) => {
    const i = steps.findIndex((s) => s.key === key)
    const next = [...steps.slice(i + 1), ...steps.slice(0, i)].find((s) => !s.done)
    setOpen(next ? next.key : null)
  }
  return (
    <section className={className ? `fqm-gs ${className}` : 'fqm-gs'} aria-label="Get started" data-energy="flow">
      <div className="fq-aura" aria-hidden />
      <div className="fqm-gs-h">
        <span className="fqm-gs-ring" data-n={`${done}/${steps.length}`} style={{ '--p': `${Math.round((done / steps.length) * 100)}%` } as CSSProperties} aria-hidden />
        <span className="fqm-grow">
          <b>Get started</b>
          <small>{left === 0 ? 'All done' : `Set up your network · ${left} left`}</small>
        </span>
        <button type="button" className="fqm-x" aria-label="Hide for now" title="Hide" onClick={() => setHidden(true)}>
          <FqIcon name="close" />
        </button>
      </div>
      <div className="fqm-steps">
        {steps.map((s) => {
          const now = !s.done && active === s.key
          return (
            <div key={s.key} className={s.done ? 'fqm-step done' : now ? 'fqm-step now' : 'fqm-step'}>
              <button type="button" aria-expanded={now} disabled={s.done} onClick={() => setOpen(s.key)}>
                <span className={now ? 'fqm-mark fq-breathe' : 'fqm-mark'} aria-hidden>
                  {s.done ? <FqIcon name="checkin" /> : now ? <i /> : null}
                </span>
                {s.label}
              </button>
              {now && (
                <div className="fqm-step-open">
                  <p>{s.blurb}</p>
                  <div className="fqm-step-row">
                    <Link href={s.href} className="btn pa">
                      {s.cta}
                    </Link>
                    <button type="button" className="btn txt sm" onClick={() => later(s.key)}>
                      Later
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
