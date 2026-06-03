'use client'

// Beta induction — the founding-cohort flow (ADR-068, docs/BETA-INDUCTION.md).
// TEMPORARY: deleted at launch. Scripted Vera (hot register), one gate (the Oath),
// six beats, the core-triad tour. Handle-check + avatar-upload mirror the legacy
// onboarding form so behavior is identical.

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import {
  BETA_OATHS,
  VERA,
  TOUR,
  type OathId,
} from '@/lib/onboarding/beta-script'
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
}

const HANDLE_RE = /^[a-z0-9_]+$/
const RENDERS = { feed: FeedRender, circles: CirclesRender, events: EventsRender }
const BEAT_LABELS = ['The oath', 'Welcome', 'You', 'Your place', 'The tour', 'Step in']

function suggestHandle(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 30)
}

export default function BetaInduction({ userId, userEmail, initialHandle, regions }: Props) {
  // 0 oath · 1 intro · 2 identity · 3 place · 4 tour · 5 enter
  const [beat, setBeat] = useState(0)

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
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Place
  const [regionId, setRegionId] = useState('')
  const [intent, setIntent] = useState('')

  // Tour
  const [tourIndex, setTourIndex] = useState(0)

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Debounced handle uniqueness check (identical to the legacy form).
  useEffect(() => {
    const valid = handle.length >= 3 && HANDLE_RE.test(handle)
    if (!valid || handle === initialHandle) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/check-handle?handle=${encodeURIComponent(handle)}&userId=${encodeURIComponent(userId)}`
        )
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
  }, [handle, initialHandle, userId])

  const formatOk = handle.length >= 3 && HANDLE_RE.test(handle)
  const handleStatus: HandleStatus = !formatOk
    ? 'idle'
    : handle === initialHandle
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
    try {
      await acceptBetaOath(accepted)
    } catch {
      // Non-fatal: completion re-affirms the oath. Don't block the founder.
    }
    setAccepting(false)
    setBeat(1)
  }

  async function advanceFromIdentity() {
    if (avatarFile && !avatarUrl) await uploadAvatar()
    setBeat(3)
  }

  async function submit() {
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
    const dim = size === 'lg' ? 'w-20 h-20 text-2xl' : 'w-16 h-16 text-xl'
    if (avatarPreview) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={avatarPreview} alt="Avatar preview" className={`${dim} rounded-full object-cover shrink-0 ring-2 ring-primary-bg`} />
    }
    const initials = getInitials(displayName || userEmail)
    return (
      <div className={`${dim} rounded-full bg-primary-bg text-primary-strong font-semibold flex items-center justify-center shrink-0`}>
        {initials || '?'}
      </div>
    )
  }

  // ── Shared styles (match the legacy form) ────────────────────────────────────
  const btnPrimary =
    'inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-on-primary shadow-sm transition-all hover:bg-primary-hover hover:shadow-md enabled:hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0'
  const btnSecondary =
    'inline-flex items-center justify-center rounded-xl border border-border-strong bg-surface px-5 py-3 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated'
  const inputBase =
    'w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-subtle transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25'
  const eyebrow = 'text-xs font-semibold uppercase tracking-[0.18em] text-primary-strong'

  const tourBeat = TOUR[tourIndex]
  const RenderComp = RENDERS[tourBeat.key]

  return (
    <main className="flex min-h-screen bg-marketing-canvas">
      {/* Brand rail — beta framing + beat tracker (desktop only). */}
      <aside className="relative hidden w-[44%] max-w-xl shrink-0 overflow-hidden lg:block">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: 'url(/images/site/community-1.jpg)' }} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/85" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary" />
            <span className="font-display text-xl uppercase tracking-tight">Frequency</span>
            <span className="ml-1 rounded-full border border-white/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/80">Beta</span>
          </div>

          <div>
            <h2 className="font-display text-5xl uppercase leading-[0.95]">
              You&rsquo;re
              <br />
              early.
            </h2>
            <p className="mt-5 max-w-sm leading-relaxed text-white/75">
              Not a customer. A founder. The next two minutes set you up &mdash; then you&rsquo;re
              building this with us.
            </p>
          </div>

          <ol className="space-y-2.5">
            {BEAT_LABELS.map((label, i) => {
              const done = beat > i
              const current = beat === i
              return (
                <li key={label} className={`flex items-center gap-3 text-sm transition-colors ${current ? 'text-white' : done ? 'text-white/80' : 'text-white/45'}`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-primary text-on-primary' : current ? 'bg-white text-text' : 'border border-white/30'}`}>
                    {done ? '✓' : i + 1}
                  </span>
                  {label}
                </li>
              )
            })}
          </ol>
        </div>
      </aside>

      {/* Content column */}
      <section className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="h-7 w-7 rounded-lg bg-primary" />
            <span className="font-display text-lg uppercase tracking-tight text-text">Frequency</span>
            <span className="rounded-full border border-border-strong px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-subtle">Beta</span>
          </div>

          {/* Progress */}
          <div className="mb-9">
            <div className="flex items-center gap-1.5">
              {BEAT_LABELS.map((label, i) => (
                <span key={label} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i <= beat ? 'bg-primary' : 'bg-border-strong'}`} />
              ))}
            </div>
            <p className="mt-3 text-xs font-medium text-subtle">
              Step {beat + 1} of {BEAT_LABELS.length} · <span className="text-muted">{BEAT_LABELS[beat]}</span>
            </p>
          </div>

          {/* Keyed by beat so each eases in. */}
          <div key={beat} className="animate-[slideUp_0.35s_ease-out]">
            {/* ── Beat 0: The Oath ── */}
            {beat === 0 && (
              <div className="space-y-6">
                <div>
                  <p className={eyebrow}>{VERA.oath.eyebrow}</p>
                  <h1 className="mt-2 text-2xl font-bold text-text">{VERA.oath.heading}</h1>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{VERA.oath.body}</p>
                </div>

                <div className="space-y-3">
                  {BETA_OATHS.map((o) => (
                    <label
                      key={o.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${oaths[o.id] ? 'border-primary bg-primary-bg' : 'border-border bg-surface hover:bg-surface-elevated'}`}
                    >
                      <input
                        type="checkbox"
                        checked={oaths[o.id]}
                        onChange={(e) => setOaths((prev) => ({ ...prev, [o.id]: e.target.checked }))}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                      />
                      <span className={`text-sm font-medium ${oaths[o.id] ? 'text-primary-strong' : 'text-text'}`}>{o.label}</span>
                    </label>
                  ))}
                </div>

                <button disabled={!allOathsChecked || accepting} onClick={passOath} className={`${btnPrimary} w-full`}>
                  {accepting ? 'One sec…' : VERA.oath.cta}
                </button>
              </div>
            )}

            {/* ── Beat 1: Intro ── */}
            {beat === 1 && (
              <div className="space-y-6">
                <div>
                  <p className={eyebrow}>{VERA.intro.eyebrow}</p>
                  <h1 className="mt-2 text-3xl font-bold leading-tight text-text">{VERA.intro.heading}</h1>
                  <p className="mt-3 text-base leading-relaxed text-muted">{VERA.intro.body}</p>
                </div>
                <button onClick={() => setBeat(2)} className={`${btnPrimary} w-full`}>{VERA.intro.cta}</button>
              </div>
            )}

            {/* ── Beat 2: Identity ── */}
            {beat === 2 && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-text">{VERA.identity.heading}</h1>
                  <p className="mt-1.5 text-sm text-muted">{VERA.identity.body}</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="displayName" className="mb-1.5 block text-sm font-medium text-text">
                      Display name <span className="text-danger">*</span>
                    </label>
                    <input
                      id="displayName"
                      type="text"
                      value={displayName}
                      onChange={(e) => {
                        const v = e.target.value
                        setDisplayName(v)
                        if (!handleTouched) setHandle(suggestHandle(v))
                      }}
                      placeholder="Jane Smith"
                      autoFocus
                      className={inputBase}
                    />
                  </div>

                  <div>
                    <label htmlFor="handle" className="mb-1.5 block text-sm font-medium text-text">
                      Handle <span className="text-danger">*</span>
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-subtle">@</span>
                      <input
                        id="handle"
                        type="text"
                        value={handle}
                        onChange={(e) => {
                          setHandleTouched(true)
                          setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                        }}
                        placeholder="jane_smith"
                        className={`${inputBase} pl-8 pr-9`}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm leading-none">
                        {handleStatus === 'checking' && <span className="animate-pulse text-subtle">•••</span>}
                        {handleStatus === 'available' && <span className="text-success">✓</span>}
                        {handleStatus === 'taken' && <span className="text-danger">✗</span>}
                      </span>
                    </div>
                    {handleStatus === 'taken' && <p className="mt-1.5 text-xs text-danger">That handle is already taken.</p>}
                    {handle && !HANDLE_RE.test(handle) && <p className="mt-1.5 text-xs text-danger">Only lowercase letters, numbers, and underscores.</p>}
                  </div>

                  <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4">
                    {renderAvatar()}
                    <div className="flex flex-col items-start gap-1">
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="text-sm font-semibold text-primary-strong hover:underline">
                        {avatarPreview ? 'Change photo' : 'Upload a photo'}
                      </button>
                      {avatarPreview && (
                        <button
                          type="button"
                          onClick={() => {
                            setAvatarFile(null)
                            setAvatarPreview(null)
                            setAvatarUrl('')
                            if (fileInputRef.current) fileInputRef.current.value = ''
                          }}
                          className="text-sm text-subtle hover:text-muted"
                        >
                          Remove
                        </button>
                      )}
                      <p className="text-xs text-subtle">Optional · JPG, PNG, or GIF up to 5 MB</p>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  </div>
                  {uploadError && <p className="text-xs text-danger">{uploadError}</p>}

                  <div>
                    <label htmlFor="bio" className="mb-1.5 block text-sm font-medium text-text">One line about you</label>
                    <textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value.slice(0, 280))}
                      placeholder="What should people know?"
                      rows={3}
                      className={`${inputBase} resize-none`}
                    />
                    <p className={`mt-1.5 text-right text-xs tabular-nums ${bio.length >= 260 ? 'text-primary' : 'text-subtle'}`}>{bio.length} / 280</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setBeat(1)} className={`${btnSecondary} flex-1`}>Back</button>
                  <button disabled={!identityValid || uploading} onClick={advanceFromIdentity} className={`${btnPrimary} flex-1`}>
                    {uploading ? 'Uploading…' : 'Continue'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Beat 3: Place + intent ── */}
            {beat === 3 && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-text">{VERA.place.heading}</h1>
                  <p className="mt-1.5 text-sm text-muted">{VERA.place.body}</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="region" className="mb-1.5 block text-sm font-medium text-text">Region</label>
                    {regions.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-border bg-surface/50 px-4 py-6 text-center text-sm text-subtle">No regions available yet — we&rsquo;ll sort you later.</p>
                    ) : (
                      <select id="region" value={regionId} onChange={(e) => setRegionId(e.target.value)} className={inputBase}>
                        <option value="">Select a region…</option>
                        {regions.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label htmlFor="intent" className="mb-1.5 block text-sm font-medium text-text">{VERA.place.intentLabel}</label>
                    <textarea
                      id="intent"
                      value={intent}
                      onChange={(e) => setIntent(e.target.value.slice(0, 500))}
                      placeholder={VERA.place.intentPlaceholder}
                      rows={4}
                      className={`${inputBase} resize-none`}
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setBeat(2)} className={`${btnSecondary} flex-1`}>Back</button>
                  <button onClick={() => setBeat(4)} className={`${btnPrimary} flex-1`}>Continue</button>
                </div>
              </div>
            )}

            {/* ── Beat 4: The tour ── */}
            {beat === 4 && (
              <div className="space-y-6">
                <div>
                  <p className={eyebrow}>{VERA.tour.eyebrow}</p>
                  <h1 className="mt-2 text-2xl font-bold text-text">{VERA.tour.heading}</h1>
                </div>

                {/* Render — re-mounts per section so it eases in. */}
                <div key={tourBeat.key} className="flex justify-center">
                  <RenderComp />
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5">
                  <p className="text-sm font-semibold text-primary-strong">{tourBeat.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{tourBeat.line}</p>
                </div>

                {/* Section dots */}
                <div className="flex items-center justify-center gap-2">
                  {TOUR.map((t, i) => (
                    <span key={t.key} className={`h-2 rounded-full transition-all ${i === tourIndex ? 'w-6 bg-primary' : 'w-2 bg-border-strong'}`} />
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => (tourIndex === 0 ? setBeat(3) : setTourIndex((i) => i - 1))}
                    className={`${btnSecondary} flex-1`}
                  >
                    Back
                  </button>
                  <button
                    onClick={() => (tourIndex < TOUR.length - 1 ? setTourIndex((i) => i + 1) : setBeat(5))}
                    className={`${btnPrimary} flex-1`}
                  >
                    {tourIndex < TOUR.length - 1 ? 'Next' : VERA.tour.cta}
                  </button>
                </div>
              </div>
            )}

            {/* ── Beat 5: Enter ── */}
            {beat === 5 && (
              <div className="space-y-6">
                <div>
                  <p className={eyebrow}>{VERA.enter.eyebrow}</p>
                  <h1 className="mt-2 text-2xl font-bold text-text">{VERA.enter.heading}</h1>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{VERA.enter.body}</p>
                </div>

                <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                  <div className="flex items-center gap-4 p-5">
                    {renderAvatar('lg')}
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-text">{displayName}</p>
                      <p className="text-sm text-muted">@{handle}</p>
                    </div>
                  </div>
                  {regionId && (
                    <div className="px-5 py-4">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">Region</p>
                      <p className="text-sm text-text">{regions.find((r) => r.id === regionId)?.name}</p>
                    </div>
                  )}
                  {intent.trim() && (
                    <div className="px-5 py-4">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">Hoping for</p>
                      <p className="whitespace-pre-wrap text-sm text-text">{intent.trim()}</p>
                    </div>
                  )}
                </div>

                {submitError && <p className="text-center text-sm text-danger">{submitError}</p>}

                <div className="flex gap-3">
                  <button onClick={() => setBeat(4)} className={`${btnSecondary} flex-1`}>Back</button>
                  <button onClick={submit} disabled={submitting} className={`${btnPrimary} flex-1`}>
                    {submitting ? 'Stepping in…' : VERA.enter.cta}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
