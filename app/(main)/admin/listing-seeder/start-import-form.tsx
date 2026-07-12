'use client'

// The operator START form (Wave 1). Pick the vertical, paste the copied listing, add optional
// hints and photos; "Seed listing" runs the one-shot extract and routes to the new seed's review
// board. A thin client child — the write goes through the gated server action (startListingIntake),
// then any photos stage onto the created intake (uploadListingImages) before routing.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ClipboardPaste, Home, Tag, ImagePlus, X } from 'lucide-react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/admin/status'
import { cn } from '@/lib/utils'
import { startListingIntake, uploadListingImages } from './actions'
import type { ListingSeedKind } from '@/lib/listing-seeder/types'

const field =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none'
const labelCls = 'flex flex-col gap-1 text-xs font-medium text-muted'

const KINDS: { key: ListingSeedKind; label: string; blurb: string; icon: typeof Tag }[] = [
  { key: 'classifieds', label: 'Classifieds', blurb: 'For sale, free, lend, or wanted.', icon: Tag },
  { key: 'housing', label: 'Housing', blurb: 'A rental or room to fill.', icon: Home },
]

// Kept safely under the server-action body limit so one request never overflows the boundary.
const MAX_UPLOAD_BYTES = 9 * 1024 * 1024

export function StartImportForm() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [kind, setKind] = useState<ListingSeedKind>('classifieds')
  const [pastedText, setPastedText] = useState('')
  const [city, setCity] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [category, setCategory] = useState('')
  const [photos, setPhotos] = useState<File[]>([])

  const previews = photos.map((f) => ({ file: f, url: URL.createObjectURL(f) }))

  function addPhotos(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'))
    setPhotos((prev) => [...prev, ...images].slice(0, 12))
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await startListingIntake({
        kind,
        pastedText: pastedText.trim(),
        hints: {
          city: city.trim() || undefined,
          neighborhood: neighborhood.trim() || undefined,
          category: category.trim() || undefined,
        },
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      // Stage any photos onto the created intake (batched under the body limit), then route.
      const okFiles = photos.filter((f) => f.size <= MAX_UPLOAD_BYTES)
      const batches: File[][] = []
      let batch: File[] = []
      let bytes = 0
      for (const f of okFiles) {
        if (batch.length && bytes + f.size > MAX_UPLOAD_BYTES) {
          batches.push(batch)
          batch = []
          bytes = 0
        }
        batch.push(f)
        bytes += f.size
      }
      if (batch.length) batches.push(batch)
      for (const group of batches) {
        const form = new FormData()
        for (const f of group) form.append('files', f)
        try {
          await uploadListingImages(res.intakeId, form)
        } catch {
          /* a photo that did not land is recoverable on the review board */
        }
      }
      router.push(`/admin/listing-seeder/${res.intakeId}`)
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      {error && (
        <div className="mb-4">
          <Banner tone="critical" title="Could not seed the listing">
            {error}
          </Banner>
        </div>
      )}

      {/* Vertical picker */}
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Vertical</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {KINDS.map((k) => {
          const active = k.key === kind
          const Icon = k.icon
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              aria-pressed={active}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                active
                  ? 'border-primary bg-primary-bg'
                  : 'border-border bg-surface hover:border-border-strong',
              )}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-elevated text-muted">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className={cn('block text-sm font-semibold', active ? 'text-primary-strong' : 'text-text')}>{k.label}</span>
                <span className="block text-2xs text-muted">{k.blurb}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Paste */}
      <label className={`${labelCls} mt-4`}>
        Paste the listing
        <textarea
          className={`${field} min-h-40 resize-y`}
          placeholder="Paste the copied listing here: the title, the description, the price or rent, and how to reach the poster."
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
        />
      </label>

      {/* Hints */}
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-subtle">Hints (optional)</p>
      <p className="mb-2 text-2xs text-muted">A nudge for the extractor when the paste is thin on where or what.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={labelCls}>
          City
          <input className={field} placeholder="Encinitas" value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
        <label className={labelCls}>
          Neighborhood
          <input className={field} placeholder="Leucadia" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
        </label>
        <label className={labelCls}>
          {kind === 'housing' ? 'Property type' : 'Category'}
          <input
            className={field}
            placeholder={kind === 'housing' ? 'Apartment' : 'Furniture'}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </label>
      </div>

      {/* Photos */}
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-subtle">Photos (optional)</p>
      <p className="mb-2 text-2xs text-muted">The first photo is the primary. You can add or reorder more on the next screen.</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {previews.map((p, i) => (
          <div key={p.url} className="group relative aspect-square overflow-hidden rounded-xl border border-border">
            <Image src={p.url} alt="" width={200} height={200} unoptimized className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-2xs font-semibold text-white">
                Primary
              </span>
            )}
            <button
              type="button"
              onClick={() => setPhotos((prev) => prev.filter((f) => f !== p.file))}
              aria-label="Remove photo"
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-black/80 focus:opacity-100 group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-2xs text-muted transition-colors hover:border-border-strong hover:text-text"
        >
          <ImagePlus className="h-5 w-5" aria-hidden />
          Add
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) addPhotos(files)
          e.target.value = ''
        }}
      />

      <div className="mt-5 flex justify-end">
        <Button onClick={submit} disabled={pending || !pastedText.trim()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />}
          {pending ? 'Seeding…' : 'Seed listing'}
        </Button>
      </div>
    </div>
  )
}
