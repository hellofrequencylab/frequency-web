'use client'

// The onboarding step registry — Layer 1 of the four-layer sequence model (see
// lib/onboarding/sequence-schema.ts). Each step TYPE maps to a component + a content schema
// (the operator-editable copy for that type) + a validate predicate (the pure gate on the
// draft). A SequenceStep in config points back HERE by `type` — the same element/{registry,name}
// bindings discipline lib/library/element-registry.tsx uses — so config is data and the render +
// detection + side-effects stay in code.
//
// The four registered types reproduce today's steady-state onboarding (app/onboarding/form.tsx:
// You / About you / Your region / Review) so a future cutover to the runner is behaviour
// preserving. Copy defaults mirror that file verbatim (voice canon: no em dashes). Client-safe;
// the terminal server action is resolved by KEY in the runner (components/onboarding/
// sequence-runner.tsx), never imported here.

import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { getInitials } from '@/lib/utils'
import { type StepType } from './step-types'

// ── The draft the flow accumulates + the per-request context the steps read ────────────────

/** The member fields a flow collects, mirroring the completeOnboarding action's payload. */
export interface OnboardingDraft {
  displayName: string
  handle: string
  bio: string
  avatarUrl: string
  regionId: string
}

/** Server-provided context for a run (the props app/onboarding/page.tsx already loads). */
export interface SequenceStepContext {
  userId: string
  userEmail: string
  initialHandle: string
  regions: { id: string; name: string }[]
}

/** Transient footer state a step pushes UP to the runner (busy/error/async-before-advance),
 *  the generalisation of form.tsx's per-step `stepConfig`. */
export interface StepControls {
  /** Disable Continue for a reason the pure `validate` can't see (e.g. an async handle check). */
  nextDisabled?: boolean
  busy?: boolean
  busyLabel?: string
  /** A recoverable error shown above the footer. */
  error?: string
  /** Run before advancing; return false to block (e.g. a failed upload). Async allowed. */
  onBeforeNext?: () => boolean | Promise<boolean>
}

/** What every step component receives. `content` is already parsed through the type's schema. */
export interface StepViewProps {
  content: Record<string, unknown>
  draft: OnboardingDraft
  patch: (patch: Partial<OnboardingDraft>) => void
  report: (controls: StepControls) => void
  ctx: SequenceStepContext
}

/** A registered step type (Layer 1). */
export interface StepDef {
  type: string
  /** Default progress-cue label. */
  label: string
  /** The operator-editable copy schema for this type (fields default to today's copy). */
  contentSchema: z.ZodTypeAny
  /** The render component. */
  Component: React.ComponentType<StepViewProps>
  /** Pure gate on the draft (Continue enabled when true). Absent = always enabled. */
  validate?: (draft: OnboardingDraft, ctx: SequenceStepContext) => boolean
}

// ── Shared helpers (ported from form.tsx, unchanged) ────────────────────────────────────────

const HANDLE_RE = /^[a-z0-9_]+$/

function suggestHandle(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 30)
}

const inputBase =
  'w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-subtle transition-colors focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong/25'

// Only paint a preview for a known-safe image scheme — a blob: URL from
// createObjectURL or our http(s) upload URL. Guards the <img> src sink so a tainted
// value can never reach it (CodeQL js/xss-through-dom). data: is intentionally excluded
// (a data:image/svg+xml can carry script), and so are relative/scheme-less values.
const SAFE_IMG_SRC = /^(?:blob:|https?:\/\/)/i

function Avatar({ url, name, email, size = 'md' }: { url: string; name: string; email: string; size?: 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'w-20 h-20 text-2xl' : 'w-16 h-16 text-xl'
  if (url && SAFE_IMG_SRC.test(url)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="Avatar preview" className={`${dim} rounded-full object-cover shrink-0 ring-2 ring-primary-bg`} />
    )
  }
  const initials = getInitials(name || email)
  return (
    <div className={`${dim} rounded-full bg-primary-bg text-primary-strong font-semibold flex items-center justify-center shrink-0`}>
      {initials || '?'}
    </div>
  )
}

// ── identity — "You": display name + handle (with the live uniqueness check) ─────────────────

const identityContent = z
  .object({
    title: z.string().default('Let’s set you up'),
    description: z.string().default('How should the community know you?'),
    displayNameLabel: z.string().default('Display name'),
    handleLabel: z.string().default('Handle'),
  })

type HandleStatus = 'idle' | 'checking' | 'available' | 'taken'

function IdentityStep({ content, draft, patch, report, ctx }: StepViewProps) {
  const c = identityContent.parse(content)
  const [handleTouched, setHandleTouched] = useState(false)
  const [check, setCheck] = useState<{ handle: string; result: 'available' | 'taken' | 'idle' } | null>(null)
  const handle = draft.handle

  // Debounced handle uniqueness check (ported from form.tsx). State is only set from the async
  // callback, keyed to the handle it checked, so live status is derived during render.
  useEffect(() => {
    const valid = handle.length >= 3 && HANDLE_RE.test(handle)
    if (!valid || handle === ctx.initialHandle) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/check-handle?handle=${encodeURIComponent(handle)}&userId=${encodeURIComponent(ctx.userId)}`,
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
  }, [handle, ctx.initialHandle, ctx.userId])

  const formatOk = handle.length >= 3 && HANDLE_RE.test(handle)
  const handleStatus: HandleStatus = !formatOk
    ? 'idle'
    : handle === ctx.initialHandle
    ? 'available'
    : check && check.handle === handle
    ? check.result
    : 'checking'

  // The async availability gate the pure validate can't see: block Continue until it resolves.
  useEffect(() => {
    report({ nextDisabled: handleStatus !== 'available' })
  }, [handleStatus, report])

  return (
    <div className="mt-2 space-y-4">
      <div>
        <label htmlFor="displayName" className="mb-1.5 block text-sm font-medium text-text">
          {c.displayNameLabel} <span className="text-danger">*</span>
        </label>
        <input
          id="displayName"
          type="text"
          value={draft.displayName}
          onChange={(e) => {
            const v = e.target.value
            patch({ displayName: v })
            if (!handleTouched) patch({ handle: suggestHandle(v) })
          }}
          placeholder="Jane Smith"
          autoFocus
          className={inputBase}
        />
      </div>

      <div>
        <label htmlFor="handle" className="mb-1.5 block text-sm font-medium text-text">
          {c.handleLabel} <span className="text-danger">*</span>
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-subtle">@</span>
          <input
            id="handle"
            type="text"
            value={handle}
            onChange={(e) => {
              setHandleTouched(true)
              patch({ handle: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })
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
  )
}

// ── profile — "About you": avatar + bio ──────────────────────────────────────────────────────

const profileContent = z
  .object({
    title: z.string().default('Add a face and a few words'),
    description: z.string().default('Optional, but it helps people connect.'),
    bioLabel: z.string().default('One line about you'),
    bioPlaceholder: z.string().default('What should people know?'),
  })

function ProfileStep({ content, draft, patch, report, ctx }: StepViewProps) {
  const c = profileContent.parse(content)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setUploadError('')
    patch({ avatarUrl: '' }) // reset any previously uploaded URL
  }

  async function uploadAvatar(): Promise<string> {
    if (!file) return draft.avatarUrl
    setUploading(true)
    setUploadError('')
    // Dynamic import keeps this module's load pure (React only) for unit-testing the registry.
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${ctx.userId}/avatar.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (error) {
      setUploadError('Upload failed. You can add a photo later from your profile.')
      setUploading(false)
      return ''
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from('avatars').getPublicUrl(path)
    patch({ avatarUrl: publicUrl })
    setUploading(false)
    return publicUrl
  }

  // Push footer state up: busy while uploading, and upload-on-advance if a file is pending.
  useEffect(() => {
    report({
      busy: uploading,
      busyLabel: 'Uploading…',
      nextDisabled: uploading,
      error: uploadError || undefined,
      onBeforeNext: async () => {
        if (file && !draft.avatarUrl) await uploadAvatar()
        return true
      },
    })
    // uploadAvatar is recreated per render but closes over the current file/draft; re-report on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploading, uploadError, file, draft.avatarUrl, report])

  return (
    <div className="mt-2 space-y-5">
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4">
        <Avatar url={preview ?? ''} name={draft.displayName} email={ctx.userEmail} />
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-sm font-semibold text-primary-strong hover:underline"
          >
            {preview ? 'Change photo' : 'Upload a photo'}
          </button>
          {preview && (
            <button
              type="button"
              onClick={() => {
                setFile(null)
                setPreview(null)
                patch({ avatarUrl: '' })
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              className="text-sm text-subtle hover:text-muted"
            >
              Remove
            </button>
          )}
          <p className="text-xs text-subtle">JPG, PNG, or GIF up to 5 MB</p>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      </div>
      {uploadError && <p className="text-xs text-danger">{uploadError}</p>}

      <div>
        <label htmlFor="bio" className="mb-1.5 block text-sm font-medium text-text">
          {c.bioLabel}
        </label>
        <textarea
          id="bio"
          value={draft.bio}
          onChange={(e) => patch({ bio: e.target.value.slice(0, 280) })}
          placeholder={c.bioPlaceholder}
          rows={4}
          className={`${inputBase} resize-none`}
        />
        <p className={`mt-1.5 text-right text-xs tabular-nums ${draft.bio.length >= 260 ? 'text-primary' : 'text-subtle'}`}>
          {draft.bio.length} / 280
        </p>
      </div>
    </div>
  )
}

// ── region — "Your region": region picker ─────────────────────────────────────────────────────

const regionContent = z
  .object({
    title: z.string().default('Where are you?'),
    description: z.string().default('We’ll connect you to the community nearest you.'),
    regionLabel: z.string().default('Region'),
    emptyText: z.string().default('No regions available yet. Check back soon.'),
  })

function RegionStep({ content, draft, patch, ctx }: StepViewProps) {
  const c = regionContent.parse(content)
  return (
    <div className="mt-2">
      <label htmlFor="region" className="mb-1.5 block text-sm font-medium text-text">
        {c.regionLabel} <span className="text-danger">*</span>
      </label>
      {ctx.regions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface/50 px-4 py-6 text-center text-sm text-subtle">
          {c.emptyText}
        </p>
      ) : (
        <select
          id="region"
          value={draft.regionId}
          onChange={(e) => patch({ regionId: e.target.value })}
          className={inputBase}
        >
          <option value="">Select a region…</option>
          {ctx.regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

// ── review — "Review": read-only summary + the terminal action ────────────────────────────────

const reviewContent = z
  .object({
    title: z.string().default('Ready to join?'),
    description: z.string().default('A quick look before you step in.'),
    submitLabel: z.string().default('Join Frequency'),
    submitBusyLabel: z.string().default('Joining…'),
  })

function ReviewStep({ draft, ctx }: StepViewProps) {
  return (
    <div className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-4 p-5">
        <Avatar url={draft.avatarUrl} name={draft.displayName} email={ctx.userEmail} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-text">{draft.displayName}</p>
          <p className="text-sm text-muted">@{draft.handle}</p>
        </div>
      </div>

      {draft.bio && (
        <div className="px-5 py-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">Bio</p>
          <p className="whitespace-pre-wrap text-sm text-text">{draft.bio}</p>
        </div>
      )}

      {draft.regionId && (
        <div className="px-5 py-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">Region</p>
          <p className="text-sm text-text">{ctx.regions.find((r) => r.id === draft.regionId)?.name}</p>
        </div>
      )}
    </div>
  )
}

// ── The registry ──────────────────────────────────────────────────────────────────────────────

export const STEP_REGISTRY: Record<StepType, StepDef> = {
  identity: {
    type: 'identity',
    label: 'You',
    contentSchema: identityContent,
    Component: IdentityStep,
    validate: (draft) =>
      draft.displayName.trim().length > 0 && draft.handle.length >= 3 && HANDLE_RE.test(draft.handle),
  },
  profile: {
    type: 'profile',
    label: 'About you',
    contentSchema: profileContent,
    Component: ProfileStep,
  },
  region: {
    type: 'region',
    label: 'Your region',
    contentSchema: regionContent,
    Component: RegionStep,
    validate: (draft, ctx) => draft.regionId !== '' || ctx.regions.length === 0,
  },
  review: {
    type: 'review',
    label: 'Review',
    contentSchema: reviewContent,
    Component: ReviewStep,
  },
}

/** Resolve a step type to its code definition, or undefined for an unknown type. */
export function getStepDef(type: string): StepDef | undefined {
  return STEP_REGISTRY[type as StepType]
}

// The registry's known TYPES + terminal ACTION keys live in the pure, server-safe sibling
// (step-types.ts) so the sequence write layer can consult them without importing this 'use client'
// module. Re-exported here to keep the historical import site (getStepDef + SEQUENCE_ACTION_KEYS from
// step-registry) working unchanged. STEP_REGISTRY is typed Record<StepType, StepDef>, so TS flags any
// drift between the two.
export { STEP_TYPES, SEQUENCE_ACTION_KEYS, type StepType, type SequenceActionKey } from './step-types'
