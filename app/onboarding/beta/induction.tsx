'use client'

// Beta induction — the founding-cohort flow (ADR-068, docs/BETA-INDUCTION.md).
// TEMPORARY: deleted at launch. Centered, warm-light cinematic sequence; logo on
// top, content centered with a generous buffer, progress pinned to the bottom.
// Scripted Vera (hot register). The `preview` prop mocks the auth writes; the
// city search + reel run for real in preview too.

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import { searchPlaces, type PlaceSuggestion } from '@/lib/geocode'
import { BETA_OATHS, VERA, REEL, HEARD_ABOUT, type OathId } from '@/lib/onboarding/beta-script'
import { acceptBetaOath, completeBetaInduction } from './actions'
import { FeedRender } from '@/components/onboarding/renders/feed-render'
import { CirclesRender } from '@/components/onboarding/renders/circles-render'
import { EventsRender } from '@/components/onboarding/renders/events-render'

type HandleStatus = 'idle' | 'checking' | 'available' | 'taken'

type Props = {
  userId: string
  userEmail: string
  initialHandle: string
  /** Legacy prop (region list) — no longer used; city is free-search now. */
  regions?: { id: string; name: string }[]
  /** Preview mode: no auth, no server writes — for the public /preview route only. */
  preview?: boolean
}

const HANDLE_RE = /^[a-z0-9_]+$/
const RENDERS = { feed: FeedRender, circles: CirclesRender, events: EventsRender }
const BEAT_COUNT = 6 // 0 oath · 1 intro · 2 reel · 3 identity · 4 place · 5 enter

// No separator — "Daniel Tyack" → "danieltyack".
function suggestHandle(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30)
}

function ArrowRight() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      <path d="M4 10h11M11 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function BetaInduction({ userId, userEmail, initialHandle, preview = false }: Props) {
  const [beat, setBeat] = useState(0)
  const [previewDone, setPreviewDone] = useState(false)

  // Oath
  const [oaths, setOaths] = useState<Record<OathId, boolean>>({ unfinished: false, report: false, build: false })
  const [accepting, setAccepting] = useState(false)
  const allOathsChecked = BETA_OATHS.every((o) => oaths[o.id])

  // Identity
  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [handleTouched, setHandleTouched] = useState(false)
  const [check, setCheck] = useState<{ handle: string; result: 'available' | 'taken' | 'idle' } | null>(null)
  const [bio, setBio] = useState('')
  const [interests, setInterests] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Place (free city search via Photon)
  const [locQuery, setLocQuery] = useState('')
  const [location, setLocation] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locResults, setLocResults] = useState<PlaceSuggestion[]>([])
  const [locOpen, setLocOpen] = useState(false)
  const [intent, setIntent] = useState('')
  const [heardAbout, setHeardAbout] = useState('')

  // Reel
  const [reelIndex, setReelIndex] = useState(0)

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Debounced handle uniqueness check.
  useEffect(() => {
    if (preview) return
    const valid = handle.length >= 3 && HANDLE_RE.test(handle)
    if (!valid || handle === initialHandle) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/check-handle?handle=${encodeURIComponent(handle)}&userId=${encodeURIComponent(userId)}`)
        const { available } = (await res.json()) as { available: boolean }
        if (!cancelled) setCheck({ handle, result: available ? 'available' : 'taken' })
      } catch {
        if (!cancelled) setCheck({ handle, result: 'idle' })
      }
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [handle, initialHandle, userId, preview])

  // City autocomplete (Photon / OpenStreetMap — no prepopulated list, runs in the
  // browser, same source as the Circles page).
  useEffect(() => {
    const term = locQuery.trim()
    if (term === location) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      if (term.length < 2) {
        setLocResults([])
        return
      }
      const r = await searchPlaces(term, ctrl.signal)
      setLocResults(r)
      setLocOpen(true)
    }, 280)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [locQuery, location])

  // Auto-advance the reel one slide at a time; settle on the last (no loop).
  useEffect(() => {
    if (beat !== 2 || reelIndex >= REEL.length - 1) return
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setTimeout(() => setReelIndex((i) => Math.min(i + 1, REEL.length - 1)), 3800)
    return () => clearTimeout(t)
  }, [beat, reelIndex])

  const formatOk = handle.length >= 3 && HANDLE_RE.test(handle)
  const handleStatus: HandleStatus = !formatOk
    ? 'idle'
    : preview || handle === initialHandle
    ? 'available'
    : check && check.handle === handle
    ? check.result
    : 'checking'
  const identityValid = displayName.trim().length > 0 && formatOk && handleStatus === 'available'

  // ── Helpers ────────────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setUploadError('')
    setAvatarUrl('')
  }

  async function uploadAvatar(): Promise<string> {
    if (!avatarFile) return ''
    setUploading(true)
    setUploadError('')
    const supabase = createClient()
    const ext = avatarFile.name.split('.').pop() ?? 'jpg'
    const path = `${userId}/avatar.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true })
    if (error) {
      setUploadError('Upload failed. You can add a photo later from your profile.')
      setUploading(false)
      return ''
    }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    setAvatarUrl(publicUrl)
    setUploading(false)
    return publicUrl
  }

  async function passOath() {
    setAccepting(true)
    const accepted = BETA_OATHS.filter((o) => oaths[o.id]).map((o) => o.id)
    if (!preview) {
      try {
        await acceptBetaOath(accepted)
      } catch {
        // Non-fatal: completion re-affirms the oath.
      }
    }
    setAccepting(false)
    setBeat(1)
  }

  async function advanceFromIdentity() {
    if (!preview && avatarFile && !avatarUrl) await uploadAvatar()
    setBeat(4)
  }

  async function submit() {
    if (preview) {
      setPreviewDone(true)
      return
    }
    setSubmitting(true)
    setSubmitError('')
    let finalAvatarUrl = avatarUrl
    if (avatarFile && !avatarUrl) finalAvatarUrl = await uploadAvatar()
    const accepted = BETA_OATHS.filter((o) => oaths[o.id]).map((o) => o.id)
    try {
      await completeBetaInduction({
        displayName: displayName.trim(),
        handle,
        bio,
        avatarUrl: finalAvatarUrl,
        location,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        intent,
        interests,
        heardAbout,
        oaths: accepted,
      })
      // Redirects to /feed?intro=1 on success; execution stops here.
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  function renderAvatar() {
    if (avatarPreview) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={avatarPreview} alt="Avatar preview" className="h-24 w-24 rounded-full object-cover shrink-0 ring-2 ring-primary" />
    }
    const initials = getInitials(displayName || userEmail)
    return (
      <div className="h-24 w-24 rounded-full bg-primary-bg text-3xl text-primary-strong font-semibold flex items-center justify-center shrink-0">
        {initials || '?'}
      </div>
    )
  }

  // ── Styles (warm light throughout) ───────────────────────────────────────────
  const inputInset =
    'w-full rounded-xl border border-border bg-marketing-canvas px-4 py-3 text-base text-text placeholder:text-subtle transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25'
  const fieldLabel = 'mb-1.5 block text-left text-xs font-semibold uppercase tracking-wider text-subtle'
  const backLink = 'text-sm font-medium text-subtle underline-offset-4 transition-colors hover:text-muted hover:underline'
  const btnPrimary =
    'text-emboss inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-primary px-8 py-4 text-base font-semibold text-on-primary shadow-lg shadow-primary/25 transition-all hover:bg-primary-hover enabled:hover:-translate-y-0.5 enabled:hover:shadow-xl disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0'
  const eyebrow = 'text-sm font-semibold uppercase tracking-[0.25em] text-primary'
  const heading = 'font-display uppercase leading-[1.0] text-[var(--brand-mark)]'

  const slide = REEL[reelIndex]
  const isLastSlide = reelIndex >= REEL.length - 1

  return (
    <main className="relative min-h-screen overflow-hidden bg-marketing-canvas">
      {/* Soft warm glow (Hook-style), centered behind the content. */}
      <div aria-hidden className="pointer-events-none fixed left-1/2 top-1/2 h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-[0.09] blur-[160px]" />

      {/* Preview-only badge (subtle; public /preview route; ADR-068). */}
      {preview && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center">
          <span className="rounded-full bg-black/5 px-3 py-1 text-[11px] font-medium text-subtle backdrop-blur-sm">
            Preview · nothing is saved
          </span>
        </div>
      )}

      {/* Preview end-state. */}
      {preview && previewDone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-7 text-center shadow-lg">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-bg text-2xl text-primary-strong">✓</div>
            <h2 className="mt-4 text-xl font-bold text-text">Welcome in, Founder.</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              In the real induction this writes your profile and drops you into the feed to make your
              first post. Here it just stops, nothing was saved.
            </p>
            <button
              onClick={() => {
                setPreviewDone(false)
                setBeat(0)
                setReelIndex(0)
                setOaths({ unfinished: false, report: false, build: false })
              }}
              className="mt-5 w-full rounded-full border border-border px-6 py-3 text-sm font-semibold text-muted transition-colors hover:text-text"
            >
              Run it again
            </button>
          </div>
        </div>
      )}

      {/* Stage: one centered column — logo, content, progress — with tight, consistent gaps. */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-12">
        <div className="flex shrink-0 flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-subtle">Beta</span>
          <span className="brandmark-link mt-5 block">
            <span className="brandmark h-12 aspect-[963/170] sm:h-[52px]" aria-hidden />
          </span>
        </div>

        <div key={beat} className="mt-10 w-full animate-[slideUp_0.5s_ease-out] text-center">
            {/* ── Beat 0: The Oath ── */}
            {beat === 0 && (
              <div className="mx-auto max-w-5xl">
                <p className={eyebrow}>{VERA.oath.eyebrow}</p>
                <h1 className={`mt-3 text-6xl sm:text-7xl ${heading}`}>
                  This isn&rsquo;t a product.
                  <br />
                  It&rsquo;s a promise.
                </h1>
                <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">{VERA.oath.body}</p>

                {/* Agreements + I'm in, in a 2×2 grid (two rows). */}
                <div className="mx-auto mt-7 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                  {BETA_OATHS.map((o) => (
                    <label
                      key={o.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-colors ${oaths[o.id] ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:border-primary/40'}`}
                    >
                      <input
                        type="checkbox"
                        checked={oaths[o.id]}
                        onChange={(e) => setOaths((prev) => ({ ...prev, [o.id]: e.target.checked }))}
                        className="h-5 w-5 shrink-0 accent-primary"
                      />
                      <span className={`text-base font-medium ${oaths[o.id] ? 'text-text' : 'text-muted'}`}>{o.label}</span>
                    </label>
                  ))}
                  <button disabled={!allOathsChecked || accepting} onClick={passOath} className={`${btnPrimary} h-full`}>
                    {accepting ? 'One sec…' : VERA.oath.cta}
                    {!accepting && <ArrowRight />}
                  </button>
                </div>
              </div>
            )}

            {/* ── Beat 1: Intro ── */}
            {beat === 1 && (
              <div className="mx-auto max-w-4xl">
                <p className={eyebrow}>{VERA.intro.eyebrow}</p>
                <h1 className={`mt-3 text-6xl sm:text-7xl ${heading}`}>
                  You&rsquo;re not a user.
                  <br />
                  You&rsquo;re a Founder.
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-xl leading-relaxed text-muted">{VERA.intro.body}</p>
                <div className="mt-8 flex flex-col items-center gap-3">
                  <button onClick={() => setBeat(2)} className={btnPrimary}>{VERA.intro.cta}<ArrowRight /></button>
                  <button onClick={() => setBeat(0)} className={backLink}>Back</button>
                </div>
              </div>
            )}

            {/* ── Beat 2: The reel (desktop website mockup) ── */}
            {beat === 2 && (
              <div className="mx-auto max-w-5xl">
                <p className={eyebrow}>{VERA.tour.eyebrow}</p>
                <h1 className={`mt-3 text-4xl sm:text-5xl ${heading}`}>{VERA.tour.heading}</h1>

                <div className="mt-6 flex flex-col items-center gap-8 md:flex-row md:items-center md:justify-center md:gap-12">
                  {/* desktop mockup, left */}
                  <div className="relative w-full max-w-xl shrink-0" style={{ aspectRatio: '540 / 348' }}>
                    {REEL.map((s, i) => {
                      const active = i === reelIndex
                      const C = s.kind === 'render' ? RENDERS[s.render] : null
                      return (
                        <div key={i} className={`absolute inset-0 transition-opacity duration-700 ${active ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                          {C && <C animate={active} />}
                        </div>
                      )
                    })}
                  </div>

                  {/* caption + dots + action, right */}
                  <div className="max-w-xs text-center md:text-left">
                    <p className="text-3xl font-bold text-text">{slide.title}</p>
                    <p className="mt-2 text-lg leading-relaxed text-muted">{slide.line}</p>
                    <div className="mt-5 flex items-center justify-center gap-2 md:justify-start">
                      {REEL.map((s, i) => (
                        <button
                          key={i}
                          aria-label={`Show ${s.title}`}
                          onClick={() => setReelIndex(i)}
                          className={`h-2 rounded-full transition-all ${i === reelIndex ? 'w-6 bg-primary' : 'w-2 bg-border-strong hover:bg-primary/60'}`}
                        />
                      ))}
                    </div>
                    <div className="mt-7 flex flex-col items-center gap-3 md:items-start">
                      <button onClick={() => (isLastSlide ? setBeat(3) : setReelIndex(reelIndex + 1))} className={btnPrimary}>
                        {isLastSlide ? VERA.tour.cta : 'Next'}
                        <ArrowRight />
                      </button>
                      <button onClick={() => setBeat(1)} className={backLink}>Back</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Beat 3: Identity ── */}
            {beat === 3 && (
              <div className="mx-auto max-w-4xl">
                <h1 className={`text-5xl sm:text-6xl ${heading}`}>{VERA.identity.heading}</h1>

                <div className="mt-7 flex flex-col items-center gap-8 text-left md:flex-row md:items-center md:justify-center md:gap-10">
                  {/* left: form card */}
                  <div className="w-full max-w-sm space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
                    <div>
                      <label className={fieldLabel}>Display name</label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => {
                          const v = e.target.value
                          setDisplayName(v)
                          if (!handleTouched) setHandle(suggestHandle(v))
                        }}
                        placeholder="Your name"
                        autoFocus
                        className={inputInset}
                      />
                    </div>
                    <div>
                      <label className={fieldLabel}>Handle</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-subtle">@</span>
                        <input
                          type="text"
                          value={handle}
                          onChange={(e) => {
                            setHandleTouched(true)
                            setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                          }}
                          placeholder="yourname"
                          className={`${inputInset} pl-9 pr-9`}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm leading-none">
                          {handleStatus === 'checking' && <span className="animate-pulse text-subtle">•••</span>}
                          {handleStatus === 'available' && <span className="text-success">✓</span>}
                          {handleStatus === 'taken' && <span className="text-danger">✗</span>}
                        </span>
                      </div>
                      {handleStatus === 'taken' && <p className="mt-1.5 text-left text-xs text-danger">That handle is already taken.</p>}
                    </div>
                    <div>
                      <label className={fieldLabel}>One-line bio <span className="font-normal normal-case text-subtle">· optional</span></label>
                      <input
                        type="text"
                        value={bio}
                        onChange={(e) => setBio(e.target.value.slice(0, 140))}
                        placeholder="Coffee, trail runs, and good books."
                        className={inputInset}
                      />
                    </div>
                    <div>
                      <label className={fieldLabel}>What are you into? <span className="font-normal normal-case text-subtle">· optional</span></label>
                      <input
                        type="text"
                        value={interests}
                        onChange={(e) => setInterests(e.target.value.slice(0, 120))}
                        placeholder="hiking, vinyl, cold plunges…"
                        className={inputInset}
                      />
                    </div>
                  </div>

                  {/* right: avatar over the copy, button under */}
                  <div className="flex w-full max-w-xs flex-col items-center gap-4 text-center md:items-start md:text-left">
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="group">
                      <div className="rounded-full ring-4 ring-surface shadow-sm">{renderAvatar()}</div>
                      <span className="mt-2 block text-center text-xs font-semibold text-primary group-hover:underline">
                        {avatarPreview ? 'Change photo' : 'Add a photo'}
                      </span>
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    {uploadError && <p className="text-xs text-danger">{uploadError}</p>}
                    <p className="text-lg leading-relaxed text-muted">{VERA.identity.body}</p>
                    <div className="mt-2 flex flex-col items-center gap-3 md:items-start">
                      <button disabled={!identityValid || uploading} onClick={advanceFromIdentity} className={btnPrimary}>
                        {uploading ? 'Uploading…' : 'Continue'}{!uploading && <ArrowRight />}
                      </button>
                      <button onClick={() => setBeat(2)} className={backLink}>Back</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Beat 4: Place + intent ── */}
            {beat === 4 && (
              <div className="mx-auto max-w-4xl">
                <h1 className={`text-5xl sm:text-6xl ${heading}`}>{VERA.place.heading}</h1>

                <div className="mt-7 flex flex-col items-center gap-8 text-left md:flex-row md:items-center md:justify-center md:gap-10">
                  <div className="w-full max-w-sm space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
                  <div>
                    <label className={fieldLabel}>Your city</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={locQuery}
                        onChange={(e) => {
                          setLocQuery(e.target.value)
                          setLocation('')
                          setCoords(null)
                          setLocOpen(true)
                        }}
                        onFocus={() => locResults.length > 0 && setLocOpen(true)}
                        onBlur={() => setTimeout(() => setLocOpen(false), 150)}
                        placeholder="Start typing your city…"
                        className={inputInset}
                        autoComplete="off"
                      />
                      {location && <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-success">✓</span>}
                      {locOpen && locResults.length > 0 && (
                        <ul className="absolute z-20 mt-2 max-h-56 w-full overflow-auto rounded-xl border border-border bg-surface shadow-lg">
                          {locResults.map((r) => (
                            <li key={`${r.label}-${r.lat}`}>
                              <button
                                type="button"
                                onMouseDown={() => {
                                  setLocation(r.label)
                                  setLocQuery(r.label)
                                  setCoords({ lat: r.lat, lng: r.lng })
                                  setLocOpen(false)
                                }}
                                className="block w-full px-4 py-2.5 text-left text-base text-text transition-colors hover:bg-primary-bg"
                              >
                                {r.label}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className={fieldLabel}>{VERA.place.intentLabel}</label>
                    <textarea
                      value={intent}
                      onChange={(e) => setIntent(e.target.value.slice(0, 500))}
                      placeholder={VERA.place.intentPlaceholder}
                      rows={3}
                      className={`${inputInset} resize-none`}
                    />
                  </div>

                  <div>
                    <label className={fieldLabel}>How did you hear about us?</label>
                    <select value={heardAbout} onChange={(e) => setHeardAbout(e.target.value)} className={inputInset}>
                      <option value="">Choose one…</option>
                      {HEARD_ABOUT.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  </div>

                  {/* right: copy + actions under it */}
                  <div className="w-full max-w-xs text-center md:text-left">
                    <p className="text-lg leading-relaxed text-muted">{VERA.place.body}</p>
                    <div className="mt-6 flex flex-col items-center gap-3 md:items-start">
                      <button onClick={() => setBeat(5)} className={btnPrimary}>Continue<ArrowRight /></button>
                      <button onClick={() => setBeat(3)} className={backLink}>Back</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Beat 5: Enter (profile card left, copy right) ── */}
            {beat === 5 && (
              <div className="mx-auto max-w-4xl">
                <p className={eyebrow}>{VERA.enter.eyebrow}</p>
                <h1 className={`mt-3 text-5xl sm:text-6xl ${heading}`}>{VERA.enter.heading}</h1>

                <div className="mt-7 flex flex-col items-center gap-8 md:flex-row md:items-center md:justify-center md:gap-10">
                  {/* portrait profile card with blank slots */}
                  <div className="w-72 shrink-0 rounded-3xl border border-border bg-surface p-7 text-center shadow-sm">
                    <div className="mx-auto w-fit rounded-full ring-4 ring-surface">{renderAvatar()}</div>
                    <p className="mt-4 text-xl font-semibold text-text">{displayName || <span className="text-subtle">Your name</span>}</p>
                    <p className="text-sm text-muted">@{handle || 'handle'}</p>
                    <div className="mt-4 space-y-2 border-t border-border pt-4 text-left text-sm">
                      <p className="text-text">{location || <span className="italic text-subtle">Add your city</span>}</p>
                      <p className="text-muted">{bio || <span className="italic text-subtle">Add a one-line bio</span>}</p>
                      <p className="text-muted">{interests || <span className="italic text-subtle">What you’re into</span>}</p>
                    </div>
                  </div>

                  {/* copy + button under it, right */}
                  <div className="w-full max-w-xs text-center md:text-left">
                    <p className="text-lg leading-relaxed text-muted">{VERA.enter.body}</p>
                    {submitError && <p className="mt-3 text-sm text-danger">{submitError}</p>}
                    <div className="mt-6 flex flex-col items-center gap-3 md:items-start">
                      <button onClick={submit} disabled={submitting} className={btnPrimary}>
                        {submitting ? 'Stepping in…' : VERA.enter.cta}{!submitting && <ArrowRight />}
                      </button>
                      <button onClick={() => setBeat(4)} className={backLink}>Back</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

        {/* Progress — tight under the content. */}
        <div className="mt-9 w-full max-w-sm shrink-0">
          <div className="flex w-full items-center gap-1.5">
            {Array.from({ length: BEAT_COUNT }).map((_, i) => (
              <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-700 ${i <= beat ? 'bg-primary' : 'bg-border-strong'}`} />
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
