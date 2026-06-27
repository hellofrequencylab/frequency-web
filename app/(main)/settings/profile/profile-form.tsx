'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { getInitials } from '@/lib/utils'
import { Check, Loader2, Sparkles, ExternalLink } from 'lucide-react'
import { updateProfile, uploadProfileImageAction, setSpotlightPublished } from './actions'
import { HeaderEditor } from './header-editor'
import { LocationAutocomplete } from '@/components/admin/location-autocomplete'

type HandleStatus = 'idle' | 'checking' | 'available' | 'taken'

function resizeToJpeg(file: File, size = 512): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      const scale = Math.max(size / img.width, size / img.height)
      const w = img.width * scale
      const h = img.height * scale
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Canvas export failed')),
        'image/jpeg',
        0.92
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode image')) }
    img.src = url
  })
}

const HANDLE_RE = /^[a-z0-9_]+$/

const input = 'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder-subtle focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong/30 disabled:opacity-50'
const lbl   = 'block text-sm font-medium text-text mb-1'

export function ProfileForm({
  userId,
  initial,
}: {
  userId: string
  initial: {
    displayName: string
    handle: string
    bio: string
    avatarUrl: string
    headerImageUrl: string
    email: string
    phone: string
    city: string
    website: string
    spotlightEnabled: boolean
    spotlightPublished: boolean
  }
}) {
  const [displayName,   setDisplayName]   = useState(initial.displayName)
  const [handle,        setHandle]        = useState(initial.handle)
  const [handleTouched, setHandleTouched] = useState(false)
  const [handleCheck,   setHandleCheck]   = useState<{ handle: string; status: 'available' | 'taken' | 'idle' } | null>(null)
  const [bio,           setBio]           = useState(initial.bio)
  const [phone,         setPhone]         = useState(initial.phone)
  const [city,          setCity]          = useState(initial.city)
  // City picks also propagate the member's home location (powers "near you").
  const [home,          setHome]          = useState<{ lat: number; lng: number; label: string } | null>(null)
  const [website,       setWebsite]       = useState(initial.website)
  const [avatarUrl,     setAvatarUrl]     = useState(initial.avatarUrl)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initial.avatarUrl || null)
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null)
  const [headerUrl,     setHeaderUrl]     = useState(initial.headerImageUrl)
  const [headerBlob,    setHeaderBlob]    = useState<Blob | null>(null)
  const [headerRemoved, setHeaderRemoved] = useState(false)
  const [uploading,     setUploading]     = useState(false)
  const [uploadError,   setUploadError]   = useState('')
  const [spotPublished, setSpotPublished] = useState(initial.spotlightPublished)
  const [spotPending,   setSpotPending]   = useState(false)
  const [spotError,     setSpotError]     = useState('')
  const [saved,         setSaved]         = useState(false)
  const [saveError,     setSaveError]     = useState('')
  const [isPending,     startTransition]  = useTransition()

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle status is derived during render — the only thing that genuinely needs
  // an effect is the async uniqueness check, whose result we store tagged with
  // the handle it applies to so a stale response can't be shown against newer
  // input. (Deriving here instead of setting state in the effect avoids the
  // cascading re-renders that react-hooks/set-state-in-effect warns about.)
  const handleNeedsCheck =
    handleTouched &&
    handle !== initial.handle &&
    handle.length >= 3 &&
    HANDLE_RE.test(handle)

  let handleStatus: HandleStatus
  if (!handleTouched || handle === initial.handle) {
    handleStatus = 'available'      // own handle / untouched is always fine
  } else if (!handleNeedsCheck) {
    handleStatus = 'idle'           // too short or invalid characters
  } else if (handleCheck?.handle === handle) {
    handleStatus = handleCheck.status
  } else {
    handleStatus = 'checking'       // debouncing or awaiting the network result
  }

  useEffect(() => {
    if (!handleNeedsCheck) return
    if (handleCheck?.handle === handle) return // already resolved for this value
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/check-handle?handle=${encodeURIComponent(handle)}&userId=${encodeURIComponent(userId)}`
        )
        const { available } = (await res.json()) as { available: boolean }
        setHandleCheck({ handle, status: available ? 'available' : 'taken' })
      } catch {
        setHandleCheck({ handle, status: 'idle' })
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [handle, handleNeedsCheck, handleCheck, userId])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
    if (file.size > MAX_BYTES) {
      setUploadError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploadError('')
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  // Upload the cropped header blob (already 1500×560 from the editor). The write
  // goes through a server action — the browser client can lack a session under
  // SSR-cookie auth, which makes a direct storage upload run as `anon` and fail
  // the owner-INSERT RLS policy ("new row violates row-level security policy").
  async function uploadHeader(): Promise<string> {
    if (!headerBlob) return headerUrl
    setUploading(true)
    setUploadError('')
    try {
      const fd = new FormData()
      fd.append('file', headerBlob, 'header.jpg')
      fd.append('kind', 'header')
      const url = await uploadProfileImageAction(fd)
      setHeaderUrl(url)
      return url
    } catch (err) {
      setUploadError(`Header upload failed: ${err instanceof Error ? err.message : 'unknown error'}`)
      return headerUrl
    } finally {
      setUploading(false)
    }
  }

  async function uploadAvatar(): Promise<string> {
    if (!avatarFile) return avatarUrl
    setUploading(true)
    setUploadError('')

    let blob: Blob
    try {
      blob = await resizeToJpeg(avatarFile, 512)
    } catch {
      setUploadError('Could not process image. Try a different file.')
      setUploading(false)
      return avatarUrl
    }

    try {
      const fd = new FormData()
      fd.append('file', blob, 'avatar.jpg')
      fd.append('kind', 'avatar')
      const url = await uploadProfileImageAction(fd)
      setAvatarUrl(url)
      return url
    } catch (err) {
      setUploadError(`Upload failed: ${err instanceof Error ? err.message : 'unknown error'}`)
      return avatarUrl
    } finally {
      setUploading(false)
    }
  }

  const canSave =
    displayName.trim().length > 0 &&
    handle.length >= 3 &&
    HANDLE_RE.test(handle) &&
    handleStatus !== 'taken' &&
    handleStatus !== 'checking' &&
    !uploading &&
    !isPending

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaveError('')
    setSaved(false)

    let finalAvatarUrl = avatarUrl
    if (avatarFile) {
      finalAvatarUrl = await uploadAvatar()
    }
    let finalHeaderUrl = headerUrl
    if (headerBlob) {
      finalHeaderUrl = await uploadHeader()
    } else if (headerRemoved) {
      finalHeaderUrl = ''
    }

    startTransition(async () => {
      try {
        await updateProfile({
          displayName:    displayName.trim(),
          handle:         handle.trim(),
          bio:            bio.trim(),
          avatarUrl:      finalAvatarUrl,
          headerImageUrl: finalHeaderUrl,
          phone:          phone.trim(),
          city:           city.trim(),
          website:        website.trim(),
          home,
        })
        setSaved(true)
        setAvatarFile(null)
        setHeaderBlob(null)
        setHeaderRemoved(false)
        setTimeout(() => setSaved(false), 3000)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  async function handleTogglePublish() {
    const next = !spotPublished
    setSpotPending(true)
    setSpotError('')
    try {
      await setSpotlightPublished(next)
      setSpotPublished(next)
    } catch (err) {
      setSpotError(err instanceof Error ? err.message : 'Could not update your Spotlight.')
    } finally {
      setSpotPending(false)
    }
  }

  const showInitials = getInitials(displayName || initial.displayName || '?')
  const spotlightUrl = handle ? `/spotlight/${handle}` : ''

  return (
    <form onSubmit={handleSave} className="space-y-6">

      {/* ── Header / cover image (upload → drag + zoom to crop) ──────── */}
      <div>
        <label className={lbl}>Header image</label>
        <HeaderEditor
          initialUrl={headerUrl || null}
          onChange={(blob, removed) => {
            setHeaderBlob(blob)
            setHeaderRemoved(removed)
          }}
        />
      </div>

      {/* ── Avatar ──────────────────────────────────── */}
      <div>
        <label className={lbl}>Photo</label>
        <div className="flex items-center gap-4">
          {avatarPreview ? (
            // avatarPreview is a local object-URL (blob:) once a file is picked,
            // so the Next optimizer can't handle it — a plain <img> is correct.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarPreview}
              alt="Profile photo"
              className="w-16 h-16 rounded-full object-cover shrink-0 ring-2 ring-surface shadow"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary-bg text-primary-strong text-xl font-bold flex items-center justify-center shrink-0 select-none">
              {showInitials}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-sm font-medium text-primary-strong hover:text-primary-strong transition-colors"
            >
              {avatarPreview ? 'Change photo' : 'Upload photo'}
            </button>
            {avatarPreview && avatarPreview !== initial.avatarUrl && (
              <button
                type="button"
                onClick={() => {
                  setAvatarFile(null)
                  setAvatarPreview(initial.avatarUrl || null)
                  setAvatarUrl(initial.avatarUrl)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                className="text-sm text-subtle hover:text-muted transition-colors"
              >
                Revert
              </button>
            )}
            <p className="text-xs text-subtle">Any image format up to 5 MB · resized to 512×512</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
        {uploadError && <p className="mt-1.5 text-xs text-danger">{uploadError}</p>}
      </div>

      {/* ── Display name ────────────────────────────── */}
      <div>
        <label htmlFor="displayName" className={lbl}>
          Display name <span className="text-danger">*</span>
        </label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="Jane Smith"
          required
          disabled={isPending}
          className={input}
        />
      </div>

      {/* ── Handle ──────────────────────────────────── */}
      <div>
        <label htmlFor="handle" className={lbl}>
          Handle <span className="text-danger">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle select-none">@</span>
          <input
            id="handle"
            type="text"
            value={handle}
            onChange={e => {
              setHandleTouched(true)
              setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
            }}
            placeholder="jane_smith"
            required
            disabled={isPending}
            className={`${input} pl-7 pr-8`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm leading-none">
            {handleStatus === 'checking'  && <span className="text-subtle animate-pulse">•••</span>}
            {handleStatus === 'available' && <span className="text-success">✓</span>}
            {handleStatus === 'taken'     && <span className="text-danger">✗</span>}
          </span>
        </div>
        {handleStatus === 'taken' && (
          <p className="mt-1 text-xs text-danger">This handle is already taken.</p>
        )}
        {handle && !HANDLE_RE.test(handle) && (
          <p className="mt-1 text-xs text-danger">Lowercase letters, numbers, and underscores only.</p>
        )}
      </div>

      {/* ── Bio ─────────────────────────────────────── */}
      <div>
        <label htmlFor="bio" className={lbl}>
          Bio <span className="text-subtle font-normal text-xs">(optional)</span>
        </label>
        <textarea
          id="bio"
          value={bio}
          onChange={e => setBio(e.target.value.slice(0, 280))}
          placeholder="A bit about yourself..."
          rows={4}
          disabled={isPending}
          className={`${input} resize-none`}
        />
        <p className={`mt-1 text-xs text-right tabular-nums ${bio.length >= 260 ? 'text-primary' : 'text-subtle'}`}>
          {bio.length} / 280
        </p>
      </div>

      {/* ── Personal info / contact ─────────────────── */}
      <div className="space-y-5 rounded-2xl border border-border bg-surface-elevated/40 p-4">
        <div>
          <p className="text-sm font-semibold text-text">Personal info</p>
          <p className="mt-0.5 text-xs text-muted">
            Private to you and your community leaders. Used to keep in touch, never shown on your public profile.
          </p>
        </div>

        {/* Email — read-only (managed by your sign-in) */}
        <div>
          <label className={lbl}>Email</label>
          <input
            type="email"
            value={initial.email}
            readOnly
            disabled
            className={`${input} cursor-not-allowed text-muted`}
          />
          <p className="mt-1 text-xs text-subtle">Your sign-in email. Contact support to change it.</p>
        </div>

        <div>
          <label htmlFor="phone" className={lbl}>
            Phone <span className="text-subtle font-normal text-xs">(optional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value.slice(0, 40))}
            placeholder="(555) 123-4567"
            disabled={isPending}
            className={input}
          />
        </div>

        <div>
          <label className={lbl}>
            City <span className="text-subtle font-normal text-xs">(optional)</span>
          </label>
          <LocationAutocomplete
            value={city}
            placeholder="Start typing your city…"
            onPick={(p) => {
              setCity(p.label.split(',')[0])
              setHome({ lat: p.lat, lng: p.lng, label: p.label })
            }}
          />
          <p className="mt-1 text-xs text-subtle">Pick from the suggestions. It also sets your location so we can surface circles and events near you.</p>
        </div>

        <div>
          <label htmlFor="website" className={lbl}>
            Website <span className="text-subtle font-normal text-xs">(optional)</span>
          </label>
          <input
            id="website"
            type="url"
            value={website}
            onChange={e => setWebsite(e.target.value.slice(0, 200))}
            placeholder="yoursite.com"
            disabled={isPending}
            className={input}
          />
        </div>
      </div>

      {/* ── Spotlight page (opt-in public mini-site) ── shown only once turned on ── */}
      {initial.spotlightEnabled && (
        <div className="space-y-3 rounded-2xl border border-border bg-surface-elevated/40 p-4">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-text">Your Spotlight page</p>
              <p className="mt-0.5 text-xs text-muted">
                A shareable page with your bio, links, and what you host. Themed to match your
                profile. Anyone with the link can see it once you publish.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
            <span className="text-sm text-text">{spotPublished ? 'Published' : 'Draft (only you can see it)'}</span>
            <button
              type="button"
              onClick={handleTogglePublish}
              disabled={spotPending}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                spotPublished
                  ? 'border border-border-strong text-text hover:bg-surface-elevated'
                  : 'bg-primary text-on-primary hover:bg-primary-hover'
              }`}
            >
              {spotPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {spotPublished ? 'Unpublish' : 'Publish'}
            </button>
          </div>

          {spotError && <p className="text-xs text-danger">{spotError}</p>}

          {spotPublished && spotlightUrl && (
            <Link
              href={spotlightUrl}
              target="_blank"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> View your Spotlight
            </Link>
          )}
        </div>
      )}

      {/* ── Error + Save ────────────────────────────── */}
      {saveError && (
        <p className="text-sm text-danger">{saveError}</p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={!canSave}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-40 transition-colors"
        >
          {isPending || uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <Check className="w-4 h-4" />
          ) : null}
          {isPending || uploading ? 'Saving…' : saved ? 'Saved!' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
