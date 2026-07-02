'use client'

import { useState, useTransition, useRef, useEffect, useCallback, type ReactNode } from 'react'
import Image from 'next/image'
import { Megaphone, ImagePlus, X, PenLine, Bold, Italic, List, Link2, Maximize2, Minimize2, ChevronDown, ChevronUp, Camera } from 'lucide-react'
import { createPost } from '@/app/(main)/feed/actions'
import { isError } from '@/lib/action-result'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import { EmojiPicker } from './emoji-picker'
import { ComposeLightbox } from './compose-lightbox'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB (post-downscale; raw camera shots are downscaled first)
const MAX_IMAGE_DIM = 2048 // longest edge after downscale

// Downscale + re-encode a chosen image to a sane size BEFORE we hold it in memory or upload it.
// Phone camera photos are routinely 5–12 MB and high-resolution — too big for the 5 MB cap (so the
// upload silently failed) and a big memory hog that makes iOS reload the page after the camera (the
// "I took a photo and the box vanished" bug). Best-effort: any decode/encode failure returns the
// original file so a normal upload still proceeds.
async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file)
    const longest = Math.max(bitmap.width, bitmap.height)
    const scale = Math.min(1, MAX_IMAGE_DIM / longest)
    // Already small in both dimensions AND bytes → keep the original (no needless re-encode).
    if (scale === 1 && file.size <= MAX_IMAGE_BYTES) {
      bitmap.close?.()
      return file
    }
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close?.()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) return file
    const name = file.name.replace(/\.[^.]+$/, '') || 'photo'
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

type HandleResult = { id: string; handle: string; display_name: string; avatar_url: string | null }

// A small, consistent toolbar button. One look for every embedded control so the
// formatting row reads as one designed cluster, not a pile of mismatched icons.
function Tool({
  onClick,
  label,
  active = false,
  disabled = false,
  children,
}: {
  onClick: () => void
  label: string
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep the caret in the textarea
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex items-center rounded-lg p-1.5 transition-colors disabled:opacity-40 ${
        active ? 'bg-primary-bg text-primary-strong' : 'text-subtle hover:bg-surface-elevated hover:text-muted'
      }`}
    >
      {children}
    </button>
  )
}

export function Composer({
  scopeId,
  visibility = 'group',
  placeholder = 'Share something with your group…',
  canAnnounce = false,
  kind = 'post',
  autoImage = false,
  submitLabel,
  topSlot,
  bottomSlot,
  forceAnnouncement,
  compactTools = true,
}: {
  scopeId: string
  visibility?: 'public' | 'region' | 'cluster' | 'group'
  placeholder?: string
  canAnnounce?: boolean
  /** Capture mode (ADR-156): a 'note' submits post_type='note' — a quiet journal entry. */
  kind?: 'post' | 'note'
  /** Open the image picker on mount (the Capture "Photo" mode). */
  autoImage?: boolean
  /** Override the send-button label (Capture box uses "Capture"). */
  submitLabel?: string
  /** Rendered inside the box at the top. */
  topSlot?: ReactNode
  /** Replaces the Post/Dispatch toggle in the bottom row (Capture's feature row). */
  bottomSlot?: ReactNode
  /** When `bottomSlot` is set, force announcement on/off (the Dispatch feature). */
  forceAnnouncement?: boolean
  /** Tuck the formatting cluster behind a small "Format" toggle below the
   *  divider (default everywhere — writing stays front and center). */
  compactTools?: boolean
}) {
  const [body, setBody] = useState('')
  // Capture remounts the composer per feature (key=mode), so the Dispatch feature's
  // `forceAnnouncement` seeds the initial state — no effect needed.
  const [isAnnouncement, setIsAnnouncement] = useState(!!forceAnnouncement)
  const [isPending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(!compactTools)
  const [manualHeight, setManualHeight] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Image upload state. TWO inputs back one photo control: a camera input
  // (capture='environment', force-opens the rear camera on mobile) and a library
  // input. On a touch device the photo control offers a quick "Take photo / Upload"
  // choice so the camera reliably opens; a desktop pointer goes straight to library.
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageError, setImageError] = useState('')
  const [postError, setPostError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false)

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState<number>(0)
  const [suggestions, setSuggestions] = useState<HandleResult[]>([])
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Grow to fit what's typed (capped), unless the user has dragged a fixed height.
  // The lightbox gets a much taller ceiling so it actually feels distraction-free.
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    if (manualHeight != null) {
      ta.style.height = `${manualHeight}px`
      return
    }
    ta.style.height = 'auto'
    const max = expanded ? 600 : 220
    ta.style.height = `${Math.min(ta.scrollHeight, max)}px`
  }, [body, manualHeight, expanded])

  // One photo entry point. On a touch device, offer a quick choice (Take photo
  // opens the camera, Upload opens the library); on a desktop pointer there's no
  // camera, so go straight to the library picker.
  const openPhotoPicker = useCallback(() => {
    const coarse =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches
    if (coarse) setPhotoSheetOpen(true)
    else fileInputRef.current?.click()
  }, [])

  // Capture "Photo" mode: pop the photo picker as soon as the composer mounts.
  // Deferred a tick so the open isn't a synchronous setState inside the effect.
  useEffect(() => {
    if (!autoImage) return
    const t = setTimeout(() => openPhotoPicker(), 0)
    return () => clearTimeout(t)
  }, [autoImage, openPhotoPicker])

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Clear the input now so re-selecting the SAME photo still fires onChange (and so a stale
    // selection can't linger if this rejects below).
    e.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setImageError('Only image files are allowed.')
      return
    }

    setImageError('')
    // Downscale big camera shots so they fit the cap (and don't blow up memory). Best-effort.
    const processed = await downscaleImage(file)
    if (processed.size > MAX_IMAGE_BYTES) {
      setImageError(`That image is too large (${(processed.size / 1024 / 1024).toFixed(1)} MB). Try a smaller one.`)
      return
    }

    setImageFile(processed)
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(processed)
    })
  }

  function removeImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImagePreview(null)
    setImageError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
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

    setPostError('')
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
      fd.set('post_type', isAnnouncement ? 'announcement' : kind === 'note' ? 'note' : 'feed')
      if (imageUrl) fd.set('imageUrl', imageUrl)

      // Keep the composed text (and image) if the write failed, so nothing is lost.
      const res = await createPost(fd)
      if (res && isError(res)) {
        setPostError(res.error)
        return
      }

      setBody('')
      setIsAnnouncement(false)
      setManualHeight(null)
      setExpanded(false)
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

  // ── Formatting helpers — light markdown the feed renderer understands. ──────
  function surround(prefix: string, suffix: string, placeholder: string) {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart ?? body.length
    const end = ta.selectionEnd ?? body.length
    const selected = body.slice(start, end) || placeholder
    const next = body.slice(0, start) + prefix + selected + suffix + body.slice(end)
    setBody(next)
    requestAnimationFrame(() => {
      ta.focus()
      const a = start + prefix.length
      ta.setSelectionRange(a, a + selected.length)
    })
  }

  function toggleList() {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart ?? 0
    const end = ta.selectionEnd ?? 0
    const lineStart = body.lastIndexOf('\n', start - 1) + 1
    const lineEndIdx = body.indexOf('\n', end)
    const lineEnd = lineEndIdx === -1 ? body.length : lineEndIdx
    const lines = body.slice(lineStart, lineEnd).split('\n')
    const allBulleted = lines.every((l) => l.trim() === '' || /^- /.test(l))
    const next = lines
      .map((l) => (l.trim() === '' ? l : allBulleted ? l.replace(/^- /, '') : `- ${l}`))
      .join('\n')
    setBody(body.slice(0, lineStart) + next + body.slice(lineEnd))
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(lineStart, lineStart + next.length)
    })
  }

  function insertText(text: string) {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart ?? body.length
    const end = ta.selectionEnd ?? body.length
    setBody(body.slice(0, start) + text + body.slice(end))
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + text.length
      ta.setSelectionRange(pos, pos)
    })
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
    // Quick bold / italic, like every editor people already know.
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'b') { e.preventDefault(); surround('**', '**', 'bold text'); return }
      if (e.key === 'i') { e.preventDefault(); surround('*', '*', 'italic text'); return }
      if (e.key === 'Enter') { submit(); return }
    }
  }

  // Drag the corner grip to set a fixed height; clearing it returns to auto-grow.
  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    const ta = textareaRef.current
    if (!ta) return
    const startY = e.clientY
    const startH = ta.offsetHeight
    function onMove(ev: PointerEvent) {
      setManualHeight(Math.max(64, startH + (ev.clientY - startY)))
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function toggleExpand() {
    setManualHeight(null)
    setExpanded((v) => !v)
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside() { setSuggestions([]); setMentionQuery(null) }
    if (suggestions.length > 0) document.addEventListener('click', handleOutside)
    return () => document.removeEventListener('click', handleOutside)
  }, [suggestions.length])

  const canPost = (!!body.trim() || !!imageFile) && !isPending

  // ── The editor body — rendered the same inline or inside the lightbox. ──────
  const editor = (
    <div
      data-tour-anchor="composer"
      className={`relative bg-surface transition-shadow ${
        expanded
          ? 'rounded-3xl border border-border p-5 shadow-2xl'
          : 'rounded-2xl p-4 shadow-md focus-within:shadow-lg'
      }`}
    >
      {expanded && (
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-muted">Compose</p>
          <Tool onClick={toggleExpand} label="Exit full screen">
            <Minimize2 className="h-4 w-4" />
          </Tool>
        </div>
      )}

      {topSlot && <div className="-mx-4 mb-3 border-b border-border px-4 pb-3">{topSlot}</div>}

      {/* Text region — soft, roomy, and auto-growing. */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={isAnnouncement ? 'Share an announcement with your group…' : placeholder}
          rows={expanded ? 6 : 3}
          disabled={isPending}
          className={`w-full resize-none bg-transparent leading-relaxed text-text/90 placeholder:text-subtle outline-none focus-visible:shadow-none disabled:opacity-60 ${
            expanded ? 'min-h-[40vh] text-base' : 'min-h-24 text-sm'
          }`}
        />

        {/* Pull handle — drag to resize, only on the inline box. */}
        {!expanded && (
          <button
            type="button"
            onPointerDown={startResize}
            aria-label="Drag to resize"
            title="Drag to resize"
            className="absolute -bottom-1 right-0 cursor-ns-resize p-1 text-border-strong hover:text-muted"
          >
            <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <path d="M9 3 3 9M9 6.5 6.5 9" />
            </svg>
          </button>
        )}

        {/* @mention autocomplete dropdown */}
        {suggestions.length > 0 && mentionQuery !== null && (
          <div
            className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-border bg-surface py-1 shadow-xl shadow-black/5"
            onMouseDown={e => e.preventDefault()}
          >
            {suggestions.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => insertMention(p)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                  i === activeSuggestion ? 'bg-primary-bg' : 'hover:bg-surface-elevated'
                }`}
              >
                {p.avatar_url ? (
                  <Image src={p.avatar_url} alt={p.display_name} width={24} height={24} className="h-6 w-6 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-bg text-3xs font-bold text-primary-strong">
                    {getInitials(p.display_name)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-text">{p.display_name}</p>
                  <p className="truncate text-2xs text-subtle">@{p.handle}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div className="relative mt-3 inline-block">
          {/* Local object-URL preview of the file being uploaded — a transient
              blob: src that the Next image optimizer can't (and shouldn't) touch,
              so a plain <img> is correct here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagePreview} alt="Upload preview" className="max-h-48 rounded-xl border border-border object-cover" />
          <button
            type="button"
            onClick={removeImage}
            className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
            aria-label="Remove image"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {imageError && <p className="mt-1.5 text-xs text-danger">{imageError}</p>}

      {/* Hidden inputs — camera (Take photo, capture='environment' force-opens the
          rear camera on mobile) + library (Upload, any saved image). */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageSelect} />
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />

      {/* Quick photo choice (touch only): Take photo opens the camera, Upload the
          library. A bottom sheet on phones, a centered card on larger touch screens. */}
      {photoSheetOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
          onClick={() => setPhotoSheetOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Add a photo"
        >
          <div
            className="w-full max-w-sm space-y-1 rounded-t-2xl border border-border bg-surface p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => { setPhotoSheetOpen(false); cameraInputRef.current?.click() }}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
            >
              <Camera className="h-5 w-5 text-primary-strong" /> Take photo
            </button>
            <button
              type="button"
              onClick={() => { setPhotoSheetOpen(false); fileInputRef.current?.click() }}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
            >
              <ImagePlus className="h-5 w-5 text-primary-strong" /> Upload from library
            </button>
            <button
              type="button"
              onClick={() => setPhotoSheetOpen(false)}
              className="flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Formatting + media — the writing tools, cleanly clustered. Folded by
          default; the Format toggle lives BELOW the divider (full screen always
          shows the tools). */}
      {(toolsOpen || expanded) && (
      <div className="mt-2 flex items-center gap-0.5">
        <Tool onClick={() => surround('**', '**', 'bold text')} label="Bold (⌘B)" disabled={isPending}>
          <Bold className="h-4 w-4" />
        </Tool>
        <Tool onClick={() => surround('*', '*', 'italic text')} label="Italic (⌘I)" disabled={isPending}>
          <Italic className="h-4 w-4" />
        </Tool>
        <Tool onClick={toggleList} label="Bulleted list" disabled={isPending}>
          <List className="h-4 w-4" />
        </Tool>
        <Tool onClick={() => surround('[', '](https://)', 'link text')} label="Link" disabled={isPending}>
          <Link2 className="h-4 w-4" />
        </Tool>

        <span className="mx-1 h-4 w-px bg-border" />

        <EmojiPicker onSelect={insertText} disabled={isPending} />
        <Tool onClick={openPhotoPicker} label="Add a photo" active={!!imageFile} disabled={isPending}>
          <ImagePlus className="h-4 w-4" />
        </Tool>

        {!expanded && (
          <Tool onClick={toggleExpand} label="Full screen">
            <Maximize2 className="h-4 w-4" />
          </Tool>
        )}

        {compactTools && !expanded && (
          <Tool onClick={() => setToolsOpen(false)} label="Hide formatting">
            <ChevronDown className="h-4 w-4" />
          </Tool>
        )}
      </div>
      )}

      {/* Folded: the Format handle rides the fold line itself — its own slim
          row where the tools unfold, so the feature selector below never gets
          squeezed. */}
      {compactTools && !toolsOpen && !expanded && (
        <div className="mt-1.5">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setToolsOpen(true)}
            aria-expanded={false}
            className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-2xs font-medium text-subtle transition-colors hover:text-text"
          >
            <ChevronUp className="h-3 w-3" /> Format
          </button>
        </div>
      )}

      {/* Settings + send. */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        {bottomSlot != null ? (
          bottomSlot
        ) : canAnnounce && kind !== 'note' ? (
          <div className="inline-flex items-center gap-0.5 rounded-lg bg-surface-elevated p-0.5">
            <button
              type="button"
              onClick={() => setIsAnnouncement(false)}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-2xs font-semibold transition-colors ${
                !isAnnouncement ? 'bg-surface text-primary-strong shadow-sm' : 'text-subtle hover:text-muted'
              }`}
              title="A regular post"
            >
              <PenLine className="h-3.5 w-3.5" />
              Post
            </button>
            <button
              type="button"
              onClick={() => setIsAnnouncement(true)}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-2xs font-semibold transition-colors ${
                isAnnouncement ? 'bg-surface text-warning shadow-sm' : 'text-subtle hover:text-muted'
              }`}
              title="Dispatch: send an announcement to your group"
            >
              <Megaphone className="h-3.5 w-3.5" />
              Dispatch
            </button>
          </div>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2.5">
          <span className="hidden text-2xs text-subtle sm:inline">⌘ + Enter</span>
          <button
            onClick={submit}
            disabled={!canPost}
            className="shrink-0 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending
              ? kind === 'note' ? 'Saving…' : 'Posting…'
              : submitLabel ?? (isAnnouncement ? 'Announce' : kind === 'note' ? 'Save note' : 'Post')}
          </button>
        </div>
      </div>

      {postError && <p className="mt-2 text-xs text-danger">{postError}</p>}
    </div>
  )

  if (expanded) {
    return <ComposeLightbox onClose={toggleExpand}>{editor}</ComposeLightbox>
  }

  return <div className="mb-4">{editor}</div>
}
