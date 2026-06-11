'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { completeOnboarding } from './actions'
import { getInitials } from '@/lib/utils'
import { WizardShell } from '@/components/templates'

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

  const inputBase =
    'w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-subtle transition-colors focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong/25'

  // ── Steps ─────────────────────────────────────────────────────────────────

  // Per-step header + footer config — the shell renders the chrome, each step just
  // supplies its fields. (STEP_LABELS feeds the progress cue.)
  const stepConfig = {
    1: {
      title: 'Let’s set you up',
      description: 'How should the community know you?',
      onNext: () => setStep(2),
      nextDisabled: !step1Valid(),
    },
    2: {
      title: 'Add a face and a few words',
      description: 'Optional, but it helps people connect.',
      onBack: () => setStep(1),
      onNext: advanceFromStep2,
      nextDisabled: uploading,
      nextBusy: uploading,
      nextBusyLabel: 'Uploading…',
    },
    3: {
      title: 'Where are you?',
      description: 'We’ll connect you to the community nearest you.',
      onBack: () => setStep(2),
      onNext: () => setStep(4),
      nextDisabled: !regionId && regions.length > 0,
    },
    4: {
      title: 'Ready to join?',
      description: 'A quick look before you step in.',
      onBack: () => setStep(3),
      onNext: submit,
      nextLabel: 'Join Frequency',
      nextBusy: submitting,
      nextBusyLabel: 'Joining…',
      error: submitError || undefined,
    },
  }[step]!

  return (
    <WizardShell
      step={step}
      totalSteps={4}
      stepLabel={STEP_LABELS[step - 1]}
      eyebrow="Welcome home"
      title={stepConfig.title}
      description={stepConfig.description}
      onBack={'onBack' in stepConfig ? stepConfig.onBack : undefined}
      onNext={stepConfig.onNext}
      nextLabel={'nextLabel' in stepConfig ? stepConfig.nextLabel : 'Continue'}
      nextDisabled={stepConfig.nextDisabled}
      nextBusy={'nextBusy' in stepConfig ? stepConfig.nextBusy : false}
      nextBusyLabel={'nextBusyLabel' in stepConfig ? stepConfig.nextBusyLabel : undefined}
      error={'error' in stepConfig ? stepConfig.error : undefined}
      exit={[{ href: '/', label: 'Home' }, { href: '/sign-in', label: 'Log in to account' }]}
    >
      {/* ── Step 1: Name + Handle ── */}
      {step === 1 && (
        <div className="mt-2 space-y-4">
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
                        aria-invalid={handleStatus === 'taken' || (!!handle && !HANDLE_RE.test(handle))}
                        aria-describedby="handle-status"
                        className={`${inputBase} pl-8 pr-9`}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm leading-none" aria-hidden>
                        {handleStatus === 'checking' && <span className="animate-pulse text-subtle">•••</span>}
                        {handleStatus === 'available' && <span className="text-success">✓</span>}
                        {handleStatus === 'taken' && <span className="text-danger">✗</span>}
                      </span>
                    </div>
                    {/* Live status — announces availability + format errors as they resolve. */}
                    <p
                      id="handle-status"
                      role="status"
                      aria-live="polite"
                      className={
                        handleStatus === 'taken' || (handle && !HANDLE_RE.test(handle))
                          ? 'mt-1.5 text-xs text-danger'
                          : 'sr-only'
                      }
                    >
                      {handle && !HANDLE_RE.test(handle)
                        ? 'Only lowercase letters, numbers, and underscores.'
                        : handleStatus === 'taken'
                        ? 'That handle is already taken.'
                        : handleStatus === 'checking'
                        ? 'Checking availability…'
                        : handleStatus === 'available'
                        ? 'Handle is available.'
                        : ''}
                    </p>
                  </div>
                </div>
      )}

      {/* ── Step 2: Bio + Avatar ── */}
      {step === 2 && (
                <div className="mt-2 space-y-5">
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
      )}

      {/* ── Step 3: Region ── */}
      {step === 3 && (
                <div className="mt-2">
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
      )}

      {/* ── Step 4: Review ── */}
      {step === 4 && (
                <div className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
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
      )}
    </WizardShell>
  )
}
