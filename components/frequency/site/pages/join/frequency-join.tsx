'use client'

// The /join BETA ENTRY on the Frequency design (SCAN-879, re-laid as a progressive slide in SCAN-888):
// the stock way in, one question at a time in a single centered card over a soft backdrop photo.
// Each answer drops into a chip above the next question, so the card visibly builds as they go.
//
//   1. What should we call you?        name
//   2. Where should we send your link? email. On Continue the answers are parked (the induction
//                                       cookie and the lead row) and the sign-in email goes out.
//   3. Add a face                       optional photo, saved the moment it is picked
//   4. Where are you?                   optional town: "Turn on location" (the browser's own prompt),
//                                       a typed town as the fallback
//   5. Check your email                 Send it again / Use a different email
//
// Back on every slide after the first, Enter advances, focus lands on each new slide's input, and the
// step change is announced. Under prefers-reduced-motion the slides swap without moving (the CSS).
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

/** The five slides, in order. Each is one question; the progress bar and the live region read this. */
const SLIDES = [
  { id: 'name', q: 'What should we call you?' },
  { id: 'email', q: 'Where should we send your link?' },
  { id: 'photo', q: 'Add a face' },
  { id: 'place', q: 'Where are you?' },
  { id: 'sent', q: 'Check your email' },
] as const
const LAST = SLIDES.length - 1
const PHOTO_SLIDE = 2
const PLACE_SLIDE = 3

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
  /** RESUME: 2 = this browser already sent its name and email, so it reopens on the photo slide. */
  initialStep?: 1 | 2
  initialName?: string
  initialHandle?: string
  initialPlace?: string
}) {
  const [side] = useSiteSide()
  const [slide, setSlide] = useState(initialStep === 2 ? PHOTO_SLIDE : 0)
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState('')
  /** The address the last link went to, so stepping back and forward does not send it twice. */
  const [sentTo, setSentTo] = useState('')
  const [handle, setHandle] = useState(initialHandle)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [resent, setResent] = useState(false)

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

  // Each slide hands its first control to this ref; focus moves there when the slide arrives.
  const focusRef = useRef<HTMLElement | null>(null)
  const setFocus = (el: HTMLElement | null) => {
    focusRef.current = el
  }
  const firstPaint = useRef(true)
  useEffect(() => {
    // The first question takes focus on arrival too (the page's only job); a resume does not.
    const resumed = firstPaint.current && initialStep === 2
    firstPaint.current = false
    if (!resumed) focusRef.current?.focus({ preventScroll: true })
  }, [slide, initialStep])

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
    setError('')
    setResent(false)
    setDir(to < slide ? 'back' : 'fwd')
    setSlide(Math.max(0, Math.min(LAST, to)))
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

  async function send(address: string): Promise<boolean> {
    const fd = new FormData()
    fd.set('email', address)
    fd.set('next', COMPLETE_PATH)
    const res = await sendSignupLink(fd)
    if (!res.ok) setError(res.error)
    else setSentTo(address)
    return res.ok
  }

  // Name -> email: nothing is saved yet; the name rides along with the email.
  function onName(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim()) return setError('Add your name so people know who they’re meeting.')
    go(1)
  }

  // Email -> photo: saved the moment they continue, and the link goes out.
  function onEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const displayName = name.trim()
    const address = email.trim()
    if (!displayName) return go(0)
    if (!EMAIL_RE.test(address)) return setError('That email doesn’t look right. Check it and try again.')
    if (address === sentTo) return go(PHOTO_SLIDE)
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
        if (await send(address)) go(PHOTO_SLIDE)
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
    setActive(-1)
  }

  async function turnOnLocation() {
    setLocNote('')
    setLocating(true)
    const pos = await getBrowserPosition()
    if (!pos) {
      setLocating(false)
      setLocNote('Location is off for this site. Type your town instead.')
      focusRef.current?.focus()
      return
    }
    const found = await reversePlace(pos.lat, pos.lng)
    setLocating(false)
    if (!found) {
      setLocNote('We found you but not your town’s name. Type it instead.')
      focusRef.current?.focus()
      return
    }
    choose(found)
  }

  // Arrow keys walk the suggestions; Enter on an open list picks one instead of moving on.
  function onCityKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + results.length) % results.length)
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
      if (await send(email.trim())) setResent(true)
    })
  }

  const looking = side === 'p'
  const current = SLIDES[slide]
  const photoSrc = safeUploadPreviewSrc(photo)
  const headingId = `jb-q-${current.id}`

  // The answers so far, shown as chips over the question; each one steps back to its slide.
  const chips: { key: string; label: string; value: string; to: number; avatar?: string }[] = []
  if (slide > 0 && name.trim()) chips.push({ key: 'name', label: 'Name', value: name.trim(), to: 0 })
  if (slide > 1 && email.trim()) chips.push({ key: 'email', label: 'Email', value: email.trim(), to: 1 })
  if (slide > PHOTO_SLIDE && photoSrc)
    chips.push({ key: 'photo', label: 'Photo', value: 'Photo added', to: PHOTO_SLIDE, avatar: photoSrc })
  if (slide > PLACE_SLIDE && place) chips.push({ key: 'place', label: 'Town', value: place.label, to: PLACE_SLIDE })

  const err = error ? (
    <p className="jx-err" role="alert">
      {error}
    </p>
  ) : null

  const back =
    slide > 0 ? (
      <button className="jb-back" type="button" onClick={() => go(slide - 1)} disabled={pending}>
        <span aria-hidden="true">←</span> Back
      </button>
    ) : null

  return (
    <div className="jb" data-screen-label={`0${slide + 1} ${current.q}`}>
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
              Beta launch · free, no card
            </span>
            <span className="jb-count" aria-hidden="true">
              {slide + 1} / {SLIDES.length}
            </span>
          </div>
          <div
            className="jb-bar"
            data-step={slide + 1}
            role="progressbar"
            aria-label="Joining"
            aria-valuemin={1}
            aria-valuemax={SLIDES.length}
            aria-valuenow={slide + 1}
            aria-valuetext={`Step ${slide + 1} of ${SLIDES.length}`}
          >
            <i />
          </div>

          {chips.length > 0 && (
            <ul className="jb-chips" aria-label="Your answers so far">
              {chips.map((c) => (
                <li key={c.key} className="jb-chip">
                  <button
                    type="button"
                    onClick={() => go(c.to)}
                    disabled={pending}
                    aria-label={`${c.label}: ${c.value}. Change`}
                  >
                    {c.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a blob: preview this browser minted
                      <img src={c.avatar} alt="" />
                    ) : (
                      <small>{c.label}</small>
                    )}
                    <span>{c.value}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {`Step ${slide + 1} of ${SLIDES.length}: ${current.q}`}
          </p>

          <section key={current.id} className="jb-slide" data-dir={dir} aria-labelledby={headingId}>
            <h1 id={headingId}>{current.q}</h1>

            {current.id === 'name' && (
              <form className="jx-f" noValidate onSubmit={onName}>
                <p className="jb-sub">The name people see when they meet you. First name is fine.</p>
                <label className="sr-only" htmlFor="jb-name">
                  Your name
                </label>
                <Input
                  id="jb-name"
                  ref={setFocus}
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Sam Rivera"
                  autoComplete="name"
                  enterKeyHint="next"
                />
                {err}
                <div className="jb-act">
                  <button className="btn fq-iri-btn" type="submit">
                    Continue
                  </button>
                </div>
                <p className="jx-fine">Press Enter to continue.</p>
              </form>
            )}

            {current.id === 'email' && (
              <form className="jx-f" noValidate onSubmit={onEmail}>
                <p className="jb-sub">We’ll email a link that signs you in. No password, no spam.</p>
                <label className="sr-only" htmlFor="jb-email">
                  Email
                </label>
                <Input
                  id="jb-email"
                  ref={setFocus}
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  autoComplete="email"
                  enterKeyHint="send"
                />
                {err}
                <div className="jb-act">
                  {back}
                  <button className="btn fq-iri-btn" type="submit" disabled={pending}>
                    {pending ? 'One sec…' : 'Send my link'}
                  </button>
                </div>
                <p className="jx-fine">Saved as soon as you continue.</p>
              </form>
            )}

            {current.id === 'photo' && (
              <form
                className="jx-f"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault()
                  go(PLACE_SLIDE)
                }}
              >
                <p className="jb-sub">Your link is on its way. While it travels: a photo helps people say yes. Optional.</p>
                <div className="jb-photo">
                  <button type="button" ref={setFocus} onClick={() => fileRef.current?.click()}>
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
                {err}
                <div className="jb-act">
                  {back}
                  <button className="btn fq-iri-btn" type="submit">
                    {photoSrc ? 'Continue' : 'Skip for now'}
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
                <label htmlFor="jb-city">Or type your town</label>
                <span className="jb-city">
                  <Input
                    id="jb-city"
                    ref={setFocus}
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
                    {pending ? 'One sec…' : place ? 'Continue' : 'Skip for now'}
                  </button>
                </div>
              </form>
            )}

            {current.id === 'sent' && (
              <div className="jx-f">
                <p className="jb-sub">
                  {email ? (
                    <>
                      We sent a sign-in link to <b>{email}</b>. Open it on this device and you’re in.
                    </>
                  ) : (
                    <>Open the sign-in link we sent you, on this device, and you’re in.</>
                  )}
                </p>
                <p className="jx-fine jb-left">It can take a minute. Check spam if it hasn’t arrived.</p>
                {err}
                {resent && (
                  <p className="jb-place" role="status">
                    <i className="fq-breathe" aria-hidden="true" />
                    Sent again.
                  </p>
                )}
                <div className="jb-act">
                  {back}
                  {email ? (
                    <button
                      ref={setFocus}
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
                  ref={email ? undefined : setFocus}
                  className="jb-skip"
                  type="button"
                  onClick={() => {
                    setSentTo('')
                    go(1)
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
