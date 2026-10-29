'use client'

// /create-a-space, the fifth move: save what was built and claim the handle. A card of its own under the four moves.
// Signed out it asks for an email (a magic link) or Google, the same two doors /sign-in has, through the actions in
// app/(marketing)/create-a-space/actions.ts. Signed in there is no account to make: one button takes the answers to
// the launch page. After the link is sent the card says so ("Saved") and offers the launch page to keep going on.
// Nothing is promised that has not happened: the Space is made on the launch page, when the Spotlight is published.
// Styles: create-space.css (cs-claim-*).
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { claimWithEmail, claimWithGoogle, continueSignedIn } from '@/app/(marketing)/create-a-space/actions'
import { serializeDraft } from '@/lib/create-space/builder'
import type { BuilderDraft } from '@/lib/create-space/builder'
import type { KitImagery } from '@/lib/create-space/preview-site'

export interface Saved {
  email: string
  keepBuildingHref: string | null
}

interface ClaimProps {
  draft: BuilderDraft
  handle: string
  siteName: string
  kitLabel: string
  imagery: KitImagery
  /** The local draft has left the browser: stop keeping it. */
  onHandOver: () => void
  onSaved: (saved: Saved) => void
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Summary({ draft, handle, siteName, kitLabel, imagery }: Pick<ClaimProps, 'draft' | 'handle' | 'siteName' | 'kitLabel' | 'imagery'>) {
  return (
    <div className="cs-claim-sum">
      <span className="cs-claim-thumb">
        <span className="cs-kit-img"><Image src={imagery.hero} alt="" fill sizes="38px" style={{ objectFit: 'cover', objectPosition: imagery.heroPos }} /></span>
      </span>
      <span className="cs-claim-sum-main">
        <b>{siteName}</b>
        <span>frequency.community/{handle} · {kitLabel} kit · hosted by {draft.hostName.trim()}</span>
      </span>
      <span className="ig-d up">Ready</span>
    </div>
  )
}

/** Whether the visitor already has a session. The page is static, so the browser asks once the card is on screen. */
function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    fetch('/api/viewer', { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (live) setSignedIn(data?.signedIn === true) })
      .catch(() => { if (live) setSignedIn(false) })
    return () => { live = false }
  }, [])
  return signedIn
}

export function ClaimCard(props: ClaimProps) {
  const { draft, handle, onHandOver, onSaved } = props
  const signedIn = useSignedIn()
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()

  const send = () => {
    if (!EMAIL.test(email.trim())) { setErr('Enter a full email address.'); return }
    setErr('')
    start(async () => {
      const data = new FormData()
      data.set('email', email.trim())
      data.set('draft', serializeDraft(draft))
      const res = await claimWithEmail(data)
      if (!res.ok) { setErr(res.error); return }
      onHandOver()
      onSaved({ email: res.email, keepBuildingHref: res.keepBuildingHref })
    })
  }

  const launch = () => {
    setErr('')
    start(async () => {
      const data = new FormData()
      data.set('draft', serializeDraft(draft))
      const res = await continueSignedIn(data)
      if (!res.ok) { setErr(res.error); return }
      onHandOver()
      window.location.assign(res.href)
    })
  }

  return (
    <section aria-labelledby="cs-claim-h" className="cs-bld-card cs-claim fq-iri-rim">
      <div className="cs-bld-head">
        <span className="cs-bld-count">5 of 5 · last one</span>
        <h3 id="cs-claim-h" className="cs-bld-h">
          {signedIn ? <>Take it to <em>launch.</em></> : <>Save it. Claim <em>/{handle}.</em></>}
        </h3>
        <p className="cs-bld-lead">
          {signedIn ? 'You already have an account, so there is nothing to make. Your name, handle, look and tools come with you.' : 'One step keeps everything you just built. No password, no card.'}
        </p>
      </div>
      <Summary {...props} />

      {signedIn ? (
        <div className="cs-claim-form">
          {err ? <p role="alert" className="cs-bld-alert">{err}</p> : null}
          <button type="button" className="btn fq-iri-btn cs-claim-go" onClick={launch} disabled={pending}>Launch my Space<span aria-hidden="true">→</span></button>
        </div>
      ) : (
        <>
          <form className="cs-claim-form" noValidate onSubmit={(e) => { e.preventDefault(); send() }}>
            <label className="cs-claim-field">
              <span>Email address</span>
              <input type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => { setErr(''); setEmail(e.target.value) }} placeholder="you@example.com" />
            </label>
            {err ? <p role="alert" className="cs-bld-alert">{err}</p> : null}
            <button type="submit" className="btn fq-iri-btn cs-claim-go" disabled={pending}>Send my magic link<span aria-hidden="true">→</span></button>
          </form>
          <p aria-hidden="true" className="cs-claim-or"><span />or<span /></p>
          <form action={claimWithGoogle} onSubmit={onHandOver}>
            <input type="hidden" name="draft" value={serializeDraft(draft)} />
            <button type="submit" className="cs-claim-google">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {/* Google's own four-colour mark: brand colours, not theme colours. */}
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google
            </button>
          </form>
          <div className="cs-claim-fine">
            <p>Already a member? Use the same email or Google account you joined with.</p>
            <p>Saving makes your free account. You agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy</Link>.</p>
          </div>
        </>
      )}
    </section>
  )
}

interface SavedProps {
  draft: BuilderDraft
  siteName: string
  kitLabel: string
  toolsLabel: string
  saved: Saved
}

/** After the link is sent: what was kept, and the one page a visitor can keep going on while the email travels. */
export function SavedCard({ draft, siteName, kitLabel, toolsLabel, saved }: SavedProps) {
  const [again, setAgain] = useState<'idle' | 'sent' | 'failed'>('idle')
  const [pending, start] = useTransition()

  const resend = () => {
    start(async () => {
      const data = new FormData()
      data.set('email', saved.email)
      data.set('draft', serializeDraft(draft))
      setAgain((await claimWithEmail(data)).ok ? 'sent' : 'failed')
    })
  }

  const kept = [
    { k: 'Spotlight', v: `${siteName}, ready for one line about what you do.` },
    { k: 'Website', v: `Dressed in the ${kitLabel} kit.` },
    { k: 'Tools', v: toolsLabel },
  ]

  return (
    <section aria-labelledby="cs-saved-h" className="cs-bld-card cs-claim fq-iri-rim">
      <div className="cs-bld-head">
        <span className="cs-claim-badge"><span className="cs-dot" />Saved</span>
        <h3 id="cs-saved-h" className="cs-bld-h">{siteName} is <em className="fq-iri-text">saved.</em></h3>
        <p className="cs-bld-lead">
          We sent a link to <b>{saved.email}</b>. Open it when you are ready and your answers are waiting for you. Nothing goes public until you say so.
        </p>
      </div>
      <ul className="cs-claim-kept">
        {kept.map((row) => (
          <li key={row.k}><b>{row.k}</b><span>{row.v}</span></li>
        ))}
      </ul>
      <div className="cs-claim-acts">
        {saved.keepBuildingHref ? <Link className="btn fq-iri-btn cs-claim-go" href={saved.keepBuildingHref}>Keep building<span aria-hidden="true">→</span></Link> : null}
        {again === 'sent' ? <span className="cs-claim-again is-ok" aria-live="polite">Sent again</span> : (
          <button type="button" className="cs-bld-text" onClick={resend} disabled={pending}>Send it again</button>
        )}
        {again === 'failed' ? <span role="alert" className="cs-claim-again">That did not send. Try again in a few minutes.</span> : null}
      </div>
    </section>
  )
}
