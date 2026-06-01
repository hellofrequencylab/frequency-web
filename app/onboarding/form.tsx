'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { completeOnboarding } from './actions'
import { getInitials } from '@/lib/utils'

type Region = { id: string; name: string }
type HandleStatus = 'idle' | 'checking' | 'available' | 'taken'

type Props = {
  userId: string
  userEmail: string
  initialHandle: string
  regions: Region[]
}

function suggestHandle(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 30)
}

const HANDLE_RE = /^[a-z0-9_]+$/

export default function OnboardingForm({ userId, userEmail, initialHandle, regions }: Props) {
  const [step, setStep] = useState(1)

  // Step 1
  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [handleTouched, setHandleTouched] = useState(false)
  const [check, setCheck] = useState<{ handle: string; result: 'available' | 'taken' | 'idle' } | null>(null)

  // Step 2
  const [bio, setBio] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // Step 3
  const [regionId, setRegionId] = useState('')

  // Step 4
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Debounced handle uniqueness check. State is only ever set from the async
  // callback (keyed to the handle it checked), so the live status below can be
  // derived during render rather than set synchronously inside the effect.
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

  // Live handle status, derived from format + the latest async check.
  const formatOk = handle.length >= 3 && HANDLE_RE.test(handle)
  const handleStatus: HandleStatus = !formatOk
    ? 'idle'
    : handle === initialHandle
    ? 'available'
    : check && check.handle === handle
    ? check.result
    : 'checking'

  // ── Helpers ──────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setUploadError('')
    setAvatarUrl('') // reset any previously uploaded URL
  }

  async function uploadAvatar(): Promise<string> {
    if (!avatarFile) return ''
    setUploading(true)
    setUploadError('')

    const supabase = createClient()
    const ext = avatarFile.name.split('.').pop() ?? 'jpg'
    const path = `${userId}/avatar.${ext}`

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, avatarFile, { upsert: true })

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

  function step1Valid(): boolean {
    return (
      displayName.trim().length > 0 &&
      handle.length >= 3 &&
      HANDLE_RE.test(handle) &&
      handleStatus === 'available'
    )
  }

  async function advanceFromStep2() {
    if (avatarFile && !avatarUrl) {
      await uploadAvatar()
    }
    setStep(3)
  }

  async function submit() {
    if (!regionId) return
    setSubmitting(true)
    setSubmitError('')

    let finalAvatarUrl = avatarUrl
    if (avatarFile && !avatarUrl) {
      finalAvatarUrl = await uploadAvatar()
    }

    try {
      await completeOnboarding({
        displayName: displayName.trim(),
        handle,
        bio,
        avatarUrl: finalAvatarUrl,
        regionId,
      })
      // completeOnboarding redirects to /feed on success; execution stops here.
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  // ── Shared sub-views ─────────────────────────────────────────────────────

  const STEP_LABELS = ['You', 'About you', 'Your region', 'Review']

  function renderAvatar(size: 'md' | 'lg' = 'md') {
    const dim = size === 'lg' ? 'w-20 h-20 text-2xl' : 'w-16 h-16 text-xl'
    if (avatarPreview) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarPreview}
          alt="Avatar preview"
          className={`${dim} rounded-full object-cover shrink-0 ring-2 ring-primary-bg`}
        />
      )
    }
    const initials = getInitials(displayName || userEmail)
    return (
      <div
        className={`${dim} rounded-full bg-primary-bg text-primary-strong font-semibold flex items-center justify-center shrink-0`}
      >
        {initials || '?'}
      </div>
    )
  }

  function renderProgress() {
    return (
      <div className="mb-9">
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4].map((s) => (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
                s <= step ? 'bg-primary' : 'bg-border-strong'
              }`}
            />
          ))}
        </div>
        <p className="mt-3 text-xs font-medium text-subtle">
          Step {step} of 4 · <span className="text-muted">{STEP_LABELS[step - 1]}</span>
        </p>
      </div>
    )
  }

  const btnPrimary =
    'inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-on-primary shadow-sm transition-all hover:bg-primary-hover hover:shadow-md enabled:hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0'
  const btnSecondary =
    'inline-flex items-center justify-center rounded-xl border border-border-strong bg-surface px-5 py-3 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated'
  const inputBase =
    'w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-subtle transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25'

  // ── Steps ─────────────────────────────────────────────────────────────────

  return (
    <main className="flex min-h-screen bg-marketing-canvas">
      {/* Brand rail — warm, image-led, with a live step tracker (desktop only). */}
      <aside className="relative hidden w-[44%] max-w-xl shrink-0 overflow-hidden lg:block">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url(/images/site/community-1.jpg)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/45 to-black/85" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary" />
            <span className="font-display text-xl uppercase tracking-tight">Frequency</span>
          </div>

          <div>
            <h2 className="font-display text-5xl uppercase leading-[0.95]">
              Welcome
              <br />
              home.
            </h2>
            <p className="mt-5 max-w-sm leading-relaxed text-white/75">
              You found the room. A few quick things and you&rsquo;re part of it &mdash; a real
              place to belong, with people near you.
            </p>
          </div>

          <ol className="space-y-2.5">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1
              const done = step > n
              const current = step === n
              return (
                <li
                  key={label}
                  className={`flex items-center gap-3 text-sm transition-colors ${
                    current ? 'text-white' : done ? 'text-white/80' : 'text-white/45'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      done
                        ? 'bg-primary text-on-primary'
                        : current
                        ? 'bg-white text-text'
                        : 'border border-white/30'
                    }`}
                  >
                    {done ? '✓' : n}
                  </span>
                  {label}
                </li>
              )
            })}
          </ol>
        </div>
      </aside>

      {/* Form column */}
      <section className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          {/* Compact brand mark for mobile (the rail is hidden there). */}
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="h-7 w-7 rounded-lg bg-primary" />
            <span className="font-display text-lg uppercase tracking-tight text-text">Frequency</span>
          </div>

          {renderProgress()}

          {/* Keyed by step so each one eases in. */}
          <div key={step} className="animate-[slideUp_0.35s_ease-out]">
            {/* ── Step 1: Name + Handle ── */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-text">Let&rsquo;s set you up</h1>
                  <p className="mt-1.5 text-sm text-muted">How should the community know you?</p>
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
                        // Auto-suggest the handle from the name until they edit it themselves.
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
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-subtle">
                        @
                      </span>
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
                    {handleStatus === 'taken' && (
                      <p className="mt-1.5 text-xs text-danger">That handle is already taken.</p>
                    )}
                    {handle && !HANDLE_RE.test(handle) && (
                      <p className="mt-1.5 text-xs text-danger">
                        Only lowercase letters, numbers, and underscores.
                      </p>
                    )}
                  </div>
                </div>

                <button disabled={!step1Valid()} onClick={() => setStep(2)} className={`${btnPrimary} w-full`}>
                  Continue
                </button>
              </div>
            )}

            {/* ── Step 2: Bio + Avatar ── */}
            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-text">Add a face and a few words</h1>
                  <p className="mt-1.5 text-sm text-muted">Optional, but it helps people connect.</p>
                </div>

                <div className="space-y-5">
                  <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4">
                    {renderAvatar()}
                    <div className="flex flex-col items-start gap-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-sm font-semibold text-primary-strong hover:underline"
                      >
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
                      <p className="text-xs text-subtle">JPG, PNG, or GIF up to 5 MB</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                  {uploadError && <p className="text-xs text-danger">{uploadError}</p>}

                  <div>
                    <label htmlFor="bio" className="mb-1.5 block text-sm font-medium text-text">
                      One line about you
                    </label>
                    <textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value.slice(0, 280))}
                      placeholder="What should people know?"
                      rows={4}
                      className={`${inputBase} resize-none`}
                    />
                    <p className={`mt-1.5 text-right text-xs tabular-nums ${bio.length >= 260 ? 'text-primary' : 'text-subtle'}`}>
                      {bio.length} / 280
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(1)} className={`${btnSecondary} flex-1`}>
                    Back
                  </button>
                  <button onClick={advanceFromStep2} disabled={uploading} className={`${btnPrimary} flex-1`}>
                    {uploading ? 'Uploading…' : 'Continue'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: Region ── */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-text">Where are you?</h1>
                  <p className="mt-1.5 text-sm text-muted">
                    We&rsquo;ll connect you to the community nearest you.
                  </p>
                </div>

                <div>
                  <label htmlFor="region" className="mb-1.5 block text-sm font-medium text-text">
                    Region <span className="text-danger">*</span>
                  </label>
                  {regions.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border bg-surface/50 px-4 py-6 text-center text-sm text-subtle">
                      No regions available yet. Check back soon.
                    </p>
                  ) : (
                    <select
                      id="region"
                      value={regionId}
                      onChange={(e) => setRegionId(e.target.value)}
                      className={inputBase}
                    >
                      <option value="">Select a region…</option>
                      {regions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(2)} className={`${btnSecondary} flex-1`}>
                    Back
                  </button>
                  <button
                    disabled={!regionId && regions.length > 0}
                    onClick={() => setStep(4)}
                    className={`${btnPrimary} flex-1`}
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 4: Review ── */}
            {step === 4 && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-text">Ready to join?</h1>
                  <p className="mt-1.5 text-sm text-muted">A quick look before you step in.</p>
                </div>

                <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                  <div className="flex items-center gap-4 p-5">
                    {renderAvatar('lg')}
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-text">{displayName}</p>
                      <p className="text-sm text-muted">@{handle}</p>
                    </div>
                  </div>

                  {bio && (
                    <div className="px-5 py-4">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">Bio</p>
                      <p className="whitespace-pre-wrap text-sm text-text">{bio}</p>
                    </div>
                  )}

                  {regionId && (
                    <div className="px-5 py-4">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">Region</p>
                      <p className="text-sm text-text">{regions.find((r) => r.id === regionId)?.name}</p>
                    </div>
                  )}
                </div>

                {submitError && <p className="text-center text-sm text-danger">{submitError}</p>}

                <div className="flex gap-3">
                  <button onClick={() => setStep(3)} className={`${btnSecondary} flex-1`}>
                    Back
                  </button>
                  <button onClick={submit} disabled={submitting} className={`${btnPrimary} flex-1`}>
                    {submitting ? 'Joining…' : 'Join Frequency'}
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
