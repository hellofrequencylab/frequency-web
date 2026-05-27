'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import { Check, Loader2 } from 'lucide-react'
import { updateProfile } from './actions'

type HandleStatus = 'idle' | 'checking' | 'available' | 'taken'

const HANDLE_RE = /^[a-z0-9_]+$/

const input = 'w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-50 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50'
const lbl   = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

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
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setUploadError('')
  }

  async function uploadAvatar(): Promise<string> {
    if (!avatarFile) return avatarUrl
    setUploading(true)
    setUploadError('')

    const supabase = createClient()
    const ext  = avatarFile.name.split('.').pop() ?? 'jpg'
    const path = `${userId}/avatar.${ext}`

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, avatarFile, { upsert: true })

    if (error) {
      setUploadError('Upload failed — your other changes were still saved.')
      setUploading(false)
      return avatarUrl
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    setAvatarUrl(publicUrl)
    setUploading(false)
    return publicUrl
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
            <img
              src={avatarPreview}
              alt="Profile photo"
              className="w-16 h-16 rounded-full object-cover shrink-0 ring-2 ring-white dark:ring-gray-900 shadow"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-xl font-bold flex items-center justify-center shrink-0 select-none">
              {showInitials}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors"
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
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Revert
              </button>
            )}
            <p className="text-xs text-gray-400">JPG, PNG, GIF up to 5 MB</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
        {uploadError && <p className="mt-1.5 text-xs text-red-600">{uploadError}</p>}
      </div>

      {/* ── Display name ────────────────────────────── */}
      <div>
        <label htmlFor="displayName" className={lbl}>
          Display name <span className="text-red-400">*</span>
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
          Handle <span className="text-red-400">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 select-none">@</span>
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
            {handleStatus === 'checking'  && <span className="text-gray-300 animate-pulse">•••</span>}
            {handleStatus === 'available' && <span className="text-green-500">✓</span>}
            {handleStatus === 'taken'     && <span className="text-red-500">✗</span>}
          </span>
        </div>
        {handleStatus === 'taken' && (
          <p className="mt-1 text-xs text-red-600">This handle is already taken.</p>
        )}
        {handle && !HANDLE_RE.test(handle) && (
          <p className="mt-1 text-xs text-red-600">Lowercase letters, numbers, and underscores only.</p>
        )}
      </div>

      {/* ── Bio ─────────────────────────────────────── */}
      <div>
        <label htmlFor="bio" className={lbl}>
          Bio <span className="text-gray-400 font-normal text-xs">(optional)</span>
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
        <p className={`mt-1 text-xs text-right tabular-nums ${bio.length >= 260 ? 'text-orange-500' : 'text-gray-400'}`}>
          {bio.length} / 280
        </p>
      </div>

      {/* ── Error + Save ────────────────────────────── */}
      {saveError && (
        <p className="text-sm text-red-600">{saveError}</p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={!canSave}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
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
