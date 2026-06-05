'use client'

import { useState, useTransition, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { Megaphone, ImagePlus, X, PenLine } from 'lucide-react'
import { createPost } from '@/app/(main)/feed/actions'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

type HandleResult = { id: string; handle: string; display_name: string; avatar_url: string | null }

export function Composer({
  scopeId,
  visibility = 'group',
  placeholder = 'Share something with your group…',
  canAnnounce = false,
}: {
  scopeId: string
  visibility?: 'public' | 'region' | 'cluster' | 'group'
  placeholder?: string
  canAnnounce?: boolean
}) {
  const [body, setBody] = useState('')
  const [isAnnouncement, setIsAnnouncement] = useState(false)
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageError, setImageError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState<number>(0)
  const [suggestions, setSuggestions] = useState<HandleResult[]>([])
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    if (!file.type.startsWith('image/')) {
      setImageError('Only image files are allowed.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setImageError('')
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function removeImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImagePreview(null)
    setImageError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadImage(): Promise<string | null> {
    if (!imageFile) return null

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setImageError('You must be signed in to upload images.')
      return null
    }

    const safeName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${user.id}/${Date.now()}-${safeName}`

    const { error } = await supabase.storage
      .from('posts')
      .upload(path, imageFile, { contentType: imageFile.type })

    if (error) {
      setImageError(`Upload failed: ${error.message}`)
      return null
    }

    const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(path)
    return publicUrl
  }

  function submit() {
    const trimmed = body.trim()
    if ((!trimmed && !imageFile) || isPending) return

    startTransition(async () => {
      let imageUrl: string | null = null
      if (imageFile) {
        imageUrl = await uploadImage()
        if (imageFile && !imageUrl) return // upload failed, abort
      }

      const fd = new FormData()
      fd.set('body', trimmed)
      fd.set('scopeId', scopeId)
      fd.set('visibility', visibility)
      fd.set('post_type', isAnnouncement ? 'announcement' : 'feed')
      if (imageUrl) fd.set('imageUrl', imageUrl)

      await createPost(fd)
      setBody('')
      setIsAnnouncement(false)
      removeImage()
      setSuggestions([])
      setMentionQuery(null)
    })
  }

  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!q) { setSuggestions([]); return }
      const res = await fetch(`/api/search-handles?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      setSuggestions(json.profiles ?? [])
      setActiveSuggestion(0)
    }, 150)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setBody(val)

    // Detect @mention. Find last @ before cursor that has no space after it
    const cursor = e.target.selectionStart ?? val.length
    const textBefore = val.slice(0, cursor)
    const match = textBefore.match(/@([a-zA-Z0-9_]*)$/)
    if (match) {
      setMentionStart(cursor - match[0].length)
      setMentionQuery(match[1])
      fetchSuggestions(match[1])
    } else {
      setMentionQuery(null)
      setSuggestions([])
    }
  }

  function insertMention(profile: HandleResult) {
    const textarea = textareaRef.current
    if (!textarea) return
    const before = body.slice(0, mentionStart)
    const after  = body.slice(textarea.selectionStart ?? body.length)
    const newBody = `${before}@${profile.handle} ${after}`
    setBody(newBody)
    setMentionQuery(null)
    setSuggestions([])
    // Restore focus + cursor after the inserted mention
    setTimeout(() => {
      textarea.focus()
      const pos = before.length + profile.handle.length + 2
      textarea.setSelectionRange(pos, pos)
    }, 0)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveSuggestion(i => Math.min(i + 1, suggestions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveSuggestion(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(suggestions[activeSuggestion])
        return
      }
      if (e.key === 'Escape') {
        setSuggestions([])
        setMentionQuery(null)
        return
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside() { setSuggestions([]); setMentionQuery(null) }
    if (suggestions.length > 0) document.addEventListener('click', handleOutside)
    return () => document.removeEventListener('click', handleOutside)
  }, [suggestions.length])

  return (
    <div data-tour-anchor="composer" className="rounded-xl border border-border bg-surface p-4 mb-4 relative transition-colors focus-within:border-border-strong">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={isAnnouncement ? 'Share an announcement with your group…' : placeholder}
        rows={2}
        disabled={isPending}
        className="min-h-16 w-full resize-none bg-transparent text-sm text-text placeholder-subtle outline-none focus-visible:shadow-none leading-relaxed disabled:opacity-60"
      />

      {/* Image preview */}
      {imagePreview && (
        <div className="relative mt-2 inline-block">
          {/* Local object-URL preview of the file being uploaded — a transient
              blob: src that the Next image optimizer can't (and shouldn't) touch,
              so a plain <img> is correct here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagePreview}
            alt="Upload preview"
            className="rounded-xl max-h-48 object-cover border border-border"
          />
          <button
            type="button"
            onClick={removeImage}
            className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
            aria-label="Remove image"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {imageError && <p className="mt-1.5 text-xs text-danger">{imageError}</p>}

      {/* @mention autocomplete dropdown */}
      {suggestions.length > 0 && mentionQuery !== null && (
        <div
          className="absolute left-4 bottom-full mb-1 w-64 rounded-xl border border-border bg-surface shadow-xl shadow-black/5 py-1 z-50"
          onMouseDown={e => e.preventDefault()}
        >
          {suggestions.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => insertMention(p)}
              className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left transition-colors ${
                i === activeSuggestion
                  ? 'bg-primary-bg'
                  : 'hover:bg-surface-elevated'
              }`}
            >
              {p.avatar_url ? (
                <Image src={p.avatar_url} alt={p.display_name} width={24} height={24} className="w-6 h-6 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-primary-bg text-primary-strong text-[10px] font-bold flex items-center justify-center shrink-0">
                  {getInitials(p.display_name)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-text truncate">{p.display_name}</p>
                <p className="text-[11px] text-subtle truncate">@{p.handle}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageSelect}
      />

      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-border">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Post type — the inline types, one selected, morphing the box. */}
          <button
            type="button"
            onClick={() => setIsAnnouncement(false)}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              !isAnnouncement ? 'bg-primary-bg text-primary-strong' : 'text-subtle hover:text-muted hover:bg-surface-elevated'
            }`}
            title="A regular post"
          >
            <PenLine className="w-3.5 h-3.5" />
            Post
          </button>
          {canAnnounce && (
            <button
              type="button"
              onClick={() => setIsAnnouncement(true)}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                isAnnouncement ? 'bg-warning-bg text-warning' : 'text-subtle hover:text-muted hover:bg-surface-elevated'
              }`}
              title="Dispatch: send an announcement to your group"
            >
              <Megaphone className="w-3.5 h-3.5" />
              Dispatch
            </button>
          )}

          {/* Attach image */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
            className={`inline-flex items-center rounded-lg p-1.5 transition-colors ${
              imageFile ? 'bg-primary-bg text-primary-strong' : 'text-subtle hover:text-muted hover:bg-surface-elevated'
            } disabled:opacity-40`}
            title="Attach image"
          >
            <ImagePlus className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={submit}
          disabled={(!body.trim() && !imageFile) || isPending}
          className="shrink-0 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Posting…' : isAnnouncement ? 'Announce' : 'Post'}
        </button>
      </div>
    </div>
  )
}
