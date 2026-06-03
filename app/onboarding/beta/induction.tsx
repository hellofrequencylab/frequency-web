'use client'

// Beta induction — the founding-cohort flow (ADR-068, docs/BETA-INDUCTION.md).
// TEMPORARY: deleted at launch. A centered, cinematic sequence that starts in a
// dark stage and *lightens beat by beat* until it lands on the feed's light
// theme — a vector reel slides through the core rooms, the oath gates it, and
// lightweight capture is woven in. Scripted Vera (hot register). Handle-check +
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

// Per-beat scene: the dark scrim lifts each step until the feed's light theme
// shows through, and the text flips from light-on-dark to dark-on-light.
const SCENES = [
  { scrim: 1.0, light: false }, // 0 oath  — darkest
  { scrim: 0.8, light: false }, // 1 intro
  { scrim: 0.55, light: false }, // 2 reel
  { scrim: 0.3, light: true }, // 3 identity
  { scrim: 0.12, light: true }, // 4 place
  { scrim: 0.0, light: true }, // 5 enter — feed theme (light)
] as const

function suggestHandle(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 30)
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

  // Auto-advance the reel (paused under prefers-reduced-motion). Restarts on
  // manual navigation so a slide you jumped to gets a full dwell.
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

  function renderAvatar(size: 'md' | 'lg' = 'md') {
    const dim = size === 'lg' ? 'w-24 h-24 text-3xl' : 'w-16 h-16 text-xl'
    if (avatarPreview) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={avatarPreview} alt="Avatar preview" className={`${dim} rounded-full object-cover shrink-0 ring-2 ring-primary`} />
    }
    const initials = getInitials(displayName || userEmail)
    return (
      <div className={`${dim} rounded-full bg-primary-bg text-primary-strong font-semibold flex items-center justify-center shrink-0`}>
        {initials || '?'}
      </div>
    )
  }

  // ── Scene-aware tokens ───────────────────────────────────────────────────────
  const scene = SCENES[beat]
  const tText = scene.light ? 'text-text' : 'text-on-ink'
  const tMuted = scene.light ? 'text-muted' : 'text-on-ink-muted'
  const inputCls = scene.light
    ? 'w-full rounded-xl border border-border bg-surface px-4 py-3 text-center text-base text-text placeholder:text-subtle transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25'
    : 'w-full rounded-xl border border-ink-border bg-ink-elevated px-4 py-3 text-center text-base text-on-ink placeholder:text-on-ink-subtle transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
  const backLink = scene.light
    ? 'text-xs font-medium text-subtle underline-offset-4 transition-colors hover:text-muted hover:underline'
    : 'text-xs font-medium text-on-ink-subtle underline-offset-4 transition-colors hover:text-on-ink-muted hover:underline'

  const btnPrimary =
    'inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-9 py-3.5 text-sm font-semibold text-on-primary shadow-md shadow-primary/20 transition-all hover:bg-primary-hover enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0'
  const eyebrow = 'text-xs font-semibold uppercase tracking-[0.22em] text-primary'
  const headingBase = 'font-display uppercase leading-[1.03]'

  const slide = REEL[reelIndex]

  return (
    <main className="relative min-h-screen overflow-hidden bg-canvas">
      {/* Lightening scrim — lifts the dark stage toward the feed's light theme. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-ink transition-opacity duration-[1100ms] ease-out"
        style={{ opacity: scene.scrim }}
      />
      {/* Soft glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-1/2 top-1/3 h-[680px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary blur-[150px] transition-opacity duration-1000"
        style={{ opacity: scene.light ? 0.13 : 0.2 }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed left-1/2 top-1/4 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal blur-[130px] transition-opacity duration-1000"
        style={{ opacity: scene.light ? 0.06 : 0.1 }}
      />

      {/* Preview-only banner (public /preview route; ADR-068, torn down at launch). */}
      {preview && (
        <div className="fixed inset-x-0 top-0 z-50 bg-signal px-4 py-1.5 text-center text-xs font-semibold text-on-signal">
          Preview · nothing is saved — this is the beta induction with sample data
        </div>
      )}

      {/* Preview end-state — submit can't redirect without auth, so show completion. */}
      {preview && previewDone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
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

      <div className={`relative z-10 mx-auto flex min-h-screen max-w-lg flex-col px-6 ${preview ? 'pt-6' : ''}`}>
        {/* Header + progress */}
        <header className="flex items-center justify-between pt-8">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary" />
            <span className={`font-display text-lg uppercase tracking-tight transition-colors ${tText}`}>Frequency</span>
          </div>
          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${scene.light ? 'border-border-strong text-subtle' : 'border-ink-border text-on-ink-subtle'}`}>Beta</span>
        </header>
        <div className="mt-6 flex items-center gap-1.5">
          {Array.from({ length: BEAT_COUNT }).map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-700 ${i <= beat ? 'bg-primary' : scene.light ? 'bg-border-strong' : 'bg-on-ink/15'}`} />
          ))}
        </div>

        {/* Centered stage */}
        <div className="flex flex-1 items-center justify-center py-10">
          <div key={beat} className="w-full animate-[slideUp_0.5s_ease-out] text-center">
            {/* ── Beat 0: The Oath ── */}
            {beat === 0 && (
              <div>
                <p className={eyebrow}>{VERA.oath.eyebrow}</p>
                <h1 className={`mt-3 text-4xl sm:text-5xl ${headingBase} ${tText}`}>{VERA.oath.heading}</h1>
                <p className={`mx-auto mt-4 max-w-md text-sm leading-relaxed ${tMuted}`}>{VERA.oath.body}</p>

                <div className="mt-8 space-y-3 text-left">
                  {BETA_OATHS.map((o) => (
                    <label
                      key={o.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${oaths[o.id] ? 'border-primary bg-primary/10' : 'border-ink-border bg-ink-elevated hover:border-on-ink-subtle'}`}
                    >
                      <input
                        type="checkbox"
                        checked={oaths[o.id]}
                        onChange={(e) => setOaths((prev) => ({ ...prev, [o.id]: e.target.checked }))}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                      />
                      <span className={`text-sm font-medium ${oaths[o.id] ? 'text-on-ink' : 'text-on-ink-muted'}`}>{o.label}</span>
                    </label>
                  ))}
                </div>

                <div className="mt-9 flex flex-col items-center">
                  <button disabled={!allOathsChecked || accepting} onClick={passOath} className={btnPrimary}>
                    {accepting ? 'One sec…' : VERA.oath.cta}
                  </button>
                </div>
              </div>
            )}

            {/* ── Beat 1: Intro ── */}
            {beat === 1 && (
              <div>
                <p className={eyebrow}>{VERA.intro.eyebrow}</p>
                <h1 className={`mt-3 text-4xl sm:text-5xl ${headingBase} ${tText}`}>{VERA.intro.heading}</h1>
                <p className={`mx-auto mt-5 max-w-md text-base leading-relaxed ${tMuted}`}>{VERA.intro.body}</p>
                <div className="mt-9 flex flex-col items-center gap-3">
                  <button onClick={() => setBeat(2)} className={btnPrimary}>{VERA.intro.cta}</button>
                  <button onClick={() => setBeat(0)} className={backLink}>Back</button>
                </div>
              </div>
            )}

            {/* ── Beat 2: The reel ── */}
            {beat === 2 && (
              <div>
                <p className={eyebrow}>{VERA.tour.eyebrow}</p>
                <h1 className={`mt-3 text-3xl sm:text-4xl ${headingBase} ${tText}`}>{VERA.tour.heading}</h1>

                {/* Crossfading stage */}
                <div className="relative mx-auto mt-7 h-[400px] w-full max-w-[300px]">
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
                            <img src={s.src} alt={s.title} className="h-full w-full rounded-3xl object-cover shadow-2xl ring-1 ring-on-ink/10" />
                          )}
                      </div>
                    )
                  })}
                </div>

                {/* Caption — pronounced + warm */}
                <div className="mx-auto mt-6 min-h-[84px] max-w-sm">
                  <p className={`text-xl font-bold ${tText}`}>{slide.title}</p>
                  <p className={`mt-1.5 text-base leading-relaxed ${tMuted}`}>{slide.line}</p>
                </div>

                {/* Dots */}
                <div className="flex items-center justify-center gap-2">
                  {REEL.map((s, i) => (
                    <button
                      key={i}
                      aria-label={`Show ${s.title}`}
                      onClick={() => setReelIndex(i)}
                      className={`h-2 rounded-full transition-all ${i === reelIndex ? 'w-6 bg-primary' : `w-2 ${scene.light ? 'bg-border-strong' : 'bg-on-ink/20'} hover:bg-primary/60`}`}
                    />
                  ))}
                </div>

                <div className="mt-8 flex flex-col items-center gap-3">
                  <button onClick={() => setBeat(3)} className={btnPrimary}>{VERA.tour.cta}</button>
                  <button onClick={() => setBeat(1)} className={backLink}>Back</button>
                </div>
              </div>
            )}

            {/* ── Beat 3: Identity ── */}
            {beat === 3 && (
              <div>
                <h1 className={`text-3xl sm:text-4xl ${headingBase} ${tText}`}>{VERA.identity.heading}</h1>
                <p className={`mx-auto mt-3 max-w-md text-sm ${tMuted}`}>{VERA.identity.body}</p>

                <div className="mt-7 flex flex-col items-center gap-5">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="group relative">
                    {renderAvatar('lg')}
                    <span className="mt-2 block text-xs font-semibold text-primary group-hover:underline">
                      {avatarPreview ? 'Change photo' : 'Add a photo'}
                    </span>
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  {uploadError && <p className="text-xs text-danger">{uploadError}</p>}

                  <div className="w-full max-w-xs space-y-3">
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
                      className={`${inputCls} text-lg`}
                    />
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-subtle">@</span>
                      <input
                        type="text"
                        value={handle}
                        onChange={(e) => {
                          setHandleTouched(true)
                          setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                        }}
                        placeholder="handle"
                        className={`${inputCls} px-9`}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm leading-none">
                        {handleStatus === 'checking' && <span className="animate-pulse text-subtle">•••</span>}
                        {handleStatus === 'available' && <span className="text-success">✓</span>}
                        {handleStatus === 'taken' && <span className="text-danger">✗</span>}
                      </span>
                    </div>
                    {handleStatus === 'taken' && <p className="text-xs text-danger">That handle is already taken.</p>}
                  </div>
                </div>

                <div className="mt-8 flex flex-col items-center gap-3">
                  <button disabled={!identityValid || uploading} onClick={advanceFromIdentity} className={btnPrimary}>
                    {uploading ? 'Uploading…' : 'Continue'}
                  </button>
                  <button onClick={() => setBeat(2)} className={backLink}>Back</button>
                </div>
              </div>
            )}

            {/* ── Beat 4: Place + intent ── */}
            {beat === 4 && (
              <div>
                <h1 className={`text-3xl sm:text-4xl ${headingBase} ${tText}`}>{VERA.place.heading}</h1>
                <p className={`mx-auto mt-3 max-w-md text-sm ${tMuted}`}>{VERA.place.body}</p>

                <div className="mx-auto mt-7 w-full max-w-xs space-y-4">
                  {regions.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-subtle">No regions yet — we&rsquo;ll sort you later.</p>
                  ) : (
                    <select value={regionId} onChange={(e) => setRegionId(e.target.value)} className={inputCls}>
                      <option value="">Where are you?</option>
                      {regions.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  )}

                  <div className="text-left">
                    <p className={`mb-2 text-center text-sm font-medium ${tText}`}>{VERA.place.intentLabel}</p>
                    <textarea
                      value={intent}
                      onChange={(e) => setIntent(e.target.value.slice(0, 500))}
                      placeholder={VERA.place.intentPlaceholder}
                      rows={4}
                      className={`${inputCls} resize-none text-left`}
                    />
                  </div>

                  <select value={heardAbout} onChange={(e) => setHeardAbout(e.target.value)} className={inputCls}>
                    <option value="">How did you hear about us?</option>
                    {HEARD_ABOUT.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div className="mt-8 flex flex-col items-center gap-3">
                  <button onClick={() => setBeat(5)} className={btnPrimary}>Continue</button>
                  <button onClick={() => setBeat(3)} className={backLink}>Back</button>
                </div>
              </div>
            )}

            {/* ── Beat 5: Enter ── */}
            {beat === 5 && (
              <div>
                <p className={eyebrow}>{VERA.enter.eyebrow}</p>
                <h1 className={`mt-3 text-3xl sm:text-4xl ${headingBase} ${tText}`}>{VERA.enter.heading}</h1>
                <p className={`mx-auto mt-3 max-w-md text-sm leading-relaxed ${tMuted}`}>{VERA.enter.body}</p>

                <div className="mx-auto mt-7 flex max-w-xs flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
                  {renderAvatar('lg')}
                  <div>
                    <p className="text-lg font-semibold text-text">{displayName || 'You'}</p>
                    <p className="text-sm text-muted">@{handle}</p>
                  </div>
                  {regionId && <p className="text-xs text-subtle">{regions.find((r) => r.id === regionId)?.name}</p>}
                  {intent.trim() && <p className="mt-1 max-w-[16rem] text-sm italic text-muted">“{intent.trim()}”</p>}
                </div>

                {submitError && <p className="mt-4 text-sm text-danger">{submitError}</p>}

                <div className="mt-8 flex flex-col items-center gap-3">
                  <button onClick={submit} disabled={submitting} className={btnPrimary}>
                    {submitting ? 'Stepping in…' : VERA.enter.cta}
                  </button>
                  <button onClick={() => setBeat(4)} className={backLink}>Back</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
