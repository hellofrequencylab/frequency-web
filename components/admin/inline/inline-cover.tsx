'use client'

import { useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { ImagePlus, X, Loader2 } from 'lucide-react'
import { useEditMode } from '@/lib/admin/use-edit-mode'

// Inline cover-image editor for the tuning layer (ADR-138). Out of Edit Mode it
// just shows the cover (or nothing). In Edit Mode — and only for someone who can
// edit (`canEdit`) — it adds Upload / Change / Remove; the upload action stores the
// file and persists the URL, re-checking the capability server-side. A non-manager
// who URL-hacks `?edit=1` never sees the controls (canEdit is server-derived), and
// the actions reject them anyway.
export function InlineCover({
  value,
  alt,
  canEdit = false,
  upload,
  remove,
  forceEdit = false,
}: {
  value: string | null
  alt: string
  canEdit?: boolean
  upload?: (fd: FormData) => Promise<{ url: string } | { error: string }>
  remove?: () => Promise<void>
  /** Show the edit controls without requiring page Edit Mode — for surfaces that
   *  are themselves an explicit editor (e.g. the Settings panel hero). */
  forceEdit?: boolean
}) {
  const { editing } = useEditMode()
  const showEdit = (editing || forceEdit) && canEdit
  const [url, setUrl] = useState(value)
  const [err, setErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  if (!url && !showEdit) return null

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !upload) return
    const fd = new FormData()
    fd.set('file', file)
    setErr(null)
    startTransition(async () => {
      const res = await upload(fd)
      if ('error' in res) setErr(res.error)
      else setUrl(res.url)
    })
  }

  function onRemove() {
    if (!remove) return
    startTransition(async () => {
      await remove()
      setUrl(null)
    })
  }

  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl border border-border bg-surface-elevated">
      {url ? (
        <div className="relative h-40 w-full sm:h-52">
          <Image src={url} alt={alt} fill sizes="100vw" className="object-cover" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={pending}
          className="flex h-40 w-full items-center justify-center gap-2 text-sm text-muted transition-colors hover:text-text disabled:opacity-50 sm:h-52"
        >
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          Add a cover image
        </button>
      )}

      {showEdit && url && (
        <div className="absolute right-2 top-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-lg bg-surface/90 px-2.5 py-1 text-xs font-medium text-text shadow-sm backdrop-blur transition-colors hover:bg-surface disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            Change
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={pending}
            aria-label="Remove cover"
            className="inline-flex items-center rounded-lg bg-surface/90 px-2 py-1 text-xs text-muted shadow-sm backdrop-blur transition-colors hover:text-danger disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {showEdit && <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />}
      {err && <p className="px-3 py-1.5 text-xs text-danger">{err}</p>}
    </div>
  )
}
