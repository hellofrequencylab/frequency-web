'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { updateProfile } from './actions'

type HandleStatus = 'idle' | 'checking' | 'available' | 'taken'

type Props = {
  userId: string
  initialDisplayName: string
  initialHandle: string
  initialBio: string
  initialAvatarUrl: string
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

const HANDLE_RE = /^[a-z0-9_]+$/

export default function EditProfileForm({
  userId,
  initialDisplayName,
  initialHandle,
  initialBio,
  initialAvatarUrl,
}: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [handle, setHandle] = useState(initialHandle)
  const [handleStatus, setHandleStatus] = useState<HandleStatus>('available')
  const [bio, setBio] = useState(initialBio)

  // avatarPreview tracks what's shown in the UI (existing URL or new object URL).
  // avatarUrl tracks the committed URL to send to the server action.
  const [avatarPreview, setAvatarPreview] = useState<string>(initialAvatarUrl)
  const [avatarUrl, setAvatarUrl] = useState<string>(initialAvatarUrl)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Debounced handle uniqueness check (500 ms).
  // Short-circuits when handle equals the user's current saved handle so the
  // save button stays enabled without a round-trip.
  useEffect(() => {
    if (!handle || handle.length < 3 || !HANDLE_RE.test(handle)) {
      setHandleStatus('idle')
      return
    }
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

  // ── Avatar helpers ────────────────────────────────────────────────────────

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setUploadError('')
  }

  function removeAvatar() {
    setAvatarFile(null)
    setAvatarPreview('')
    setAvatarUrl('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadAvatar(): Promise<string> {
    if (!avatarFile) return avatarUrl
    setUploading(true)
    setUploadError('')

    const supabase = createClient()
    const ext = avatarFile.name.split('.').pop() ?? 'jpg'
    const path = `${userId}/avatar.${ext}`

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, avatarFile, { upsert: true })

    if (error) {
      setUploadError('Upload failed. Your other changes were still saved.')
      setUploading(false)
      return avatarUrl // fall back to existing URL
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    setAvatarUrl(publicUrl)
    setUploading(false)
    return publicUrl
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  function isValid(): boolean {
    return (
      displayName.trim().length > 0 &&
      handle.length >= 3 &&
      HANDLE_RE.test(handle) &&
      handleStatus === 'available' &&
      !uploading &&
      !saving
    )
  }

  async function handleSave() {
    if (!isValid()) return
    setSaving(true)
    setSaveError('')

    const finalAvatarUrl = avatarFile ? await uploadAvatar() : avatarUrl

    try {
      await updateProfile({
        displayName: displayName.trim(),
        handle,
        bio,
        avatarUrl: finalAvatarUrl,
      })
      // updateProfile redirects on success — execution stops here.
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong.')
      setSaving(false)
    }
  }

  // ── Shared styles ─────────────────────────────────────────────────────────

  const inputBase =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

  return (
    <main className="min-h-screen bg-white flex items-start justify-center px-4 pt-16 pb-12">
      <div className="w-full max-w-md space-y-8">

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit profile</h1>
          <p className="mt-1 text-sm text-gray-500">Changes are visible on your public profile.</p>
        </div>

        <div className="space-y-5">

          {/* Avatar */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Photo</label>
            <div className="flex items-center gap-4">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Avatar"
                  className="w-16 h-16 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-600 text-xl font-semibold flex items-center justify-center shrink-0">
                  {getInitials(displayName) || '?'}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                >
                  {avatarPreview ? 'Change photo' : 'Upload photo'}
                </button>
                {avatarPreview && (
                  <button
                    type="button"
                    onClick={removeAvatar}
                    className="text-sm text-gray-400 hover:text-gray-600"
                  >
                    Remove
                  </button>
                )}
                <p className="text-xs text-gray-400">JPG, PNG, GIF up to 5 MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileChange}
              />
            </div>
            {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}
          </div>

          {/* Display name */}
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
              Display name <span className="text-red-400">*</span>
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputBase}
            />
          </div>

          {/* Handle */}
          <div>
            <label htmlFor="handle" className="block text-sm font-medium text-gray-700 mb-1">
              Handle <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 select-none">
                @
              </span>
              <input
                id="handle"
                type="text"
                value={handle}
                onChange={(e) =>
                  setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                }
                className={`${inputBase} pl-7 pr-8`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm leading-none">
                {handleStatus === 'checking' && (
                  <span className="text-gray-300 animate-pulse">•••</span>
                )}
                {handleStatus === 'available' && (
                  <span className="text-green-500">✓</span>
                )}
                {handleStatus === 'taken' && (
                  <span className="text-red-500">✗</span>
                )}
              </span>
            </div>
            {handleStatus === 'taken' && (
              <p className="mt-1 text-xs text-red-600">This handle is already taken.</p>
            )}
            {handle && !HANDLE_RE.test(handle) && (
              <p className="mt-1 text-xs text-red-600">
                Only lowercase letters, numbers, and underscores.
              </p>
            )}
            {handle !== initialHandle && handleStatus === 'available' && (
              <p className="mt-1 text-xs text-gray-400">
                Your profile URL will change to /people/{handle}
              </p>
            )}
          </div>

          {/* Bio */}
          <div>
            <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">
              Bio
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 280))}
              rows={4}
              placeholder="A bit about yourself…"
              className={`${inputBase} resize-none`}
            />
            <p
              className={`mt-1 text-xs text-right tabular-nums ${
                bio.length >= 260 ? 'text-orange-500' : 'text-gray-400'
              }`}
            >
              {bio.length} / 280
            </p>
          </div>
        </div>

        {saveError && (
          <p className="text-sm text-red-600">{saveError}</p>
        )}

        <div className="flex gap-3 pt-1">
          <a
            href={`/people/${initialHandle}`}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors text-center"
          >
            Cancel
          </a>
          <button
            onClick={handleSave}
            disabled={!isValid()}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving || uploading ? 'Saving…' : 'Save changes'}
          </button>
        </div>

      </div>
    </main>
  )
}
