'use client'

// Beta induction — the founding-cohort flow (ADR-068, docs/BETA-INDUCTION.md).
// TEMPORARY: deleted at launch. A centered, cinematic intro sequence (not a
// form): a soft-glow dark stage that crossfades a reel of feature renders +
// site imagery, with the oath gate and lightweight capture woven through it.
// Scripted Vera (hot register). Handle-check + avatar-upload mirror the legacy
// form. The `preview` prop mocks the auth-dependent calls for the public demo.

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import { BETA_OATHS, VERA, REEL, type OathId } from '@/lib/onboarding/beta-script'
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

  // ── Shared styles (dark, cinematic — pills not boxes) ────────────────────────
  const btnPrimary =
    'inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-8 py-3 text-sm font-semibold text-on-primary shadow-sm transition-all hover:bg-primary-hover hover:shadow-md enabled:hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0'
  const btnGhost =
    'inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-on-ink-muted transition-colors hover:text-on-ink'
  const inputBase =
    'w-full rounded-xl border border-ink-border bg-ink-elevated px-4 py-3 text-center text-base text-on-ink placeholder:text-on-ink-subtle transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
  const eyebrow = 'text-xs font-semibold uppercase tracking-[0.22em] text-primary'
  const heading = 'font-display uppercase leading-[1.03] text-on-ink'

  const slide = REEL[reelIndex]

  return (
    <main className="relative min-h-screen overflow-hidden bg-ink text-on-ink">
      {/* Soft glow */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/3 h-[660px] w-[660px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-[0.16] blur-[150px]" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/4 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal opacity-[0.10] blur-[130px]" />

      {/* Preview-only banner (public /preview route; ADR-068, torn down at launch). */}
      {preview && (
        <div className="fixed inset-x-0 top-0 z-50 bg-signal px-4 py-1.5 text-center text-xs font-semibold text-on-signal">
          Preview · nothing is saved — this is the beta induction with sample data
        </div>
      )}

      {/* Preview end-state — submit can't redirect without auth, so show completion. */}
      {preview && previewDone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-sm rounded-2xl border border-ink-border bg-ink-elevated p-7 text-center shadow-lg">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-bg text-2xl text-primary-strong">✓</div>
            <h2 className="mt-4 text-xl font-bold text-on-ink">That&rsquo;s the whole sequence.</h2>
            <p className="mt-2 text-sm leading-relaxed text-on-ink-muted">
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
              className={`${btnGhost} mt-5 w-full border border-ink-border`}
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
            <span className="font-display text-lg uppercase tracking-tight text-on-ink">Frequency</span>
          </div>
          <span className="rounded-full border border-ink-border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-on-ink-subtle">Beta</span>
        </header>
        <div className="mt-6 flex items-center gap-1.5">
          {Array.from({ length: BEAT_COUNT }).map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i <= beat ? 'bg-primary' : 'bg-on-ink/15'}`} />
          ))}
        </div>

        {/* Centered stage */}
        <div className="flex flex-1 items-center justify-center py-10">
          <div key={beat} className="w-full animate-[slideUp_0.45s_ease-out] text-center">
            {/* ── Beat 0: The Oath ── */}
            {beat === 0 && (
              <div>
                <p className={eyebrow}>{VERA.oath.eyebrow}</p>
                <h1 className={`mt-3 text-3xl sm:text-4xl ${heading}`}>{VERA.oath.heading}</h1>
                <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-on-ink-muted">{VERA.oath.body}</p>

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

                <button disabled={!allOathsChecked || accepting} onClick={passOath} className={`${btnPrimary} mt-8`}>
                  {accepting ? 'One sec…' : VERA.oath.cta}
                </button>
              </div>
            )}

            {/* ── Beat 1: Intro ── */}
            {beat === 1 && (
              <div>
                <p className={eyebrow}>{VERA.intro.eyebrow}</p>
                <h1 className={`mt-3 text-4xl sm:text-5xl ${heading}`}>{VERA.intro.heading}</h1>
                <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-on-ink-muted">{VERA.intro.body}</p>
                <button onClick={() => setBeat(2)} className={`${btnPrimary} mt-8`}>{VERA.intro.cta}</button>
              </div>
            )}

            {/* ── Beat 2: The reel ── */}
            {beat === 2 && (
              <div>
                <p className={eyebrow}>{VERA.tour.eyebrow}</p>
                <h1 className={`mt-3 text-2xl sm:text-3xl ${heading}`}>{VERA.tour.heading}</h1>

                {/* Crossfading stage */}
                <div className="relative mx-auto mt-7 h-[420px] w-full max-w-[300px]">
                  {REEL.map((s, i) => {
                    const active = i === reelIndex
                    return (
                      <div
                        key={i}
                        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-700 ${active ? 'opacity-100' : 'opacity-0'} ${active ? '' : 'pointer-events-none'}`}
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

                {/* Caption */}
                <div className="mx-auto mt-5 min-h-[66px] max-w-sm">
                  <p className="text-base font-semibold text-on-ink">{slide.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-on-ink-muted">{slide.line}</p>
                </div>

                {/* Dots */}
                <div className="flex items-center justify-center gap-2">
                  {REEL.map((s, i) => (
                    <button
                      key={i}
                      aria-label={`Show ${s.title}`}
                      onClick={() => setReelIndex(i)}
                      className={`h-2 rounded-full transition-all ${i === reelIndex ? 'w-6 bg-primary' : 'w-2 bg-on-ink/20 hover:bg-on-ink/40'}`}
                    />
                  ))}
                </div>

                <div className="mt-7 flex items-center justify-center gap-2">
                  <button onClick={() => setBeat(1)} className={btnGhost}>Back</button>
                  <button onClick={() => setBeat(3)} className={btnPrimary}>{VERA.tour.cta}</button>
                </div>
              </div>
            )}

            {/* ── Beat 3: Identity ── */}
            {beat === 3 && (
              <div>
                <h1 className={`text-3xl sm:text-4xl ${heading}`}>{VERA.identity.heading}</h1>
                <p className="mx-auto mt-3 max-w-md text-sm text-on-ink-muted">{VERA.identity.body}</p>

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
                      className={`${inputBase} text-lg`}
                    />
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-on-ink-subtle">@</span>
                      <input
                        type="text"
                        value={handle}
                        onChange={(e) => {
                          setHandleTouched(true)
                          setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                        }}
                        placeholder="handle"
                        className={`${inputBase} px-9`}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm leading-none">
                        {handleStatus === 'checking' && <span className="animate-pulse text-on-ink-subtle">•••</span>}
                        {handleStatus === 'available' && <span className="text-success">✓</span>}
                        {handleStatus === 'taken' && <span className="text-danger">✗</span>}
                      </span>
                    </div>
                    {handleStatus === 'taken' && <p className="text-xs text-danger">That handle is already taken.</p>}
                  </div>
                </div>

                <div className="mt-8 flex items-center justify-center gap-2">
                  <button onClick={() => setBeat(2)} className={btnGhost}>Back</button>
                  <button disabled={!identityValid || uploading} onClick={advanceFromIdentity} className={btnPrimary}>
                    {uploading ? 'Uploading…' : 'Continue'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Beat 4: Place + intent ── */}
            {beat === 4 && (
              <div>
                <h1 className={`text-3xl sm:text-4xl ${heading}`}>{VERA.place.heading}</h1>
                <p className="mx-auto mt-3 max-w-md text-sm text-on-ink-muted">{VERA.place.body}</p>

                <div className="mx-auto mt-7 w-full max-w-xs space-y-4">
                  {regions.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-ink-border px-4 py-5 text-sm text-on-ink-subtle">No regions yet — we&rsquo;ll sort you later.</p>
                  ) : (
                    <select value={regionId} onChange={(e) => setRegionId(e.target.value)} className={inputBase}>
                      <option value="">Where are you?</option>
                      {regions.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  )}

                  <div className="text-left">
                    <p className="mb-2 text-center text-sm font-medium text-on-ink">{VERA.place.intentLabel}</p>
                    <textarea
                      value={intent}
                      onChange={(e) => setIntent(e.target.value.slice(0, 500))}
                      placeholder={VERA.place.intentPlaceholder}
                      rows={4}
                      className={`${inputBase} resize-none text-left`}
                    />
                  </div>
                </div>

                <div className="mt-8 flex items-center justify-center gap-2">
                  <button onClick={() => setBeat(3)} className={btnGhost}>Back</button>
                  <button onClick={() => setBeat(5)} className={btnPrimary}>Continue</button>
                </div>
              </div>
            )}

            {/* ── Beat 5: Enter ── */}
            {beat === 5 && (
              <div>
                <p className={eyebrow}>{VERA.enter.eyebrow}</p>
                <h1 className={`mt-3 text-3xl sm:text-4xl ${heading}`}>{VERA.enter.heading}</h1>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-on-ink-muted">{VERA.enter.body}</p>

                <div className="mx-auto mt-7 flex max-w-xs flex-col items-center gap-3 rounded-2xl border border-ink-border bg-ink-elevated p-6">
                  {renderAvatar('lg')}
                  <div>
                    <p className="text-lg font-semibold text-on-ink">{displayName || 'You'}</p>
                    <p className="text-sm text-on-ink-muted">@{handle}</p>
                  </div>
                  {regionId && <p className="text-xs text-on-ink-subtle">{regions.find((r) => r.id === regionId)?.name}</p>}
                  {intent.trim() && <p className="mt-1 max-w-[16rem] text-sm italic text-on-ink-muted">“{intent.trim()}”</p>}
                </div>

                {submitError && <p className="mt-4 text-sm text-danger">{submitError}</p>}

                <div className="mt-8 flex items-center justify-center gap-2">
                  <button onClick={() => setBeat(4)} className={btnGhost}>Back</button>
                  <button onClick={submit} disabled={submitting} className={btnPrimary}>
                    {submitting ? 'Stepping in…' : VERA.enter.cta}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
