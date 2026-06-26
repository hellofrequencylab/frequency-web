'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import { CalendarDays, Home, MapPin, ShieldCheck, Users } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { previewImport } from './actions'
import type { ClassifiedItem, ImportPreview } from '@/lib/whatsapp/types'

// The dry-run console. Reads the exported chat .txt plus (for a media-included export)
// its image files, runs the read-only previewImport action, and renders what the
// importer found — each event/housing item shown with the photos posted alongside it.
// Images stay in the browser (object URLs); nothing is uploaded and nothing is saved.

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'
const MAX_RENDER = 150 // cap the rendered list so a huge export stays responsive
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif)$/i

type ImageMap = Map<string, File> // filename → the operator's selected image file

export function ImportClient() {
  const [text, setText] = useState('')
  const [pick, setPick] = useState<{ chat: string | null; photos: number } | null>(null)
  const [images, setImages] = useState<ImageMap>(new Map())
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setError(null)

    // The chat is the .txt (prefer WhatsApp's `_chat.txt`); the rest are media.
    const txts = files.filter((f) => f.name.toLowerCase().endsWith('.txt'))
    const chat = txts.find((f) => f.name.toLowerCase() === '_chat.txt') ?? txts[0] ?? null
    const photos = files.filter((f) => IMAGE_EXT.test(f.name) || f.type.startsWith('image/'))

    // Keep the File objects; each thumbnail mints + revokes its own object URL on
    // render (see Thumb), so a URL string is never threaded through state.
    const map: ImageMap = new Map(photos.map((f) => [f.name, f]))
    setImages(map)

    try {
      setText(chat ? await chat.text() : '')
    } catch {
      setError('Could not read the chat file. Try pasting the chat text instead.')
    }
    setPick({ chat: chat?.name ?? null, photos: photos.length })
  }

  function run() {
    setError(null)
    setPreview(null)
    startTransition(async () => {
      try {
        setPreview(await previewImport(text))
      } catch {
        setError('The dry run could not finish. Try a smaller export or check back in a bit.')
      }
    })
  }

  const listings = preview?.items.filter((it) => it.category !== 'other') ?? []

  return (
    <div className="space-y-5">
      {/* Safety banner — this surface never writes. */}
      <div className="flex items-start gap-2 rounded-xl border border-border bg-surface-elevated/60 p-3 text-sm text-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          Dry run. Nothing here is saved or posted, and your photos stay in this browser. You are
          reading what the importer found, so you can trust it before anything goes live. Phone
          numbers and emails in housing posts are held back until a listing is claimed.
        </p>
      </div>

      {/* How to get the files. */}
      <details className="rounded-xl border border-border bg-surface p-3 text-sm text-muted">
        <summary className="cursor-pointer font-medium text-text">How to export with photos</summary>
        <p className="mt-2">
          In WhatsApp, open the group, tap its name, and choose Export chat. Pick{' '}
          <span className="font-medium text-text">Attach Media</span> (iOS) or{' '}
          <span className="font-medium text-text">Include media</span> (Android). It downloads a .zip.
          Unzip it, then select the <span className="font-medium text-text">_chat.txt</span> and the
          photos together below. For text only, skip the media and just upload or paste the .txt.
        </p>
      </details>

      {/* Input: upload (chat + photos) or paste. */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className={`${buttonClasses('secondary', 'sm')} cursor-pointer`}>
            <input
              type="file"
              accept=".txt,text/plain,image/*"
              multiple
              className="hidden"
              onChange={onFiles}
            />
            Choose chat + photos
          </label>
          {pick && (
            <span className="text-sm text-subtle">
              {pick.chat ?? 'no .txt found'}
              {pick.photos > 0 ? ` + ${pick.photos} photo${pick.photos > 1 ? 's' : ''}` : ''}
            </span>
          )}
        </div>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setPick(null)
          }}
          rows={5}
          maxLength={4_000_000}
          className={FIELD}
          placeholder="…or paste the exported chat text here (text only, no photos)."
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={pending || text.trim().length === 0}
            className={`${buttonClasses('primary', 'md')} disabled:opacity-50`}
          >
            {pending ? 'Reading the chat…' : 'Run dry run'}
          </button>
          {text.trim().length > 0 && (
            <span className="text-xs text-subtle">{text.length.toLocaleString()} characters</span>
          )}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      {preview && <PreviewResult preview={preview} listings={listings} images={images} />}
    </div>
  )
}

function PreviewResult({
  preview,
  listings,
  images,
}: {
  preview: ImportPreview
  listings: ClassifiedItem[]
  images: ImageMap
}) {
  const { parse, counts, aiSkipped, truncated } = preview

  return (
    <div className="space-y-4 border-t border-border pt-5">
      {/* Parse summary — so the operator trusts the read before judging the items. */}
      <div className="flex flex-wrap gap-2 text-xs text-muted">
        <Stat label="format" value={parse.format} />
        <Stat label="messages" value={parse.stats.total.toLocaleString()} />
        <Stat label="from people" value={parse.stats.authored.toLocaleString()} />
        <Stat label="system" value={parse.stats.system.toLocaleString()} />
        <Stat label="attachments" value={parse.stats.attachmentOnly.toLocaleString()} />
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Count label="Events" value={counts.event} />
        <Count label="Housing" value={counts.housing} />
        <Count label="Roommates" value={counts.roommate} />
      </div>

      {aiSkipped && (
        <p className="rounded-xl border border-border bg-surface-elevated/60 p-3 text-sm text-muted">
          AI is off or over the daily budget, so this shows the parsed chat only. Turn AI on (or wait
          for the daily cap to reset) to classify events and listings.
        </p>
      )}
      {truncated && (
        <p className="text-sm text-subtle">
          This export is large. The first batch of messages was processed. Run it again on a smaller
          slice to cover the rest.
        </p>
      )}

      {!aiSkipped && listings.length === 0 && (
        <p className="text-sm text-muted">No events or listings stood out in this export.</p>
      )}

      <div className="space-y-3">
        {listings.slice(0, MAX_RENDER).map((item, i) => (
          <ItemCard key={`${item.refs.join('-')}-${i}`} item={item} images={images} />
        ))}
        {listings.length > MAX_RENDER && (
          <p className="text-sm text-subtle">
            Showing the first {MAX_RENDER} of {listings.length}. The rest are included in the counts
            above.
          </p>
        )}
      </div>
    </div>
  )
}

function ItemCard({ item, images }: { item: ClassifiedItem; images: ImageMap }) {
  const isEvent = item.category === 'event'
  const Icon = isEvent ? CalendarDays : item.category === 'roommate' ? Users : Home
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium capitalize text-muted">
          {item.category}
        </span>
        {item.confidence === 'low' && (
          <span className="text-xs text-subtle">⚠️ low confidence</span>
        )}
        <span className="ml-auto text-xs text-subtle">
          from message{item.refs.length > 1 ? 's' : ''} {item.refs.join(', ')}
        </span>
      </div>

      {isEvent && item.event ? <EventBody item={item} /> : <HousingBody item={item} />}

      <Thumbnails names={item.imageNames} images={images} />

      {item.note && <p className="mt-2 text-sm text-muted">{item.note}</p>}
    </div>
  )
}

function Thumbnails({ names, images }: { names: string[]; images: ImageMap }) {
  if (names.length === 0) return null
  const files = names.map((n) => images.get(n)).filter((f): f is File => !!f)
  const missing = names.length - files.length
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {files.slice(0, 6).map((file, i) => (
        <Thumb key={`${file.name}-${i}`} file={file} />
      ))}
      {files.length === 0 ? (
        <span className="text-xs text-subtle">
          {names.length} photo{names.length > 1 ? 's' : ''} posted with this (select the media to see them)
        </span>
      ) : (
        missing > 0 && <span className="text-xs text-subtle">+{missing} not selected</span>
      )}
    </div>
  )
}

// One thumbnail. Mints an object URL from the operator's OWN selected File and
// revokes it on unmount (mirrors the poster-scan creator). The src is therefore a
// local blob: URL we just created, never a string derived from the chat text.
function Thumb({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-16 w-16 rounded-lg border border-border object-cover" />
  )
}

function EventBody({ item }: { item: ClassifiedItem }) {
  const ev = item.event!
  return (
    <div className="mt-2 space-y-1">
      <p className="text-base font-bold text-text">{ev.title || 'Untitled event'}</p>
      {ev.description && <p className="text-sm text-text">{ev.description}</p>}
      <div className="mt-1 space-y-1 text-sm text-muted">
        {ev.startsAt && (
          <p className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-subtle" />
            {formatWhen(ev.startsAt)}
          </p>
        )}
        {ev.location && (
          <p className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-subtle" />
            {ev.location}
          </p>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-subtle">
        <span>{ev.isFree ? 'Free' : ev.priceCents != null ? `$${(ev.priceCents / 100).toFixed(0)}` : 'Price not stated'}</span>
        {ev.domain && <span className="capitalize">{ev.domain}</span>}
        {ev.organizerName && <span>by {ev.organizerName}</span>}
        {ev.tags.length > 0 && <span>{ev.tags.slice(0, 6).join(' · ')}</span>}
      </div>
    </div>
  )
}

function HousingBody({ item }: { item: ClassifiedItem }) {
  const h = item.housing
  if (!h) return null
  const bits = [
    h.roomType ? h.roomType.replace('_', ' ') : null,
    h.bedrooms ? `${h.bedrooms} bed` : null,
    h.rentCents != null ? `$${(h.rentCents / 100).toFixed(0)}/mo` : null,
    [h.neighborhood, h.city].filter(Boolean).join(', ') || null,
    h.availableFrom ? `from ${h.availableFrom}` : null,
  ].filter(Boolean) as string[]
  return (
    <div className="mt-2 space-y-1">
      <p className="text-base font-bold text-text">{h.title || 'Untitled listing'}</p>
      {h.description && <p className="text-sm text-text">{h.description}</p>}
      {bits.length > 0 && (
        <p className="mt-1 text-xs text-subtle">{bits.join(' · ')}</p>
      )}
      {h.contacts.length > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-subtle">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          {h.contacts.length} contact{h.contacts.length > 1 ? 's' : ''} held back until claimed
        </p>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md bg-surface-elevated px-2 py-1">
      {label}: <span className="font-medium text-text">{value}</span>
    </span>
  )
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-lg border border-border bg-surface px-3 py-1.5 font-medium text-text">
      {value} {label}
    </span>
  )
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
