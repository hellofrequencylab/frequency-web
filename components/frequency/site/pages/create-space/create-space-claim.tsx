'use client'

// /create-a-space, the fifth step: save what was built and claim the handle (README section 3, step 5), and the
// saved state after it. Signed out there are two doors, the same two /sign-in has: Google, or a link emailed to the
// address from step 3, through the actions in app/(marketing)/create-a-space/actions.ts. Signed in there is no
// account to make: one button takes the answers to the launch page. Nothing is promised that has not happened: the
// Space is made on the launch page, when the Spotlight is published. Styles: create-space.css (cs-sum, cs-google...).
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState, useSyncExternalStore, useTransition } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { claimWithEmail, claimWithGoogle, continueSignedIn } from '@/app/(marketing)/create-a-space/actions'
import { serializeDraft } from '@/lib/create-space/builder'
import { browserZone } from '@/lib/create-space/lead'
import type { BuilderDraft } from '@/lib/create-space/builder'
import { joinList } from '@/lib/create-space/preview-site'

export interface Saved {
  email: string
  keepBuildingHref: string | null
}

/** Who is signed in, if anyone. The page is static, so the browser asks once the card is on screen. */
interface Viewer { signedIn: boolean; name: string }

function useViewer(): Viewer | null {
  const [viewer, setViewer] = useState<Viewer | null>(null)
  useEffect(() => {
    let live = true
    fetch('/api/viewer', { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (live) setViewer({ signedIn: data?.signedIn === true, name: String(data?.profile?.display_name ?? '').trim() }) })
      .catch(() => { if (live) setViewer({ signedIn: false, name: '' }) })
    return () => { live = false }
  }, [])
  return viewer
}

interface SaveCardProps {
  draft: BuilderDraft
  handle: string
  siteName: string
  kitLabel: string
  /** The cover the preview wears, for the summary row. */
  coverSrc: string
  /** The honeypot was filled: nothing leaves the browser, the card only looks like it worked. */
  trapped: boolean
  /** The local draft has left the browser: stop keeping it. */
  onHandOver: () => void
  onSaved: (saved: Saved) => void
  /** The email from step 3 is missing or malformed: go back and fix it. */
  onNeedEmail: () => void
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const subscribeZone = () => () => {}
const serverZone = () => null

export function SaveCard({ draft, handle, siteName, kitLabel, coverSrc, trapped, onHandOver, onSaved, onNeedEmail }: SaveCardProps) {
  const viewer = useViewer()
  const zone = useSyncExternalStore(subscribeZone, browserZone, serverZone)
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()
  const email = draft.email.trim()
  const hostName = draft.hostName.trim() || 'you'

  const sendLink = () => {
    if (!EMAIL.test(email)) { onNeedEmail(); return }
    setErr('')
    if (trapped) { onSaved({ email, keepBuildingHref: null }); return }
    start(async () => {
      const data = new FormData()
      data.set('email', email)
      data.set('draft', serializeDraft(draft))
      const tz = browserZone()
      if (tz) data.set('tz', tz)
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
      const tz = browserZone()
      if (tz) data.set('tz', tz)
      const res = await continueSignedIn(data)
      if (!res.ok) { setErr(res.error); return }
      onHandOver()
      window.location.assign(res.href)
    })
  }

  return (
    <div className="cs-card fq-iri-rim">
      <h2 className="cs-card-h">Save it. Claim <em>/{handle}.</em></h2>
      <div className="cs-sum">
        <span className="cs-sum-thumb"><Image src={coverSrc} alt="" fill sizes="38px" unoptimized={coverSrc.startsWith('blob:')} style={{ objectFit: 'cover' }} /></span>
        <span className="cs-sum-main">
          <b>{siteName}</b>
          <span>{kitLabel} theme · hosted by {hostName}</span>
        </span>
        <span className="ig-d">Draft</span>
      </div>
      {err ? <p role="alert" className="cs-alert">{err}</p> : null}
      {viewer?.signedIn ? (
        <>
          <button type="button" className="fq-iri-btn cs-google" onClick={launch} disabled={pending}>Continue as {viewer.name || 'me'}<FqIcon name="arrow" size={16} /></button>
          <p className="cs-fine cs-fine-c">You are signed in, so there is no account to make. Your name, handle, look and tools come with you to the launch page.</p>
        </>
      ) : (
        <>
          <form action={claimWithGoogle} onSubmit={(e) => { if (trapped) { e.preventDefault(); onSaved({ email, keepBuildingHref: null }); return } }}>
            <input type="hidden" name="draft" value={serializeDraft(draft)} />
            <input type="hidden" name="tz" value={zone ?? ''} />
            <button type="submit" className="cs-google" disabled={pending}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {/* Google's own four-colour mark: brand colours, not theme colours. */}
                <path d="M22.56 12.25c0-.78-.07-1.530-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.920 3.28-4.740 3.28-8.090z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.150-3.150C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Save with Google
            </button>
          </form>
          <button type="button" className="cs-email-go" onClick={sendLink} disabled={pending}>Email my link to {email || 'my email'}</button>
          <p className="cs-fine cs-fine-c">No password, no card. Saving makes your free account and host profile. You agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy</Link>.</p>
        </>
      )}
    </div>
  )
}

interface SavedCardProps {
  draft: BuilderDraft
  /** The first offering's title, from the preview. */
  firstOffer: string
  tools: readonly string[]
  saved: Saved
  trapped: boolean
}

/** After the link is sent: what the launch page adds next, the one page to keep going on, and a resend. */
export function SavedCard({ draft, firstOffer, tools, saved, trapped }: SavedCardProps) {
  const [again, setAgain] = useState<'idle' | 'sent' | 'failed'>('idle')
  const [pending, start] = useTransition()

  const resend = () => {
    if (trapped) { setAgain('sent'); return }
    start(async () => {
      const data = new FormData()
      data.set('email', saved.email)
      data.set('draft', serializeDraft(draft))
      const tz = browserZone()
      if (tz) data.set('tz', tz)
      setAgain((await claimWithEmail(data)).ok ? 'sent' : 'failed')
    })
  }

  const walk = [
    { icon: 'edit', label: 'Your story', sub: 'A few lines on who you are and who it is for.' },
    { icon: 'ticket', label: 'Your first offering', sub: `${firstOffer}, with a time and a price.` },
    { icon: 'check', label: 'Switched on for you', sub: joinList(tools) },
  ] as const

  return (
    <div className="cs-card fq-iri-rim" aria-live="polite">
      <span className="cs-card-eyebrow"><i className="cs-dot fq-breathe" />Draft saved</span>
      <div className="cs-walk">
        {walk.map((w) => (
          <div key={w.label} className="cs-walk-row">
            <span className="fq-icon-tile"><FqIcon name={w.icon} size={18} /></span>
            <span className="cs-walk-text"><b>{w.label}</b><span>{w.sub}</span></span>
          </div>
        ))}
      </div>
      <div className="cs-acts">
        {saved.keepBuildingHref ? <Link className="cs-go" href={saved.keepBuildingHref}>Keep building<FqIcon name="arrow" size={16} /></Link> : null}
        {again === 'sent' ? <span className="cs-again-ok">Sent again</span> : <button type="button" className="cs-again" onClick={resend} disabled={pending}>Send it again</button>}
        {again === 'failed' ? <span role="alert" className="cs-err">That did not send. Try again in a few minutes.</span> : null}
      </div>
    </div>
  )
}
