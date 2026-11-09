'use client'

// /create-a-space, three of the step cards of the hero builder (docs/design-systems/create-a-space, README section 3):
// the name and accent, what they offer (with the mock-up moment), and how clients find them. Photos: create-space-photos.tsx. Each card is
// markup over the draft the island (create-space-studio.tsx) holds; the rules (handles, progress, the tools a
// sentence switches on) are lib/create-space/builder.ts. Styles: create-space.css (cs-card, cs-name, cs-offer...).
import type { KeyboardEvent, RefObject } from 'react'
import { useState } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import type { BuilderDraft } from '@/lib/create-space/builder'
import { claimedHandle, cleanHandleInput } from '@/lib/create-space/builder'
import type { HandleStatus } from '@/lib/create-space/handle'
import { suggestHandle } from '@/lib/create-space/handle'
import { OFFER_MAX } from '@/lib/create-space/intents-from-offer'

/** The first question, as the prototype asks it (a plain string so the apostrophe stays an apostrophe). */
const NAME_QUESTION = "What's your business called?"

/** Which field the last Next tripped over; the card shows the matching line. */
export type StepError = 'name' | 'slug' | 'accent' | 'offer' | 'fullName' | 'email' | null

export const ERROR_TEXT: Record<Exclude<StepError, null>, string> = {
  name: 'Give it a name. You can change it any time.',
  slug: 'Pick a handle that is free to use.',
  accent: 'Pick an accent above to keep going.',
  offer: 'A few words is enough. What do people come to you for?',
  fullName: 'Add the name clients know you by.',
  email: 'Add an email so your draft is safe.',
}

/** The three examples a stuck visitor can start from. */
export const OFFER_EXAMPLES = [
  'Kitchen and home design for families who love to cook.',
  'Weekly pottery classes and open studio nights.',
  '1:1 coaching for first-time managers.',
] as const

/** The four lines that tick while the mock-up is made. */
export const MOCKUP_LINES = ['Reading what you offer', 'Laying out your headline', 'Arranging three offerings', 'Switching on the right tools'] as const

const Arrow = () => <FqIcon name="arrow" size={16} />

interface NameCardProps {
  draft: BuilderDraft
  patch: (p: Partial<BuilderDraft>) => void
  /** The intro state: the card is bare, inside the hero copy, and its button says Start building. */
  intro: boolean
  status: HandleStatus
  accents: readonly { name: string; fill: string }[]
  err: StepError
  onNext: () => void
  resumeName: string
  onResume: () => void
  inputRef: RefObject<HTMLInputElement | null>
}

export function NameCard({ draft, patch, intro, status, accents, err, onNext, resumeName, onResume, inputRef }: NameCardProps) {
  const [editing, setEditing] = useState(false)
  const handle = claimedHandle(draft)
  const hasName = draft.name.trim().length > 0
  const locked = hasName && !draft.accentPicked
  const accent = accents[draft.accentAt] ?? accents[0]
  const onEnter = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); onNext() } }
  const showErr = err === 'name' || err === 'slug' || err === 'accent'
  return (
    <div data-morph="name" className={intro ? 'cs-card-name' : 'cs-card-name fq-iri-rim'}>
      <label htmlFor="cs-name" className="cs-label">{NAME_QUESTION}</label>
      <div className="cs-name-wrap">
        <input
          id="cs-name"
          ref={inputRef}
          className="cs-name"
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value.slice(0, 80) })}
          onKeyDown={onEnter}
          placeholder="Business Name"
          maxLength={80}
          autoComplete="organization"
        />
        <button
          type="button"
          className="fq-iri-btn cs-name-go"
          onClick={onNext}
          aria-disabled={locked}
          title={locked ? 'Pick an accent first' : undefined}
        >
          {intro ? 'Start building' : 'Next'}<Arrow />
        </button>
      </div>
      {intro && resumeName ? <button type="button" className="cs-resume" onClick={onResume}>Welcome back. Pick up {resumeName}</button> : null}
      {hasName ? (
        <div className="cs-handle-block">
          <div className="cs-handle">
            <span className="cs-url"><FqIcon name="link" size={15} />frequency.community/<b>{handle || 'yourspace'}</b></span>
            {status === 'free' ? <span className="cs-free"><FqIcon name="check" size={14} />Free to use</span> : null}
            {status === 'taken' ? <span className="cs-taken">Taken. Try {suggestHandle(handle)}</span> : null}
            <button type="button" className="cs-text" onClick={() => setEditing((v) => !v)}>Change</button>
          </div>
          {editing || err === 'slug' ? (
            <span className="cs-slug">
              <span>/</span>
              <input value={draft.slug || handle} onChange={(e) => patch({ slug: cleanHandleInput(e.target.value) })} onKeyDown={onEnter} aria-label="Handle" placeholder="yourhandle" maxLength={40} />
            </span>
          ) : null}
          <div className="cs-accent">
            {draft.accentPicked ? <span className="cs-accent-k">Accent · <span>{accent?.name}</span></span> : <span className="cs-accent-need"><i className="fq-breathe" />Pick an accent to continue</span>}
            <div role="radiogroup" aria-label="Accent" className="cs-swatches">
              {accents.map((a, i) => (
                <button key={a.name} type="button" role="radio" aria-checked={draft.accentPicked && i === draft.accentAt} aria-label={a.name} className="cs-swatch" style={{ background: a.fill }} onClick={() => patch({ accentAt: i, accentPicked: true })} />
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {showErr && err ? <p role="alert" className="cs-err">{ERROR_TEXT[err]}</p> : null}
    </div>
  )
}

interface OfferCardProps {
  draft: BuilderDraft
  patch: (p: Partial<BuilderDraft>) => void
  /** Which of MOCKUP_LINES is ticking; null when the card is idle. */
  busyLine: number | null
  err: StepError
  onNext: () => void
  onExample: (text: string) => void
  inputRef: RefObject<HTMLTextAreaElement | null>
}

export function OfferCard({ draft, patch, busyLine, err, onNext, onExample, inputRef }: OfferCardProps) {
  const siteName = draft.name.trim() || 'Business Name'
  if (busyLine !== null) {
    return (
      <div className="cs-card fq-iri-rim" aria-live="polite">
        <div className="cs-card-head">
          <span className="cs-card-eyebrow"><i className="cs-dot fq-breathe" />Mocking it up</span>
          <h2 className="cs-card-h">Building <em>{siteName}</em></h2>
        </div>
        <div className="cs-lines">
          {MOCKUP_LINES.map((text, i) => {
            const state = i < busyLine ? 'done' : i === busyLine ? 'now' : 'off'
            return (
              <div key={text} className="cs-line" data-state={state}>
                {state === 'done' ? <span className="cs-line-done"><FqIcon name="check" size={12} /></span> : state === 'now' ? <span className="cs-line-now fq-breathe" /> : <span className="cs-line-off" />}
                <span>{text}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
  return (
    <div className="cs-card fq-iri-rim">
      <h2 className="cs-card-h">What does your business <em>offer?</em></h2>
      <textarea
        ref={inputRef}
        className="cs-offer"
        value={draft.offer}
        onChange={(e) => patch({ offer: e.target.value.slice(0, OFFER_MAX) })}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onNext() } }}
        rows={2}
        maxLength={OFFER_MAX}
        placeholder={OFFER_EXAMPLES[0]}
        aria-label="What your business offers"
      />
      <div className="cs-examples">
        <span className="cs-examples-k">Stuck? Start from one of these</span>
        <div className="cs-chips">
          {OFFER_EXAMPLES.map((t) => <button key={t} type="button" className="cs-chip-btn" onClick={() => onExample(t)}>{t}</button>)}
        </div>
      </div>
      {err === 'offer' ? <p role="alert" className="cs-err">{ERROR_TEXT.offer}</p> : null}
      <div className="cs-foot">
        <button type="button" className="fq-iri-btn cs-next" onClick={onNext}>Mock it up<Arrow /></button>
      </div>
    </div>
  )
}

interface ContactCardProps {
  draft: BuilderDraft
  patch: (p: Partial<BuilderDraft>) => void
  err: StepError
  onNext: () => void
  inputRef: RefObject<HTMLInputElement | null>
  /** The honeypot's value, read by the island before anything leaves the browser (ADR-1933). */
  onTrap: (filled: boolean) => void
}

export function ContactCard({ draft, patch, err, onNext, inputRef, onTrap }: ContactCardProps) {
  const onEnter = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); onNext() } }
  return (
    <div className="cs-card fq-iri-rim">
      <h2 className="cs-card-h">How do clients <em>find you?</em></h2>
      <div className="cs-fields">
        <label className="cs-field"><span>Your name</span><input ref={inputRef} value={draft.hostName} onChange={(e) => patch({ hostName: e.target.value.slice(0, 80) })} onKeyDown={onEnter} placeholder="Sam Rivera" autoComplete="name" /></label>
        <label className="cs-field"><span>Email</span><input type="email" inputMode="email" value={draft.email} onChange={(e) => patch({ email: e.target.value.slice(0, 254) })} onKeyDown={onEnter} placeholder="you@example.com" autoComplete="email" /></label>
        <label className="cs-field"><span>Phone <i>· optional</i></span><input type="tel" inputMode="tel" value={draft.phone} onChange={(e) => patch({ phone: e.target.value.slice(0, 30) })} onKeyDown={onEnter} placeholder="+1 555 014 2290" autoComplete="tel" /></label>
        <label className="cs-field"><span>Where you work <i>· optional</i></span><input value={draft.where} onChange={(e) => patch({ where: e.target.value.slice(0, 80) })} onKeyDown={onEnter} placeholder="A city, or Online" autoComplete="address-level2" /></label>
        {/* A field people never see; a bot that fills it is not a lead. */}
        <label className="cs-honey" aria-hidden="true"><span>Website</span><input tabIndex={-1} autoComplete="off" name="website" onChange={(e) => onTrap(e.target.value.length > 0)} /></label>
      </div>
      {err === 'fullName' || err === 'email' ? <p role="alert" className="cs-err">{ERROR_TEXT[err]}</p> : null}
      <p className="cs-fine">We save your draft to this address, so you can pick it up on any device. It stays private.</p>
      <div className="cs-foot">
        <button type="button" className="cs-next" onClick={onNext}>Add to my site<Arrow /></button>
      </div>
    </div>
  )
}
