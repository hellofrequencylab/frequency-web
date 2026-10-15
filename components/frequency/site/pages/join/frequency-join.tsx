'use client'

// The /join BETA ENTRY on the Frequency design (SCAN-879; a progressive slide in SCAN-888; one short
// card that grows in place in SCAN-894): the stock way in, as a compact card centered in the space
// under the site header, over a soft backdrop photo. Three steps:
//
//   1. Join the beta          Name first. The moment the name has a character, the Email field slides
//                             in under it. A valid address saves itself on blur or Enter (the induction
//                             cookie, the lead row, and the sign-in email, once per address), with a
//                             "Saving… / Saved ✓" indicator beside the field and a Retry if it fails.
//                             Once saved, a round "Add a photo" target opens above the name (optional,
//                             parked the moment it is picked).
//   2. Where are you?         optional town: "Turn on location" (the browser's own prompt), a typed
//                             town as the fallback; Skip.
//   3. Confirm and activate   the consent line (Terms, Privacy), then "Confirm and send my link" sends
//                             the one activation email; then Send it again / Use a different email.
//                             (SCAN-906) Nothing is mailed before this confirm: the email field only saves
//                             the draft and checks the address. An address that already has an account
//                             gets "You already have an account. Log in" inline and no email.
//
// The save is NOT fired on a typing pause: a pause inside "sam@gmail.co" is a valid-looking address and
// would mail a stranger. Blur, Enter, or Continue saves it. Focus: the name takes focus on arrival;
// Enter in the name (or Tab) moves to the email; the email never grabs focus mid-word, and the photo
// target appears without taking focus. Each new step's first control takes focus, and an aria-live
// line announces the email field, the photo target and each step. Under prefers-reduced-motion the
// reveals and the step swap happen without moving (the CSS).
//
// 🔴 NO NEW AUTH PATH AND NO NEW DATA. Everything runs through actions that already exist:
//   · stashPendingInduction parks the answers in the cookie /join/complete's finalizer reads after sign-in
//     (finalizePendingInduction -> writeInduction), exactly as the deferred induction does;
//   · captureLead / updateLead keep the follow-up lead row, bounded so lead bookkeeping never holds anyone
//     on a spinner;
//   · sendSignupLink is signInWithMagicLink's own send (same throttle, same post-login cookie, same signup
//     OTP), returning instead of redirecting so the visitor stays for the photo and the town;
//   · the photo is parked in localStorage under the key the finalizer uploads from, shrunk first through
//     the same prep the induction uses (prepareImageForUpload + downscaleImageFile).
// The profile needs a handle; the induction asks for one, this entry derives it from the name (the
// induction's own suggestion rule) and checks it against /api/check-handle, adding digits if it is taken.
// A member changes it later in settings.
//
// CHROME. app/join/(induction)/page.tsx renders this inside the site shell (<SiteShell>); this body is
// the page between the header and the footer (a `div.jb`, since the shell owns <main>). The stage keeps
// the `.jx-panel` class so site-fx still draws the Join sphere and halos behind the card.

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useSiteSide } from '@/components/frequency/site/shell/site-root'
import '@/app/themes/active/site-pages-b'
import { joinEmailHasAccount, stashPendingInduction } from '@/app/join/(induction)/actions'
import { captureLead, updateLead } from '@/app/join/(induction)/lead-actions'
import { sendSignupLink } from '@/app/sign-in/actions'
import { Input } from '@/components/ui/field'
import { getBrowserPosition } from '@/lib/geo-browser'
import { reversePlace, searchPlaces, type PlaceSuggestion } from '@/lib/geocode'
import { downscaleImageFile } from '@/lib/images/downscale-image'
import { prepareImageForUpload } from '@/lib/library/image-shrink'
import { safeUploadPreviewSrc } from '@/lib/safe-image-src'
import { getInitials } from '@/lib/utils'

/** The key /join/complete's finalizer uploads the parked photo from (complete/finalizer.tsx). */
const PENDING_AVATAR_KEY = 'fq_pending_avatar'
/** Where the emailed link lands: the finalizer that writes the profile. */
const COMPLETE_PATH = '/join/complete'
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const HANDLE_RE = /^[a-z0-9_]{3,30}$/

/** The three steps, in order. The progress indicator and the live region read this. */
const STEPS = [
  { id: 'join', q: 'Join the beta' },
  { id: 'place', q: 'Where are you?' },
  { id: 'sent', q: 'Confirm and activate' },
] as const
const PLACE = 1
const LAST = STEPS.length - 1
/** The control each step hands focus to when it arrives. */
const FIRST_CONTROL = ['jb-name', 'jb-city', 'jb-resend'] as const

type Place = { label: string; lat: number | null; lng: number | null }
type Save = { state: 'idle' | 'saving' | 'saved' | 'error'; error?: string }

/** The induction's suggestion rule ("Daniel Tyack" -> "danieltyack"), padded to the three-letter floor. */
function baseHandle(name: string): string {
  const h = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24)
  return h.length >= 3 ? h : `${h || 'member'}${'000'.slice(h.length)}`.slice(0, 24)
}

async function handleFree(handle: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/check-handle?handle=${encodeURIComponent(handle)}&userId=`)
    const { available } = (await res.json()) as { available: boolean }
    return available
  } catch {
    return false
  }
}

/** A free handle for this name: the plain one, else up to three tries with four digits on the end. If
 *  every check fails the last candidate is kept; the finalizer reports a clash rather than guessing. */
async function pickHandle(name: string): Promise<string> {
  const base = baseHandle(name)
  if (HANDLE_RE.test(base) && (await handleFree(base))) return base
  let candidate = base
  for (let i = 0; i < 3; i++) {
    candidate = `${base}${Math.floor(1000 + Math.random() * 9000)}`
    if (await handleFree(candidate)) break
  }
  return candidate
}

/** Lead bookkeeping, bounded: a hung limiter or attribution read must never become a stuck form. */
async function bounded(p: Promise<unknown>) {
  try {
    await Promise.race([p, new Promise((resolve) => setTimeout(resolve, 2000))])
  } catch {
    /* the lead row is a follow-up aid, never a precondition for joining */
  }
}

export function FrequencyJoin({
  initialStep = 1,
  initialName = '',
  initialHandle = '',
  initialPlace = '',
}: {
  /** RESUME: 2 = this browser already parked its name and sent a link, so step 1 reopens saved. */
  initialStep?: 1 | 2
  initialName?: string
  initialHandle?: string
  initialPlace?: string
}) {
  const resumed = initialStep === 2
  const [side] = useSiteSide()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState('')
  /** Latched: once the email field has slid in it stays, even if the name is cleared. */
  const [emailShown, setEmailShown] = useState(!!initialName)
  const [handle, setHandle] = useState(initialHandle)
  /** The address the last link went to: one save (park, lead, send) per address. */
  const [savedTo, setSavedTo] = useState('')
  /** The name the induction cookie holds, so Continue re-parks only when it changed. */
  const [parkedName, setParkedName] = useState(resumed ? initialName : '')
  const [save, setSave] = useState<Save>({ state: 'idle' })
  /** Latched: the photo target opens on the first save and stays (Use a different email keeps it). */
  const [photoShown, setPhotoShown] = useState(resumed)
  /** The save in flight, so a blur and a Continue click on the same address share one save. */
  const inflight = useRef<{ address: string; done: Promise<boolean> } | null>(null)
  const [error, setError] = useState('')
  const [announce, setAnnounce] = useState('')
  const [pending, startTransition] = useTransition()
  const [resent, setResent] = useState(false)
  // SCAN-906: the address belongs to a member already (no email goes out; they log in instead).
  const [hasAccount, setHasAccount] = useState('')
  // SCAN-906: the activation email goes out only on the last step's confirm, never on the email field.
  const [sentTo, setSentTo] = useState('')

  // Photo
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Place
  const [place, setPlace] = useState<Place | null>(initialPlace ? { label: initialPlace, lat: null, lng: null } : null)
  const [locating, setLocating] = useState(false)
  const [locNote, setLocNote] = useState('')
  const [query, setQuery] = useState(initialPlace)
  const [results, setResults] = useState<PlaceSuggestion[]>([])
  const [active, setActive] = useState(-1)

  // Each step's first control takes focus when the step arrives; a one-off target overrides it (Use a
  // different email lands on the email field). The very first paint focuses the name unless resumed.
  const focusNext = useRef<string | null>(null)
  const firstPaint = useRef(true)
  useEffect(() => {
    const first = firstPaint.current
    firstPaint.current = false
    if (first && resumed) return
    const id = focusNext.current ?? FIRST_CONTROL[step]
    focusNext.current = null
    const el = document.getElementById(id) ?? document.getElementById('jb-other')
    el?.focus({ preventScroll: true })
    if (el instanceof HTMLInputElement && id === 'jb-email') el.select()
  }, [step, resumed])

  // Town typeahead (Photon, the same source the induction's city field uses).
  useEffect(() => {
    const term = query.trim()
    if (term.length < 2 || term === place?.label) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setResults(await searchPlaces(term, ctrl.signal))
      setActive(-1)
    }, 280)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query, place])

  function go(to: number) {
    const next = Math.max(0, Math.min(LAST, to))
    setError('')
    setResent(false)
    setAnnounce(`Step ${next + 1} of ${STEPS.length}: ${STEPS[next].q}`)
    setStep(next)
  }

  function park(fields: { displayName: string; handle: string; place: Place | null; beat: number }) {
    return stashPendingInduction({
      displayName: fields.displayName,
      handle: fields.handle,
      bio: '',
      location: fields.place?.label ?? '',
      lat: fields.place?.lat ?? null,
      lng: fields.place?.lng ?? null,
      intent: '',
      interests: '',
      heardAbout: '',
      beat: fields.beat,
    })
  }

  function send(address: string) {
    const fd = new FormData()
    fd.set('email', address)
    fd.set('next', COMPLETE_PATH)
    return sendSignupLink(fd)
  }

  function onName(value: string) {
    setName(value)
    if (value.trim() && !emailShown) {
      setEmailShown(true)
      setAnnounce('Email field added below your name.')
    }
  }

  function onEmail(value: string) {
    setEmail(value)
    if (error) setError('')
    if (hasAccount && value.trim() !== hasAccount) setHasAccount('')
    // A different address is a new save; the old one's "Saved" no longer describes this field.
    if (value.trim() !== savedTo && save.state !== 'saving') setSave({ state: 'idle' })
  }

  /** THE SAVE: what the old email step did on "Send my link", now fired by the field itself (blur,
   *  Enter, Continue). Once per address: the same address never parks or mails twice. */
  function saveEmail(): Promise<boolean> {
    const displayName = name.trim()
    const address = email.trim()
    if (!displayName || !EMAIL_RE.test(address)) return Promise.resolve(false)
    if (address === savedTo) return Promise.resolve(true)
    if (inflight.current?.address === address) return inflight.current.done
    const done = (async () => {
      setSave({ state: 'saving' })
      try {
        const h = handle || (await pickHandle(displayName))
        setHandle(h)
        // Saved first: the answers outlive a failed send, a closed tab, or a link opened tomorrow.
        await park({ displayName, handle: h, place, beat: 1 })
        setParkedName(displayName)
        await bounded(
          captureLead({ email: address, step: 1, source: 'beta_induction', displayName, handle: h, payload: { entry: 'beta' } }),
        )
        // No mail here (SCAN-906): the draft is saved, the activation link waits for the confirm.
        const { exists } = await joinEmailHasAccount(address).catch(() => ({ exists: false }))
        if (exists) {
          setHasAccount(address)
          setSave({ state: 'idle' })
          return false
        }
        setHasAccount('')
        setSavedTo(address)
        setSave({ state: 'saved' })
        setPhotoShown(true)
        if (!resumed) setAnnounce('Saved. A photo upload is now above your name.')
        return true
      } catch {
        setSave({ state: 'error', error: 'That didn’t save. Check your connection.' })
        return false
      } finally {
        inflight.current = null
      }
    })()
    inflight.current = { address, done }
    return done
  }

  // Continue on step 1: save if it has not (the click blurs the field too; the in-flight guard keeps
  // that to one save), re-park a renamed name, then on to the town.
  function onContinue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const displayName = name.trim()
    const address = email.trim()
    if (!displayName) {
      setError('Add your name so people know who they’re meeting.')
      document.getElementById('jb-name')?.focus()
      return
    }
    // SCAN-906: a parked draft no longer means a link went out, so the email is always asked for.
    if (!EMAIL_RE.test(address)) {
      setError('That email doesn’t look right. Check it and try again.')
      document.getElementById('jb-email')?.focus()
      return
    }
    setError('')
    startTransition(async () => {
      try {
        if (!(await saveEmail())) return
        if (displayName !== parkedName && handle) {
          await park({ displayName, handle, place, beat: 1 })
          setParkedName(displayName)
        }
        go(PLACE)
      } catch {
        setError('Something went wrong on our side. Try again in a moment.')
      }
    })
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoError('')
    const prepared = await prepareImageForUpload(file)
    if ('error' in prepared) return setPhotoError(prepared.error)
    const small = await downscaleImageFile(prepared.file)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = reject
        r.readAsDataURL(small)
      })
      localStorage.setItem(PENDING_AVATAR_KEY, dataUrl)
      setPhoto(URL.createObjectURL(small))
      setAnnounce('Photo added.')
    } catch {
      setPhotoError('That photo would not save here. You can add one later from your profile.')
    }
  }

  function choose(p: PlaceSuggestion) {
    setPlace(p)
    setQuery(p.label)
    setResults([])
    setActive(-1)
  }

  async function turnOnLocation() {
    setLocNote('')
    setLocating(true)
    const pos = await getBrowserPosition()
    if (!pos) {
      setLocating(false)
      setLocNote('Location is off for this site. Type your town instead.')
      document.getElementById('jb-city')?.focus()
      return
    }
    const found = await reversePlace(pos.lat, pos.lng)
    setLocating(false)
    if (!found) {
      setLocNote('We found you but not your town’s name. Type it instead.')
      document.getElementById('jb-city')?.focus()
      return
    }
    choose(found)
  }

  // Arrow keys walk the suggestions; Enter on an open list picks one instead of moving on.
  function onCityKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const dir = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + dir + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[Math.max(0, active)])
    } else if (e.key === 'Escape') {
      setResults([])
      setActive(-1)
    }
  }

  // Town -> check your email: the town is re-parked and added to the lead.
  function onPlace() {
    setError('')
    startTransition(async () => {
      try {
        if (place) {
          await park({ displayName: name.trim(), handle, place, beat: 2 })
          void updateLead({ step: 2, payload: { location: place.label } }).catch(() => {})
        }
        go(LAST)
      } catch {
        setError('Something went wrong on our side. Try again in a moment.')
      }
    })
  }

  function onResend() {
    setError('')
    setResent(false)
    startTransition(async () => {
      const address = email.trim()
      const res = await send(address)
      if (!res.ok) return setError(res.error)
      if (sentTo === address) setResent(true)
      else setAnnounce('Sent. Check your email to activate.')
      setSentTo(address)
    })
  }

  const looking = side === 'p'
  const current = STEPS[step]
  const photoSrc = safeUploadPreviewSrc(photo)
  const headingId = `jb-q-${current.id}`
  const showPhoto = photoShown
  const busy = pending || save.state === 'saving'

  const err = error ? (
    <p className="jx-err" role="alert">
      {error}
    </p>
  ) : null

  const back =
    step > 0 ? (
      <button className="jb-back" type="button" onClick={() => go(step - 1)} disabled={pending}>
        <span aria-hidden="true">←</span> Back
      </button>
    ) : null

  return (
    <div className="jb" data-screen-label={`0${step + 1} ${current.q}`}>
      <div className="jb-bg" aria-hidden="true">
        <Image
          src={looking ? '/brand/frequency/photos/day-meditation-circle.jpg' : '/brand/frequency/photos/gathering-09.jpg'}
          alt=""
          fill
          priority
          sizes="100vw"
        />
        <span className="rings" />
      </div>
      <div className="jx-panel jb-stage">
        <div className="jb-card">
          <div className="jb-top">
            <span className="jb-k">
              <i className="fq-breathe" aria-hidden="true" />
              Beta · free, no card
            </span>
            <span className="jb-prog">
              <span className="jb-count" aria-hidden="true">
                {step + 1}/{STEPS.length}
              </span>
              <span
                className="jb-steps"
                role="progressbar"
                aria-label="Joining"
                aria-valuemin={1}
                aria-valuemax={STEPS.length}
                aria-valuenow={step + 1}
                aria-valuetext={`Step ${step + 1} of ${STEPS.length}: ${current.q}`}
              >
                {STEPS.map((s, i) => (
                  <i key={s.id} data-on={i <= step ? '' : undefined} />
                ))}
              </span>
            </span>
          </div>

          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {announce}
          </p>

          <section key={current.id} className="jb-slide" aria-labelledby={headingId}>
            <h1 id={headingId}>{current.id === 'sent' && sentTo ? 'Check your email to activate' : current.q}</h1>

            {current.id === 'join' && (
              <form className="jx-f" noValidate onSubmit={onContinue}>
                {showPhoto && (
                  <div className="jb-reveal">
                    <div>
                      <div className="jb-photo">
                        <button type="button" onClick={() => fileRef.current?.click()}>
                          {photoSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element -- a blob: preview this browser minted
                            <img src={photoSrc} alt="Your photo" className="jb-av" />
                          ) : (
                            <span className="jb-av" aria-hidden="true">
                              {getInitials(name) || '+'}
                            </span>
                          )}
                          <span>
                            {photoSrc ? 'Change photo' : 'Add a photo'}
                            <small>Optional. Helps people say yes.</small>
                          </span>
                        </button>
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/*"
                          hidden
                          aria-label="Profile photo"
                          onChange={onPhoto}
                        />
                      </div>
                      {photoError && <p className="jx-err">{photoError}</p>}
                    </div>
                  </div>
                )}

                <div className="jb-field">
                  <label htmlFor="jb-name">Your name</label>
                  <Input
                    id="jb-name"
                    name="name"
                    value={name}
                    onChange={(e) => onName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      e.preventDefault()
                      if (name.trim()) document.getElementById('jb-email')?.focus()
                    }}
                    required
                    placeholder="Sam Rivera"
                    autoComplete="name"
                    enterKeyHint="next"
                  />
                </div>

                {emailShown && (
                  <div className="jb-reveal">
                    <div>
                      <div className="jb-field">
                        <div className="jb-lab">
                          <label htmlFor="jb-email">Email</label>
                          <span className="jb-save" data-state={save.state} role="status">
                            {save.state === 'saving' && 'Saving…'}
                            {save.state === 'saved' && (
                              <>
                                Saved <span aria-hidden="true">✓</span>
                              </>
                            )}
                          </span>
                        </div>
                        <Input
                          id="jb-email"
                          name="email"
                          type="email"
                          value={email}
                          onChange={(e) => onEmail(e.target.value)}
                          onBlur={() => void saveEmail()}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return
                            // Enter saves; once this address is saved, Enter moves on like Continue.
                            const address = email.trim()
                            if (address && address === savedTo) return
                            e.preventDefault()
                            if (EMAIL_RE.test(address)) void saveEmail()
                            else if (address) setError('That email doesn’t look right. Check it and try again.')
                          }}
                          required
                          placeholder="you@example.com"
                          autoComplete="email"
                          enterKeyHint="done"
                          aria-describedby="jb-email-note"
                          aria-invalid={save.state === 'error' || undefined}
                        />
                        {hasAccount && hasAccount === email.trim() ? (
                          <p className="jx-err jb-note" id="jb-email-note" role="alert">
                            You already have an account. <Link href="/sign-in">Log in</Link>
                          </p>
                        ) : save.state === 'error' ? (
                          <p className="jx-err jb-note" id="jb-email-note" role="alert">
                            {save.error}{' '}
                            <button className="jb-retry" type="button" onClick={() => void saveEmail()}>
                              Retry
                            </button>
                          </p>
                        ) : (
                          <p className="jx-fine jb-note" id="jb-email-note">
                            Saves as soon as you finish. Nothing is emailed until you confirm.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {err}
                <div className="jb-act">
                  <button className="btn fq-iri-btn" type="submit" disabled={busy}>
                    {busy ? 'One sec…' : 'Continue'}
                  </button>
                </div>
              </form>
            )}

            {current.id === 'place' && (
              <form
                className="jx-f"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault()
                  onPlace()
                }}
              >
                <p className="jb-sub">Your town shows you what’s near. We keep the town, not your street. Optional.</p>
                <button
                  className="btn btn-ghost fq-iri-rim jb-locate"
                  type="button"
                  onClick={turnOnLocation}
                  disabled={locating}
                >
                  {locating ? 'Finding you…' : 'Turn on location'}
                </button>
                {locNote && (
                  <p className="jx-err" role="status">
                    {locNote}
                  </p>
                )}
                <div className="jb-field">
                  <label htmlFor="jb-city">Or type your town</label>
                  <span className="jb-city">
                    <Input
                      id="jb-city"
                      type="text"
                      role="combobox"
                      aria-expanded={results.length > 0}
                      aria-controls="jb-city-list"
                      aria-autocomplete="list"
                      aria-activedescendant={active >= 0 ? `jb-city-${active}` : undefined}
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value)
                        setPlace(null)
                        if (e.target.value.trim().length < 2) setResults([])
                      }}
                      onKeyDown={onCityKey}
                      placeholder="San Diego"
                      autoComplete="off"
                      enterKeyHint="next"
                    />
                    {results.length > 0 && (
                      <ul id="jb-city-list" role="listbox" aria-label="Town suggestions" className="jb-list">
                        {results.map((r, i) => (
                          <li
                            key={`${r.label}-${r.lat}`}
                            id={`jb-city-${i}`}
                            role="option"
                            aria-selected={i === active || place?.label === r.label}
                          >
                            <button type="button" tabIndex={-1} onMouseDown={() => choose(r)}>
                              {r.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </span>
                </div>
                {place && (
                  <p className="jb-place" role="status">
                    <i className="fq-breathe" aria-hidden="true" />
                    {place.label}
                  </p>
                )}
                {err}
                <div className="jb-act">
                  {back}
                  <button className="btn fq-iri-btn" type="submit" disabled={pending}>
                    {pending ? 'One sec…' : place ? 'Continue' : 'Skip'}
                  </button>
                </div>
              </form>
            )}

            {current.id === 'sent' && (
              <div className="jx-f">
                <p className="jb-sub">
                  {sentTo ? (
                    <>
                      We sent a link to <b>{sentTo}</b>. Opening it activates your account and signs you in.
                    </>
                  ) : email ? (
                    <>
                      We’ll send an activation link to <b>{email}</b>. Opening it activates your account and signs
                      you in.
                    </>
                  ) : (
                    <>Open the link we sent you. It activates your account and signs you in.</>
                  )}
                </p>
                <p className="jb-consent">
                  By activating you agree to the <Link href="/terms">Terms</Link> and{' '}
                  <Link href="/privacy">Privacy Policy</Link>.
                </p>
                {sentTo && <p className="jx-fine jb-left">It can take a minute. Check spam if it hasn’t arrived.</p>}
                {err}
                {resent && (
                  <p className="jb-place" role="status">
                    <i className="fq-breathe" aria-hidden="true" />
                    Sent again.
                  </p>
                )}
                <div className="jb-act">
                  {back}
                  {email && !sentTo ? (
                    <button id="jb-confirm" className="btn fq-iri-btn" type="button" onClick={onResend} disabled={pending}>
                      {pending ? 'Sending…' : 'Confirm and send my link'}
                    </button>
                  ) : email ? (
                    <button
                      id="jb-resend"
                      className="btn btn-ghost fq-iri-rim"
                      type="button"
                      onClick={onResend}
                      disabled={pending}
                    >
                      {pending ? 'Sending…' : 'Send it again'}
                    </button>
                  ) : null}
                </div>
                <button
                  id="jb-other"
                  className="jb-skip"
                  type="button"
                  onClick={() => {
                    setSavedTo('')
                    setSentTo('')
                    setSave({ state: 'idle' })
                    setEmailShown(true)
                    focusNext.current = 'jb-email'
                    go(0)
                  }}
                >
                  Use a different email
                </button>
              </div>
            )}
          </section>

          <div className="jx-alt">
            Already have an account? <Link href="/sign-in">Log in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
