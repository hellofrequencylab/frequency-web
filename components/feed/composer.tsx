'use client'

import { useState, useTransition, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { Megaphone, ImagePlus, X, PenLine, Bold, Italic, List, Link2, Maximize2, Minimize2 } from 'lucide-react'
import { createPost } from '@/app/(main)/feed/actions'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import { EmojiPicker } from './emoji-picker'
import { ComposeLightbox } from './compose-lightbox'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

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
}: {
  scopeId: string
  visibility?: 'public' | 'region' | 'cluster' | 'group'
  placeholder?: string
  canAnnounce?: boolean
}) {
  const [body, setBody] = useState('')
  const [isAnnouncement, setIsAnnouncement] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState(false)
  const [manualHeight, setManualHeight] = useState<number | null>(null)
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

      {/* Text region — soft, roomy, and auto-growing. */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={isAnnouncement ? 'Share an announcement with your group…' : placeholder}
          rows={expanded ? 6 : 2}
          disabled={isPending}
          className={`w-full resize-none bg-transparent leading-relaxed text-text/90 placeholder:text-subtle outline-none focus-visible:shadow-none disabled:opacity-60 ${
            expanded ? 'min-h-[40vh] text-base' : 'min-h-16 text-[15px]'
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

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />

      {/* Formatting + media — the writing tools, cleanly clustered. */}
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
        <Tool onClick={() => fileInputRef.current?.click()} label="Attach image" active={!!imageFile} disabled={isPending}>
          <ImagePlus className="h-4 w-4" />
        </Tool>

        {!expanded && (
          <Tool onClick={toggleExpand} label="Full screen">
            <Maximize2 className="h-4 w-4" />
          </Tool>
        )}
      </div>

      {/* Settings + send. */}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-3">
        {canAnnounce ? (
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
            {isPending ? 'Posting…' : isAnnouncement ? 'Announce' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  )

  if (expanded) {
    return <ComposeLightbox onClose={toggleExpand}>{editor}</ComposeLightbox>
  }

  return <div className="mb-4">{editor}</div>
}
