'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import { Check, Loader2 } from 'lucide-react'
import { updateProfile } from './actions'

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

const input = 'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50'
const lbl   = 'block text-sm font-medium text-text mb-1'

export function ProfileForm({
  userId,
  initial,
}: {
  userId: string
  initial: { displayName: string; handle: string; bio: string; avatarUrl: string }
}) {
  const [displayName,   setDisplayName]   = useState(initial.displayName)
  const [handle,        setHandle]        = useState(initial.handle)
  const [handleTouched, setHandleTouched] = useState(false)
  const [handleStatus,  setHandleStatus]  = useState<HandleStatus>('available')
  const [bio,           setBio]           = useState(initial.bio)
  const [avatarUrl,     setAvatarUrl]     = useState(initial.avatarUrl)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initial.avatarUrl || null)
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null)
  const [uploading,     setUploading]     = useState(false)
  const [uploadError,   setUploadError]   = useState('')
  const [saved,         setSaved]         = useState(false)
  const [saveError,     setSaveError]     = useState('')
  const [isPending,     startTransition]  = useTransition()

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Debounced handle uniqueness check
  useEffect(() => {
    if (!handleTouched) return
    if (!handle || handle.length < 3 || !HANDLE_RE.test(handle)) {
      setHandleStatus('idle')
      return
    }
    // Own current handle is always available
    if (handle === initial.handle) {
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
  }, [handle, handleTouched, initial.handle, userId])

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

    const supabase = createClient()
    const path = `${userId}/avatar.jpg`

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })

    if (error) {
      setUploadError(`Upload failed: ${error.message}`)
      setUploading(false)
      return avatarUrl
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const bustedUrl = `${publicUrl}?t=${Date.now()}`
    setAvatarUrl(bustedUrl)
    setUploading(false)
    return bustedUrl
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

    startTransition(async () => {
      try {
        await updateProfile({
          displayName: displayName.trim(),
          handle:      handle.trim(),
          bio:         bio.trim(),
          avatarUrl:   finalAvatarUrl,
        })
        setSaved(true)
        setAvatarFile(null)
        setTimeout(() => setSaved(false), 3000)
      } catch (err: any) {
        setSaveError(err?.message ?? 'Something went wrong.')
      }
    })
  }

  const showInitials = getInitials(displayName || initial.displayName || '?')

  return (
    <form onSubmit={handleSave} className="space-y-6">

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
