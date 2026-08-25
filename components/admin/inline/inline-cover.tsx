'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { ImagePlus, X, Loader2 } from 'lucide-react'
import { useEditMode } from '@/lib/admin/use-edit-mode'
import { LoomPicker } from '@/components/loom/loom-picker'

// Inline cover-image editor for the tuning layer (ADR-138). Out of Edit Mode it
// just shows the cover (or nothing). In Edit Mode — and only for someone who can
// edit (`canEdit`) — it adds Add / Change / Remove. Picking opens the ONE Loom
// picker (owner directive: no file dialog anywhere), and `setUrl` persists the
// chosen URL, re-checking the capability server-side. A non-manager who URL-hacks
// `?edit=1` never sees the controls (canEdit is server-derived), and the actions
// reject them anyway.
export function InlineCover({
  value,
  alt,
  canEdit = false,
  setUrl,
  remove,
  forceEdit = false,
  onChange,
}: {
  value: string | null
  alt: string
  canEdit?: boolean
  /** The Change/Add controls open the Loom picker; the chosen URL is persisted through this action,
   *  which validates it and writes the column (re-checking the capability server-side). Without it the
   *  cover is read-only: there is deliberately no file-upload fallback. */
  setUrl?: (url: string) => Promise<{ error: string } | void>
  remove?: () => Promise<void>
  /** Show the edit controls without requiring page Edit Mode — for surfaces that
   *  are themselves an explicit editor (e.g. the Settings panel hero). */
  forceEdit?: boolean
  /** Optional notify-up after a successful pick (the new URL) or remove (null) — for a parent
   *  form that ALSO persists the URL on its own Save and needs to track the latest value. */
  onChange?: (url: string | null) => void
}) {
  const { editing } = useEditMode()
  const showEdit = (editing || forceEdit) && canEdit
  const [url, setLocalUrl] = useState(value)
  const [err, setErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [pickerOpen, setPickerOpen] = useState(false)

  // ONE way in: the Loom picker.
  const openSource = () => setPickerOpen(true)

  if (!url && !showEdit) return null

  // Both writers can FAIL TWO WAYS and only one of them was read. `setUrl` returns `{ error }`
  // for a rejected value, but the cover actions (removeCircleCover, removeChannelCover,
  // removePageHero, removePracticeCover) signal an unauthorized caller or a failed write by
  // THROWING — and a throw inside a transition callback is an unhandled rejection, not a message.
  // `onRemove` in particular awaited a `Promise<void>` and then cleared the preview regardless, so
  // a refused delete looked like a successful one until the next load. Both paths now catch.
  function onPick(picked: string) {
    if (!setUrl) return
    setErr(null)
    startTransition(async () => {
      try {
        const res = await setUrl(picked)
        if (res && 'error' in res) { setErr(res.error); return }
        setLocalUrl(picked)
        onChange?.(picked)
      } catch {
        setErr('Could not save that image. Try again.')
      }
    })
  }

  function onRemove() {
    if (!remove) return
    setErr(null)
    startTransition(async () => {
      try {
        await remove()
      } catch {
        setErr('Could not remove the cover. Try again.')
        return
      }
      setLocalUrl(null)
      onChange?.(null)
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
          onClick={openSource}
          disabled={pending || !setUrl}
          className="flex h-40 w-full items-center justify-center gap-2 text-body-sm text-muted transition-colors hover:text-text disabled:opacity-50 sm:h-52"
        >
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          Add a cover image
        </button>
      )}

      {showEdit && url && (
        <div className="absolute right-2 top-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={openSource}
            disabled={pending || !setUrl}
            className="inline-flex items-center gap-1 rounded-lg bg-surface/90 px-2.5 py-1 text-meta font-medium text-text lift-1 backdrop-blur transition-colors hover:bg-surface disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            Change
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={pending}
            aria-label="Remove cover"
            className="inline-flex items-center rounded-lg bg-surface/90 px-2 py-1 text-meta text-muted lift-1 backdrop-blur transition-colors hover:text-danger disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {setUrl && (
        <LoomPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={onPick}
          title="Choose a cover image"
          kinds={['image']}
        />
      )}
      {err && <p className="px-3 py-1.5 text-meta text-danger">{err}</p>}
    </div>
  )
}
