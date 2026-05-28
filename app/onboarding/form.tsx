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
  const [handleStatus, setHandleStatus] = useState<HandleStatus>('idle')

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

  // Auto-suggest handle from display name until the user manually edits it
  useEffect(() => {
    if (!handleTouched) {
      setHandle(suggestHandle(displayName))
    }
  }, [displayName, handleTouched])

  // Debounced handle uniqueness check (500 ms)
  useEffect(() => {
    if (!handle || handle.length < 3 || !HANDLE_RE.test(handle)) {
      setHandleStatus('idle')
      return
    }
    // The user's own auto-generated handle is always available to them.
    if (handle === initialHandle) {
      setHandleStatus('available')
      return
    }
    setHandleStatus('checking')
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/check-handle?handle=${encodeURIComponent(handle)}&userId=${encodeURIComponent(userId)}`
        )
        const { available } = (await res.json()) as { available: boolean }
        setHandleStatus(available ? 'available' : 'taken')
      } catch {
        setHandleStatus('idle')
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [handle, initialHandle, userId])

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

  function renderAvatar(size: 'md' | 'lg' = 'md') {
    const dim = size === 'lg' ? 'w-24 h-24 text-3xl' : 'w-16 h-16 text-xl'
    if (avatarPreview) {
      return (
        <img
          src={avatarPreview}
          alt="Avatar preview"
          className={`${dim} rounded-full object-cover shrink-0`}
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
      <div className="flex items-center gap-1.5 mb-10">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                s === step
                  ? 'bg-primary text-on-primary'
                  : s < step
                  ? 'bg-primary-bg text-primary-strong'
                  : 'bg-surface-elevated text-subtle'
              }`}
            >
              {s < step ? '✓' : s}
            </div>
            {s < 4 && (
              <div
                className={`h-px w-6 transition-colors ${
                  s < step ? 'bg-primary' : 'bg-border-strong'
                }`}
              />
            )}
          </div>
        ))}
        <span className="ml-2 text-xs text-subtle">Step {step} of 4</span>
      </div>
    )
  }

  const btnPrimary =
    'flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
  const btnSecondary =
    'flex-1 rounded-lg border border-border-strong px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface transition-colors'
  const inputBase =
    'w-full rounded-lg border border-border-strong px-3 py-2 text-sm placeholder-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

  // ── Steps ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md py-12">
        {renderProgress()}

        {/* ── Step 1: Name + Handle ── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-text">Create your profile</h1>
              <p className="mt-1 text-sm text-muted">
                How should the community know you?
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="displayName" className="block text-sm font-medium text-text mb-1">
                  Display name <span className="text-danger">*</span>
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jane Smith"
                  autoFocus
                  className={inputBase}
                />
              </div>

              <div>
                <label htmlFor="handle" className="block text-sm font-medium text-text mb-1">
                  Handle <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle select-none">
                    @
                  </span>
                  <input
                    id="handle"
                    type="text"
                    value={handle}
                    onChange={(e) => {
                      setHandleTouched(true)
                      // Strip anything that isn't a valid handle character on input
                      setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                    }}
                    placeholder="jane_smith"
                    className={`${inputBase} pl-7 pr-8`}
                  />
                  {/* Status indicator */}
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm leading-none">
                    {handleStatus === 'checking' && (
                      <span className="text-subtle animate-pulse">•••</span>
                    )}
                    {handleStatus === 'available' && (
                      <span className="text-success">✓</span>
                    )}
                    {handleStatus === 'taken' && (
                      <span className="text-danger">✗</span>
                    )}
                  </span>
                </div>
                {handleStatus === 'taken' && (
                  <p className="mt-1 text-xs text-danger">This handle is already taken.</p>
                )}
                {handle && !HANDLE_RE.test(handle) && (
                  <p className="mt-1 text-xs text-danger">
                    Only lowercase letters, numbers, and underscores.
                  </p>
                )}
              </div>
            </div>

            <button disabled={!step1Valid()} onClick={() => setStep(2)} className={btnPrimary}>
              Next
            </button>
          </div>
        )}

        {/* ── Step 2: Bio + Avatar ── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-text">About you</h1>
              <p className="mt-1 text-sm text-muted">Both fields are optional.</p>
            </div>

            <div className="space-y-5">
              {/* Avatar upload */}
              <div>
                <label className="block text-sm font-medium text-text mb-2">Photo</label>
                <div className="flex items-center gap-4">
                  {renderAvatar()}
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-sm font-medium text-primary-strong hover:text-primary-strong"
                    >
                      {avatarPreview ? 'Change photo' : 'Upload photo'}
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
                    <p className="text-xs text-subtle">JPG, PNG, GIF up to 5 MB</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
                {uploadError && <p className="mt-2 text-xs text-danger">{uploadError}</p>}
              </div>

              {/* Bio textarea */}
              <div>
                <label htmlFor="bio" className="block text-sm font-medium text-text mb-1">
                  Bio
                </label>
                <textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 280))}
                  placeholder="A bit about yourself..."
                  rows={4}
                  className={`${inputBase} resize-none`}
                />
                <p
                  className={`mt-1 text-xs text-right tabular-nums ${
                    bio.length >= 260 ? 'text-primary' : 'text-subtle'
                  }`}
                >
                  {bio.length} / 280
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className={btnSecondary}>
                Back
              </button>
              <button onClick={advanceFromStep2} disabled={uploading} className={btnPrimary}>
                {uploading ? 'Uploading…' : 'Next'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Region ── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-text">Your region</h1>
              <p className="mt-1 text-sm text-muted">
                This connects you to the right local community.
              </p>
            </div>

            <div>
              <label htmlFor="region" className="block text-sm font-medium text-text mb-1">
                Region <span className="text-danger">*</span>
              </label>
              {regions.length === 0 ? (
                <p className="text-sm text-subtle italic">
                  No regions available yet. Check back soon.
                </p>
              ) : (
                <select
                  id="region"
                  value={regionId}
                  onChange={(e) => setRegionId(e.target.value)}
                  className={`${inputBase} bg-white`}
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
              <button onClick={() => setStep(2)} className={btnSecondary}>
                Back
              </button>
              <button
                disabled={!regionId && regions.length > 0}
                onClick={() => setStep(4)}
                className={btnPrimary}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Review ── */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-text">Looks good?</h1>
              <p className="mt-1 text-sm text-muted">
                Review your profile before joining.
              </p>
            </div>

            <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
              {/* Identity row */}
              <div className="flex items-center gap-4 p-4">
                {renderAvatar('lg')}
                <div>
                  <p className="font-semibold text-text">{displayName}</p>
                  <p className="text-sm text-muted">@{handle}</p>
                </div>
              </div>

              {bio && (
                <div className="px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-subtle mb-1">Bio</p>
                  <p className="text-sm text-text whitespace-pre-wrap">{bio}</p>
                </div>
              )}

              {regionId && (
                <div className="px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-subtle mb-1">Region</p>
                  <p className="text-sm text-text">
                    {regions.find((r) => r.id === regionId)?.name}
                  </p>
                </div>
              )}
            </div>

            {submitError && (
              <p className="text-sm text-danger text-center">{submitError}</p>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className={btnSecondary}>
                Back
              </button>
              <button onClick={submit} disabled={submitting} className={btnPrimary}>
                {submitting ? 'Joining…' : 'Join Frequency'}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
