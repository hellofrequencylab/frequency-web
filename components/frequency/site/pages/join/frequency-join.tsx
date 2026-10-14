'use client'

// The /join BETA ENTRY on the Frequency design (SCAN-879): the stock way in, one short sequence with as
// little in the way as possible. Drawn in the Join template's two-pane grammar
// (templates/website/Join.html: `.jx`, `.jx-art`, `.jx-panel`, `.jx-box`, `.jx-f`).
//
//   1. Name and email. Saved the moment they are sent (the parked-induction cookie and the lead row),
//      and the sign-in email goes out straight away.
//   2. A photo and a place: "Turn on location" (the browser's own prompt), a typed town as the fallback.
//      Both are optional; each is saved as it is given.
//   3. Check your email. The link signs them in at /join/complete, which writes the profile.
//
// 🔴 NO NEW AUTH PATH AND NO NEW DATA. Everything runs through actions that already exist:
//   · stashPendingInduction parks the answers in the cookie /join/complete's finalizer reads after sign-in
//     (finalizePendingInduction -> writeInduction), exactly as the deferred induction does;
//   · captureLead / updateLead keep the follow-up lead row, bounded so lead bookkeeping never holds anyone
//     on a spinner;
//   · sendSignupLink is signInWithMagicLink's own send (same throttle, same post-login cookie, same signup
//     OTP), returning instead of redirecting so the visitor stays for step 2;
//   · the photo is parked in localStorage under the key the finalizer uploads from, shrunk first through
//     the same prep the induction uses (prepareImageForUpload + downscaleImageFile).
// The profile needs a handle; the induction asks for one, this entry derives it from the name (the
// induction's own suggestion rule) and checks it against /api/check-handle, adding digits if it is taken.
// A member changes it later in settings.
//
// CHROME. app/join/(induction)/page.tsx renders this inside the site shell (<SiteShell>); this body is
// the page between the header and the footer (a `div.jx`, since the shell owns <main>).

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useSiteSide } from '@/components/frequency/site/shell/site-root'
import '@/app/themes/active/site-pages-b'
import { stashPendingInduction } from '@/app/join/(induction)/actions'
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
const STEP_LABELS = ['Your name', 'Your photo and place', 'Check your email'] as const

type Step = 1 | 2 | 3
type Place = { label: string; lat: number | null; lng: number | null }

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
  /** RESUME: a browser that already sent its name and email reopens on step 2. */
  initialStep?: 1 | 2
  initialName?: string
  initialHandle?: string
  initialPlace?: string
}) {
  const [side] = useSiteSide()
  const [step, setStep] = useState<Step>(initialStep)
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState('')
  const [handle, setHandle] = useState(initialHandle)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [resent, setResent] = useState(false)

  // Step 2
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [place, setPlace] = useState<Place | null>(initialPlace ? { label: initialPlace, lat: null, lng: null } : null)
  const [locating, setLocating] = useState(false)
  const [locNote, setLocNote] = useState('')
  const [query, setQuery] = useState(initialPlace)
  const [results, setResults] = useState<PlaceSuggestion[]>([])
  const cityRef = useRef<HTMLInputElement>(null)

  // Move focus to the new step's panel, so keyboard and screen-reader users land on it.
  const boxRef = useRef<HTMLDivElement>(null)
  const firstPaint = useRef(true)
  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false
      return
    }
    boxRef.current?.focus({ preventScroll: true })
  }, [step])

  // Town typeahead (Photon, the same source the induction's city field uses).
  useEffect(() => {
    const term = query.trim()
    if (term.length < 2 || term === place?.label) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => setResults(await searchPlaces(term, ctrl.signal)), 280)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query, place])

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

  async function send(address: string): Promise<boolean> {
    const fd = new FormData()
    fd.set('email', address)
    fd.set('next', COMPLETE_PATH)
    const res = await sendSignupLink(fd)
    if (!res.ok) setError(res.error)
    return res.ok
  }

  function onStart(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const displayName = name.trim()
    const address = email.trim()
    if (!displayName) return setError('Add your name so people know who they’re meeting.')
    if (!EMAIL_RE.test(address)) return setError('That email doesn’t look right. Check it and try again.')
    setError('')
    startTransition(async () => {
      try {
        const h = handle || (await pickHandle(displayName))
        setHandle(h)
        // Saved first: the answers outlive a failed send, a closed tab, or a link opened tomorrow.
        await park({ displayName, handle: h, place, beat: 1 })
        await bounded(
          captureLead({ email: address, step: 1, source: 'beta_induction', displayName, handle: h, payload: { entry: 'beta' } }),
        )
        if (await send(address)) setStep(2)
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
    } catch {
      setPhotoError('That photo would not save here. You can add one later from your profile.')
    }
  }

  function choose(p: PlaceSuggestion) {
    setPlace(p)
    setQuery(p.label)
    setResults([])
  }

  async function turnOnLocation() {
    setLocNote('')
    setLocating(true)
    const pos = await getBrowserPosition()
    if (!pos) {
      setLocating(false)
      setLocNote('Location is off for this site. Type your town instead.')
      cityRef.current?.focus()
      return
    }
    const found = await reversePlace(pos.lat, pos.lng)
    setLocating(false)
    if (!found) {
      setLocNote('We found you but not your town’s name. Type it instead.')
      cityRef.current?.focus()
      return
    }
    choose(found)
  }

  function onFinish(skip: boolean) {
    setError('')
    startTransition(async () => {
      try {
        const chosen = skip ? null : place
        if (chosen) {
          await park({ displayName: name.trim(), handle, place: chosen, beat: 2 })
          void updateLead({ step: 2, payload: { location: chosen.label } }).catch(() => {})
        }
        setStep(3)
      } catch {
        setError('Something went wrong on our side. Try again in a moment.')
      }
    })
  }

  function onResend() {
    setError('')
    setResent(false)
    startTransition(async () => {
      if (await send(email.trim())) setResent(true)
    })
  }

  const looking = side === 'p'
  const label = STEP_LABELS[step - 1]
  const photoSrc = safeUploadPreviewSrc(photo)

  return (
    <div className="jx" data-screen-label={`0${step} ${label}`}>
      <div className="jx-art">
        <Image
          src={looking ? '/brand/frequency/photos/day-meditation-circle.jpg' : '/brand/frequency/photos/gathering-09.jpg'}
          alt={looking ? 'A circle of people sitting together outdoors' : 'A regular group mid-session at a studio'}
          fill
          priority
          sizes="(max-width: 900px) 100vw, 52vw"
        />
        <span className="rings" aria-hidden="true" />
        <div className="jx-q">
          <span className="k">Beta launch</span>
          <blockquote>
            A hundred contacts. <em>No one to call on a Tuesday.</em>
          </blockquote>
          <span className="jx-proof">
            <i className="fq-breathe" />
            <span>Free while we’re in beta. No card.</span>
          </span>
        </div>
      </div>
      <div className="jx-panel">
        <div
          key={step}
          ref={boxRef}
          tabIndex={-1}
          role="group"
          aria-label={`Step ${step} of 3: ${label}`}
          className="jx-box jb-box"
        >
          <ol className="jb-steps" aria-label={`Step ${step} of 3`}>
            {STEP_LABELS.map((s, i) => (
              <li key={s} data-on={i + 1 <= step} aria-current={i + 1 === step ? 'step' : undefined}>
                <span className="sr-only">{s}</span>
              </li>
            ))}
          </ol>

          {step === 1 && (
            <>
              <div>
                <h1>Get started</h1>
              </div>
              <p className="sub">Your name and email. That’s it. We’ll send a link to sign you in.</p>
              <form className="jx-f" noValidate onSubmit={onStart}>
                <label>
                  Your name
                  <Input
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Sam Rivera"
                    autoComplete="name"
                  />
                </label>
                <label>
                  Email
                  <Input
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </label>
                {error && (
                  <p className="jx-err" role="alert">
                    {error}
                  </p>
                )}
                <button className="btn fq-iri-btn" type="submit" disabled={pending}>
                  {pending ? 'One sec…' : 'Continue'}
                </button>
                <p className="jx-fine">Saved as soon as you continue. No feed, no spam.</p>
              </form>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h1>Add a face and a place</h1>
              </div>
              <p className="sub">
                Your link is on its way. While it travels: a photo helps people say yes, and your town shows you
                what’s near.
              </p>

              <div className="jb-photo">
                <button type="button" onClick={() => fileRef.current?.click()}>
                  {photoSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a blob: preview this browser minted
                    <img src={photoSrc} alt="Your photo" className="jb-av" />
                  ) : (
                    <span className="jb-av" aria-hidden="true">
                      {getInitials(name) || '?'}
                    </span>
                  )}
                  <span>{photoSrc ? 'Change photo' : 'Add a photo'}</span>
                </button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
              </div>
              {photoError && <p className="jx-err">{photoError}</p>}

              <div className="jx-f">
                <div className="jb-loc">
                  <span className="jb-loc-k">Your town</span>
                  <button className="btn btn-ghost fq-iri-rim" type="button" onClick={turnOnLocation} disabled={locating}>
                    {locating ? 'Finding you…' : 'Turn on location'}
                  </button>
                  <span className="jx-fine jb-left">Your browser asks first. We keep the town, not your street.</span>
                  {locNote && (
                    <p className="jx-err" role="status">
                      {locNote}
                    </p>
                  )}
                </div>
                <label>
                  Or type your town
                  <span className="jb-city">
                    <Input
                      ref={cityRef}
                      type="text"
                      role="combobox"
                      aria-expanded={results.length > 0}
                      aria-controls="jb-city-list"
                      aria-autocomplete="list"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value)
                        setPlace(null)
                        if (e.target.value.trim().length < 2) setResults([])
                      }}
                      placeholder="San Diego"
                      autoComplete="off"
                    />
                    {results.length > 0 && (
                      <ul id="jb-city-list" role="listbox" aria-label="Town suggestions" className="jb-list">
                        {results.map((r) => (
                          <li key={`${r.label}-${r.lat}`} role="option" aria-selected={place?.label === r.label}>
                            <button type="button" onMouseDown={() => choose(r)}>
                              {r.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </span>
                </label>
                {place && (
                  <p className="jb-place" role="status">
                    <i className="fq-breathe" aria-hidden="true" />
                    {place.label}
                  </p>
                )}
                {error && (
                  <p className="jx-err" role="alert">
                    {error}
                  </p>
                )}
                <button className="btn fq-iri-btn" type="button" onClick={() => onFinish(false)} disabled={pending}>
                  {pending ? 'One sec…' : 'Continue'}
                </button>
                <button className="jb-skip" type="button" onClick={() => onFinish(true)} disabled={pending}>
                  Skip for now
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <h1>Check your email</h1>
              </div>
              <p className="sub">
                {email ? (
                  <>
                    We sent a sign-in link to <b>{email}</b>. Open it on this device and you’re in.
                  </>
                ) : (
                  <>Open the sign-in link we sent you, on this device, and you’re in.</>
                )}
              </p>
              <p className="jx-fine jb-left">It can take a minute. Check spam if it hasn’t arrived.</p>
              {error && (
                <p className="jx-err" role="alert">
                  {error}
                </p>
              )}
              {resent && (
                <p className="jb-place" role="status">
                  <i className="fq-breathe" aria-hidden="true" />
                  Sent again.
                </p>
              )}
              <div className="jx-f">
                {email && (
                  <button className="btn btn-ghost fq-iri-rim" type="button" onClick={onResend} disabled={pending}>
                    {pending ? 'Sending…' : 'Send it again'}
                  </button>
                )}
                <button
                  className="jb-skip"
                  type="button"
                  onClick={() => {
                    setError('')
                    setResent(false)
                    setStep(1)
                  }}
                >
                  Use a different email
                </button>
              </div>
            </>
          )}

          <div className="jx-alt">
            Already have an account? <Link href="/sign-in">Log in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
