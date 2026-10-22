'use client'

// The first beat of the induction on the Frequency design: who you are, and the email that saves your
// spot, in ONE screen. Two columns on a desktop (the promise on the left, the choices and the email on
// the right), one tight column on a phone; hero, choices, Decide later and the email all sit above the
// fold at 1280x800 and 390x844. Built from the site kit's own pieces (.label, .h-xl, .pc, .jx-f, .btn)
// plus the .iw-* rules in app/themes/frequency/site-funnel.css; no raw colours, sizes or one-off CSS.
// The state (picks, email, the save) stays in the induction; this only draws it.

import type { ComponentType, ReactNode } from 'react'
import { Input } from '@/components/ui/field'
import '@/app/themes/active/site-pages-b'
import '@/app/themes/active/site-funnel'

export type WelcomeChoice = {
  key: string
  label: string
  pitch: string
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  active: boolean
}

export function InductionWelcome({
  preview,
  invited,
  eyebrow,
  title,
  lede,
  prompt,
  hint,
  choices,
  onToggle,
  decideLater,
  onDecideLater,
  email,
  onEmail,
  onSubmit,
  emailError,
  note,
  cta,
  busy,
  followUp,
}: {
  preview?: boolean
  /** The "Invited by" chip, when a member's QR code brought them here. */
  invited?: ReactNode
  eyebrow: string
  title: ReactNode
  lede: string
  prompt: string
  hint: string
  choices: WelcomeChoice[]
  onToggle: (key: string) => void
  decideLater: boolean
  onDecideLater: () => void
  email: string
  onEmail: (value: string) => void
  onSubmit: () => void
  emailError: string
  note: string
  cta: string
  busy: boolean
  followUp?: ReactNode
}) {
  return (
    <div className="iw">
      <div className="iw-copy">
        {preview && <p className="iw-preview">Preview · nothing is saved</p>}
        <div className="label">
          <b>{eyebrow}</b>
        </div>
        <h1 className="iw-h1">{title}</h1>
        <p className="iw-lede">{lede}</p>
        {invited}
      </div>

      <form
        className="iw-form jx-f"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <div role="group" aria-labelledby="iw-prompt" className="iw-pick">
          <p id="iw-prompt" className="iw-prompt">
            <b>{prompt}</b> <span>{hint}</span>
          </p>
          <div className="iw-grid">
            {choices.map((c) => (
              <button key={c.key} type="button" className="pc iw-card" aria-pressed={c.active} onClick={() => onToggle(c.key)}>
                <span className="ic">
                  <c.Icon aria-hidden />
                </span>
                <span className="iw-text">
                  <b>{c.label}</b>
                  <small>{c.pitch}</small>
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="iw-later" aria-pressed={decideLater} onClick={onDecideLater}>
            {decideLater ? 'Deciding later. You can change this any time.' : 'Decide later'}
          </button>
          {followUp}
        </div>

        <div className="iw-email">
          <label htmlFor="induction-email" className="sr-only">
            Your email
          </label>
          <div className="iw-row">
            <Input
              id="induction-email"
              type="email"
              value={email}
              onChange={(e) => onEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={!!emailError}
              aria-describedby="induction-email-note"
            />
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'One sec…' : cta}
            </button>
          </div>
          <p id="induction-email-note" role={emailError ? 'alert' : undefined} className="jx-fine iw-note" data-error={emailError ? '' : undefined}>
            {emailError || note}
          </p>
        </div>
      </form>
    </div>
  )
}
