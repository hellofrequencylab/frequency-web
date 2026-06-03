'use client'

// Beta induction — the founding-cohort flow (ADR-068, docs/BETA-INDUCTION.md).
// TEMPORARY: deleted at launch. A centered, cinematic sequence on a warm light
// stage (Hook-style: warm canvas + soft amber glow), content always centered
// with a top/bottom buffer. Scripted Vera (hot register). Handle-check +
// avatar-upload mirror the legacy form. The `preview` prop mocks auth-dependent
// calls for the public demo.

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import { BETA_OATHS, VERA, REEL, HEARD_ABOUT, type OathId } from '@/lib/onboarding/beta-script'
import { acceptBetaOath, completeBetaInduction } from './actions'
import { FeedRender } from '@/components/onboarding/renders/feed-render'
import { CirclesRender } from '@/components/onboarding/renders/circles-render'
import { EventsRender } from '@/components/onboarding/renders/events-render'

type Region = { id: string; name: string }
type HandleStatus = 'idle' | 'checking' | 'available' | 'taken'

type Props = {
  userId: string
  userEmail: string
  initialHandle: string
  regions: Region[]
  /** Preview mode: no auth, no server writes — for the public /preview route only. */
  preview?: boolean
}

const HANDLE_RE = /^[a-z0-9_]+$/
const RENDERS = { feed: FeedRender, circles: CirclesRender, events: EventsRender }
const BEAT_COUNT = 6 // 0 oath · 1 intro · 2 reel · 3 identity · 4 place · 5 enter

// The Frequency wordmark, filled with currentColor so it inherits the text color.
const LOGO_MASK: React.CSSProperties = {
  backgroundColor: 'currentColor',
  WebkitMaskImage: "url('/frequency-logo.png')",
  maskImage: "url('/frequency-logo.png')",
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  WebkitMaskPosition: 'center',
  maskPosition: 'center',
  WebkitMaskSize: 'contain',
  maskSize: 'contain',
}

// No separator — "Daniel Tyack" → "danieltyack" (no dashes or underscores).
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

export default function BetaInduction({ userId, userEmail, initialHandle, regions, preview = false }: Props) {
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
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Place
  const [regionId, setRegionId] = useState('')
  const [regionQuery, setRegionQuery] = useState('')
  const [regionOpen, setRegionOpen] = useState(false)
  const [intent, setIntent] = useState('')
  const [heardAbout, setHeardAbout] = useState('')

  // Reel
  const [reelIndex, setReelIndex] = useState(0)

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Debounced handle uniqueness check (identical to the legacy form).
  useEffect(() => {
    if (preview) return // no backend in preview; handle is always "available"
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

  // Auto-advance the reel (paused under prefers-reduced-motion).
  useEffect(() => {
    if (beat !== 2) return
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setReelIndex((i) => (i + 1) % REEL.length), 3800)
    return () => clearInterval(t)
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

  const regionMatches = regions
    .filter((r) => r.name.toLowerCase().includes(regionQuery.trim().toLowerCase()))
    .slice(0, 6)

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
        // Non-fatal: completion re-affirms the oath. Don't block the founder.
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
        bio: '',
        avatarUrl: finalAvatarUrl,
        regionId,
        intent,
        heardAbout,
        oaths: accepted,
      })
      // Redirects to /circles on success; execution stops here.
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
  const inputCls =
    'w-full rounded-2xl border border-border bg-surface px-5 py-4 text-base text-text placeholder:text-subtle shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25'
  const backLink = 'text-sm font-medium text-subtle underline-offset-4 transition-colors hover:text-muted hover:underline'
  const btnPrimary =
    'inline-flex items-center justify-center gap-2 rounded-full bg-primary px-10 py-4 text-base font-semibold text-on-primary shadow-lg shadow-primary/25 transition-all hover:bg-primary-hover enabled:hover:-translate-y-0.5 enabled:hover:shadow-xl disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0'
  const eyebrow = 'text-sm font-semibold uppercase tracking-[0.25em] text-primary'
  const heading = 'font-display uppercase leading-[1.0] text-text'

  const slide = REEL[reelIndex]

  return (
    <main className="relative min-h-screen overflow-hidden bg-marketing-canvas">
      {/* Soft warm glow (Hook-style), centered behind the content. */}
      <div aria-hidden className="pointer-events-none fixed left-1/2 top-[42%] h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-[0.10] blur-[150px]" />
      <div aria-hidden className="pointer-events-none fixed left-1/2 top-[20%] h-[360px] w-[520px] -translate-x-1/2 rounded-full bg-signal opacity-[0.05] blur-[150px]" />

      {/* Preview-only badge (subtle; public /preview route; ADR-068). */}
      {preview && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center">
          <span className="rounded-full bg-black/5 px-3 py-1 text-[11px] font-medium text-subtle backdrop-blur-sm">
            Preview · nothing is saved
          </span>
        </div>
      )}

      {/* Preview end-state — submit can't redirect without auth, so show completion. */}
      {preview && previewDone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-7 text-center shadow-lg">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-bg text-2xl text-primary-strong">✓</div>
            <h2 className="mt-4 text-xl font-bold text-text">Welcome in, Founder.</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              In the real induction this writes your profile + intent and drops you into Circles.
              Here it just stops — nothing was saved.
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

      {/* Centered stage — content always vertically centered with a top/bottom buffer. */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-20">
        <div role="img" aria-label="Frequency" className="h-11 w-[210px] shrink-0 text-text" style={LOGO_MASK} />
        <span className="mt-2.5 text-[11px] font-bold uppercase tracking-[0.32em] text-subtle">Beta</span>

        <div className="mt-7 flex w-full max-w-sm items-center gap-1.5">
          {Array.from({ length: BEAT_COUNT }).map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i <= beat ? 'bg-primary' : 'bg-border-strong'}`} />
          ))}
        </div>

        <div key={beat} className="mt-10 w-full animate-[slideUp_0.5s_ease-out] text-center">
          {/* ── Beat 0: The Oath ── */}
          {beat === 0 && (
            <div className="mx-auto max-w-5xl">
              <p className={eyebrow}>{VERA.oath.eyebrow}</p>
              <h1 className={`mt-4 text-6xl sm:text-7xl ${heading}`}>{VERA.oath.heading}</h1>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">{VERA.oath.body}</p>

              {/* Three agreements in a row + the I'm in button, all in a line. */}
              <div className="mt-10 flex flex-col items-stretch justify-center gap-3 md:flex-row">
                {BETA_OATHS.map((o) => (
                  <label
                    key={o.id}
                    className={`flex flex-1 cursor-pointer items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${oaths[o.id] ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:border-primary/40'}`}
                  >
                    <input
                      type="checkbox"
                      checked={oaths[o.id]}
                      onChange={(e) => setOaths((prev) => ({ ...prev, [o.id]: e.target.checked }))}
                      className="h-5 w-5 shrink-0 accent-primary"
                    />
                    <span className={`text-sm font-medium ${oaths[o.id] ? 'text-text' : 'text-muted'}`}>{o.label}</span>
                  </label>
                ))}
                <button disabled={!allOathsChecked || accepting} onClick={passOath} className={`${btnPrimary} md:self-stretch`}>
                  {accepting ? 'One sec…' : VERA.oath.cta}
                  {!accepting && <ArrowRight />}
                </button>
              </div>
            </div>
          )}

          {/* ── Beat 1: Intro ── */}
          {beat === 1 && (
            <div className="mx-auto max-w-3xl">
              <p className={eyebrow}>{VERA.intro.eyebrow}</p>
              <h1 className={`mt-4 text-6xl sm:text-7xl ${heading}`}>{VERA.intro.heading}</h1>
              <p className="mx-auto mt-6 max-w-xl text-xl leading-relaxed text-muted">{VERA.intro.body}</p>
              <div className="mt-10 flex flex-col items-center gap-3">
                <button onClick={() => setBeat(2)} className={btnPrimary}>{VERA.intro.cta}<ArrowRight /></button>
                <button onClick={() => setBeat(0)} className={backLink}>Back</button>
              </div>
            </div>
          )}

          {/* ── Beat 2: The reel — horizontal: render beside the copy + action ── */}
          {beat === 2 && (
            <div className="mx-auto max-w-5xl">
              <p className={eyebrow}>{VERA.tour.eyebrow}</p>
              <h1 className={`mt-3 text-5xl sm:text-6xl ${heading}`}>{VERA.tour.heading}</h1>

              <div className="mt-9 flex flex-col items-center gap-10 md:flex-row md:justify-center md:gap-14">
                {/* Render stage */}
                <div className="relative h-[300px] w-[240px] shrink-0">
                  {REEL.map((s, i) => {
                    const active = i === reelIndex
                    return (
                      <div
                        key={i}
                        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-700 ${active ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                      >
                        {s.kind === 'render'
                          ? (() => {
                              const C = RENDERS[s.render]
                              return <div className="w-full"><C animate={active} /></div>
                            })()
                          : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={s.src} alt={s.title} className="h-full w-full rounded-3xl object-cover shadow-2xl ring-1 ring-border" />
                          )}
                      </div>
                    )
                  })}
                </div>

                {/* Copy + dots + action */}
                <div className="max-w-sm text-center md:text-left">
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

                  <div className="mt-7 flex flex-col items-center gap-3 md:flex-row md:items-center">
                    <button onClick={() => setBeat(3)} className={btnPrimary}>{VERA.tour.cta}<ArrowRight /></button>
                    <button onClick={() => setBeat(1)} className={backLink}>Back</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Beat 3: Identity ── */}
          {beat === 3 && (
            <div className="mx-auto max-w-xl">
              <h1 className={`text-5xl sm:text-6xl ${heading}`}>{VERA.identity.heading}</h1>
              <p className="mx-auto mt-4 max-w-lg text-lg text-muted">{VERA.identity.body}</p>

              <div className="mt-8 flex flex-col items-center gap-5">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="group relative">
                  {renderAvatar()}
                  <span className="mt-2 block text-xs font-semibold text-primary group-hover:underline">
                    {avatarPreview ? 'Change photo' : 'Add a photo'}
                  </span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                {uploadError && <p className="text-xs text-danger">{uploadError}</p>}

                <div className="w-full max-w-md space-y-3">
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
                    className={`${inputCls} text-center text-xl`}
                  />
                  <div className="relative">
                    <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-lg text-subtle">@</span>
                    <input
                      type="text"
                      value={handle}
                      onChange={(e) => {
                        setHandleTouched(true)
                        setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                      }}
                      placeholder="handle"
                      className={`${inputCls} px-10 text-center`}
                    />
                    <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm leading-none">
                      {handleStatus === 'checking' && <span className="animate-pulse text-subtle">•••</span>}
                      {handleStatus === 'available' && <span className="text-success">✓</span>}
                      {handleStatus === 'taken' && <span className="text-danger">✗</span>}
                    </span>
                  </div>
                  {handleStatus === 'taken' && <p className="text-xs text-danger">That handle is already taken.</p>}
                </div>
              </div>

              <div className="mt-9 flex flex-col items-center gap-3">
                <button disabled={!identityValid || uploading} onClick={advanceFromIdentity} className={btnPrimary}>
                  {uploading ? 'Uploading…' : 'Continue'}{!uploading && <ArrowRight />}
                </button>
                <button onClick={() => setBeat(2)} className={backLink}>Back</button>
              </div>
            </div>
          )}

          {/* ── Beat 4: Place + intent ── */}
          {beat === 4 && (
            <div className="mx-auto max-w-xl">
              <h1 className={`text-5xl sm:text-6xl ${heading}`}>{VERA.place.heading}</h1>
              <p className="mx-auto mt-4 max-w-lg text-lg text-muted">{VERA.place.body}</p>

              <div className="mx-auto mt-8 w-full max-w-md space-y-4">
                {/* Active region typeahead */}
                <div className="relative">
                  <input
                    type="text"
                    value={regionQuery}
                    onChange={(e) => {
                      setRegionQuery(e.target.value)
                      setRegionId('')
                      setRegionOpen(true)
                    }}
                    onFocus={() => setRegionOpen(true)}
                    onBlur={() => setTimeout(() => setRegionOpen(false), 150)}
                    placeholder="Start typing your city or region…"
                    className={inputCls}
                    autoComplete="off"
                  />
                  {regionId && (
                    <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-success">✓</span>
                  )}
                  {regionOpen && regionMatches.length > 0 && (
                    <ul className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-2xl border border-border bg-surface text-left shadow-lg">
                      {regionMatches.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            onMouseDown={() => {
                              setRegionId(r.id)
                              setRegionQuery(r.name)
                              setRegionOpen(false)
                            }}
                            className="block w-full px-5 py-3 text-left text-base text-text transition-colors hover:bg-primary-bg"
                          >
                            {r.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {regions.length === 0 && (
                    <p className="mt-2 text-sm text-subtle">No regions yet — we&rsquo;ll sort you later.</p>
                  )}
                </div>

                <div className="text-left">
                  <p className="mb-2 text-center text-base font-medium text-text">{VERA.place.intentLabel}</p>
                  <textarea
                    value={intent}
                    onChange={(e) => setIntent(e.target.value.slice(0, 500))}
                    placeholder={VERA.place.intentPlaceholder}
                    rows={3}
                    className={`${inputCls} resize-none`}
                  />
                </div>

                <select value={heardAbout} onChange={(e) => setHeardAbout(e.target.value)} className={inputCls}>
                  <option value="">How did you hear about us?</option>
                  {HEARD_ABOUT.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div className="mt-9 flex flex-col items-center gap-3">
                <button onClick={() => setBeat(5)} className={btnPrimary}>Continue<ArrowRight /></button>
                <button onClick={() => setBeat(3)} className={backLink}>Back</button>
              </div>
            </div>
          )}

          {/* ── Beat 5: Enter ── */}
          {beat === 5 && (
            <div className="mx-auto max-w-xl">
              <p className={eyebrow}>{VERA.enter.eyebrow}</p>
              <h1 className={`mt-4 text-5xl sm:text-6xl ${heading}`}>{VERA.enter.heading}</h1>
              <p className="mx-auto mt-4 max-w-lg text-lg leading-relaxed text-muted">{VERA.enter.body}</p>

              <div className="mx-auto mt-8 flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
                {renderAvatar()}
                <div>
                  <p className="text-lg font-semibold text-text">{displayName || 'You'}</p>
                  <p className="text-sm text-muted">@{handle}</p>
                </div>
                {regionId && <p className="text-xs text-subtle">{regions.find((r) => r.id === regionId)?.name}</p>}
                {intent.trim() && <p className="mt-1 max-w-[18rem] text-sm italic text-muted">“{intent.trim()}”</p>}
              </div>

              {submitError && <p className="mt-4 text-sm text-danger">{submitError}</p>}

              <div className="mt-9 flex flex-col items-center gap-3">
                <button onClick={submit} disabled={submitting} className={btnPrimary}>
                  {submitting ? 'Stepping in…' : VERA.enter.cta}{!submitting && <ArrowRight />}
                </button>
                <button onClick={() => setBeat(4)} className={backLink}>Back</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
