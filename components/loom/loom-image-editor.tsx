'use client'

// The Loom image editor: crop + rotate, native (HYG-109, ADR-1506).
//
// Owner ruling 2026-09-21: build this on the Canvas 2D API rather than adopt Filerobot. The July
// pick was made before anyone measured what it installs (~6.8 MB across seven packages, two pinned
// at 3.0.0-beta.10, styled-components as a second styling runtime beside Tailwind 4, and a
// third-party design system arriving transitively). Zero new dependencies here.
//
// Composed from the kit, not beside it: the crop is `components/ui/image-cropper.tsx` (the same
// pointer-driven crop the email studio already ships, now told which mime to keep), the frames are
// lib/library/renditions.ts CROP_FRAMES (finally given the editor consumer they were staged for),
// rotate is components/loom/rotate-image.ts, and the shell is `Dialog`. Every control carries an
// accessible name and is reachable by keyboard; tokens only, no hex.
//
// SAVE PATH. The produced File goes through the SAME action a "Replace file" uses
// (replaceLibraryAssetFile → recordVersion first, then the swap in the same bucket), so an edit is
// one more library_versions row with is_current, rollback-able like a Recraft op or a Vera save.
// The asset id, and therefore every reference to it, never changes (ADR-1130): the row's url is
// the new master, never a rendition.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, RotateCw } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { ImageCropper } from '@/components/ui/image-cropper'
import { Input } from '@/components/ui/field'
import { CROP_FRAMES } from '@/lib/library/renditions'
import {
  STRAIGHTEN_LIMIT,
  normalizeDegrees,
  readImageSize,
  rotateImageToObjectUrl,
  type RotationBaker,
} from './rotate-image'

export type LoomEditableAsset = {
  id: string
  url: string
  mime: string | null
  slug: string
  title: string
}

export type SaveEditedImage = (
  assetId: string,
  formData: FormData,
) => Promise<{ ok: true; url: string } | { error: string }>

type FrameKey = (typeof CROP_FRAMES)[number]['key']

function outputTypeFor(mime: string | null): 'image/jpeg' | 'image/png' | 'image/webp' {
  return mime === 'image/png' || mime === 'image/webp' ? mime : 'image/jpeg'
}

export function LoomImageEditor({
  asset,
  open,
  onClose,
  onSaved,
  save,
  bake = rotateImageToObjectUrl,
}: {
  asset: LoomEditableAsset
  open: boolean
  onClose: () => void
  /** Called with the new master url after a successful save. */
  onSaved: (url: string) => void
  /** The server action that versions then swaps the file (edit-actions.saveEditedImage). */
  save: SaveEditedImage
  /** The rotate seam; tests hand in a fake so the loading / error states run without a canvas. */
  bake?: RotationBaker
}) {
  const [frame, setFrame] = useState<FrameKey>('free')
  const [quarterTurns, setQuarterTurns] = useState(0)
  const [straighten, setStraighten] = useState(0)
  // The bake outcome is keyed by the angle it was baked for, so "loading" and "error" are DERIVED
  // from whether the outcome matches the current angle; the effect below only writes state from
  // the baker's callbacks, never synchronously.
  const [baked, setBaked] = useState<{ degrees: number; src: string } | null>(null)
  const [bakeError, setBakeError] = useState<{ degrees: number; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const revokeRef = useRef<() => void>(() => {})

  const degrees = normalizeDegrees(quarterTurns * 90 + straighten)
  const aspect = useMemo(() => CROP_FRAMES.find((f) => f.key === frame)?.ratio ?? null, [frame])

  // Re-bake whenever the angle changes. 0° is the master itself (the baker short-circuits), so
  // opening the editor costs no canvas work until the operator actually rotates.
  useEffect(() => {
    if (!open) return
    let live = true
    bake(asset.url, degrees, asset.mime)
      .then((out) => {
        if (!live) {
          out.revoke()
          return
        }
        revokeRef.current()
        revokeRef.current = out.revoke
        setBaked({ degrees, src: out.src })
      })
      .catch(() => {
        if (live)
          setBakeError({
            degrees,
            message: 'That image could not be rotated here. Try a smaller image, or crop without rotating.',
          })
      })
    return () => {
      live = false
    }
  }, [open, asset.url, asset.mime, degrees, bake])

  // Release the last object URL on unmount.
  useEffect(() => () => revokeRef.current(), [])

  const src = baked && baked.degrees === degrees ? baked.src : null
  const errorMessage = bakeError && bakeError.degrees === degrees ? bakeError.message : null
  const baking = !src && !errorMessage
  const busy = baking || saving

  const onCropped = useCallback(
    async (file: File) => {
      setSaving(true)
      setSaveError(null)
      try {
        const fd = new FormData()
        fd.append('file', file)
        const size = await readImageSize(file)
        if (size) {
          fd.append('width', String(size.width))
          fd.append('height', String(size.height))
        }
        fd.append('frame', frame)
        fd.append('degrees', String(degrees))
        const res = await save(asset.id, fd)
        if ('error' in res) {
          setSaveError(res.error)
          return
        }
        onSaved(res.url)
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Could not save the edit. Try again.')
      } finally {
        setSaving(false)
      }
    },
    [asset.id, degrees, frame, onSaved, save],
  )

  return (
    <Dialog open={open} onClose={onClose} ariaLabelledBy="loom-image-editor-title" align="center" className="max-w-2xl">
      <div className="space-y-4 p-5" aria-busy={busy || undefined}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="loom-image-editor-title" className="font-display text-body-lg uppercase text-text">
              Edit image
            </h2>
            <p className="text-meta text-muted">
              {asset.title}. Saving keeps the asset id, so every page using it follows the new file; the previous
              file is kept as a version.
            </p>
          </div>
        </div>

        {/* Frames: the CROP_FRAMES presets, as a toggle group. */}
        <div role="group" aria-label="Crop frame" className="flex flex-wrap gap-2">
          {CROP_FRAMES.map((f) => (
            <Button
              key={f.key}
              type="button"
              size="sm"
              variant={frame === f.key ? 'primary' : 'secondary'}
              aria-pressed={frame === f.key}
              disabled={busy}
              onClick={() => setFrame(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {/* Rotate: quarter turns plus a straighten slider. */}
        <div className="flex flex-wrap items-center gap-3">
          <IconButton
            label="Rotate left"
            variant="bordered"
            disabled={busy}
            onClick={() => setQuarterTurns((q) => q - 1)}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
          </IconButton>
          <IconButton
            label="Rotate right"
            variant="bordered"
            disabled={busy}
            onClick={() => setQuarterTurns((q) => q + 1)}
          >
            <RotateCw className="h-4 w-4" aria-hidden />
          </IconButton>
          <label className="flex min-w-48 flex-1 items-center gap-2 text-meta text-muted">
            <span className="shrink-0">Straighten</span>
            <Input
              type="range"
              variant="seamless"
              min={-STRAIGHTEN_LIMIT}
              max={STRAIGHTEN_LIMIT}
              step={1}
              value={straighten}
              disabled={busy}
              aria-label="Straighten"
              aria-valuetext={`${straighten} degrees`}
              onChange={(e) => setStraighten(Number(e.target.value))}
              className="w-full px-0 py-0 accent-primary"
            />
            <span className="w-10 shrink-0 text-right tabular-nums">{straighten}°</span>
          </label>
          <span className="text-meta text-subtle" aria-live="polite">
            {degrees === 0 ? 'No rotation' : `${degrees}° total`}
          </span>
        </div>

        {errorMessage ? (
          <p role="alert" className="rounded-card border border-danger/40 bg-danger/10 px-3 py-2 text-body-sm text-danger">
            {errorMessage}
          </p>
        ) : !src ? (
          <div className="flex min-h-40 items-center justify-center rounded-card border border-border bg-surface-elevated p-6">
            <p className="text-body-sm text-muted">{degrees === 0 ? 'Loading image…' : 'Rotating…'}</p>
          </div>
        ) : (
          <ImageCropper
            src={src}
            aspect={aspect ?? undefined}
            fileName={asset.slug || 'edit'}
            outputType={outputTypeFor(asset.mime)}
            onCancel={onClose}
            onCropped={onCropped}
          />
        )}

        {saving && (
          <p className="text-meta text-muted" aria-live="polite">
            Saving the new master…
          </p>
        )}
        {saveError && (
          <p role="alert" className="text-body-sm text-danger">
            {saveError}
          </p>
        )}

        {(errorMessage || !src) && (
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Close
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  )
}
