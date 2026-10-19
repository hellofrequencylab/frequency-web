'use client'

// The Event card and Circle card rail editors (EMAIL-025): the Product card's siblings, on the same flow.
// Search a Space, pick it, then pick one of its upcoming events (or live circles). Picking stores a
// data-bound ref plus a snapshot (title / lines / image / link) so the canvas reads at once; the send
// pipeline refreshes the snapshot from the live row so the card never goes stale. Semantic DAWN tokens for
// the app chrome; voice canon (no em dashes).

import { useEffect, useRef, useState, useTransition } from 'react'
import { CalendarDays, Check, Loader2, Search, Store, Users, X } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { Input } from '@/components/ui/field'
import {
  searchPickerSpacesAction,
  listSpaceEventsAction,
  listSpaceCirclesAction,
  type PickerSpace,
  type EventOption,
  type CircleOption,
} from './data-picker-actions'

interface DataRef {
  id: string
  ownerKind?: 'space'
  ownerId?: string
}

function readRef(v: unknown): DataRef | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  return typeof o.id === 'string' && o.id ? { id: o.id } : null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** One picked option, flattened to the snapshot keys the block stores. */
type Option = { id: string; title: string; image: string; url: string; line: string; extra?: Record<string, string> }

interface PickerCopy {
  /** The ref key on the bag (`event` / `circle`). */
  refKey: 'event' | 'circle'
  /** The snapshot keys this card stores besides title / image / url. */
  lineKeys: string[]
  defaultCta: string
  help: string
  emptyOwner: string
  loading: string
  noun: string
  icon: typeof CalendarDays
  list: (spaceId: string) => Promise<Option[] | string>
}

function SpaceItemPicker({
  content,
  onField,
  copy,
}: {
  content: Record<string, unknown>
  onField: (key: string, value: unknown) => void
  copy: PickerCopy
}) {
  const selectedRef = readRef(content[copy.refKey])
  const selectedTitle = str(content.title)
  const selectedImage = str(content.image)
  const selectedLine = copy.lineKeys.map((k) => str(content[k])).filter(Boolean).join(' · ')
  const Icon = copy.icon

  const [query, setQuery] = useState('')
  const [spaces, setSpaces] = useState<PickerSpace[]>([])
  const [space, setSpace] = useState<PickerSpace | null>(null)
  const [options, setOptions] = useState<Option[]>([])
  const [error, setError] = useState<string | null>(null)
  const [searching, startSearch] = useTransition()
  const [loading, startLoad] = useTransition()
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced Space search; a short query never fires and its stale results are hidden by the length guard.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    if (query.trim().length < 2) return
    debounce.current = setTimeout(() => {
      startSearch(async () => {
        const res = await searchPickerSpacesAction(query)
        if (isError(res)) {
          setError(res.error)
          setSpaces([])
        } else {
          setError(null)
          setSpaces(res.data)
        }
      })
    }, 300)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [query])

  function pickSpace(s: PickerSpace) {
    setSpace(s)
    setOptions([])
    startLoad(async () => {
      const res = await copy.list(s.id)
      if (typeof res === 'string') {
        setError(res)
        setOptions([])
      } else {
        setError(null)
        setOptions(res)
      }
    })
  }

  function pickOption(o: Option) {
    const ref: DataRef = { id: o.id, ownerKind: 'space', ownerId: space?.id }
    onField(copy.refKey, ref)
    onField('title', o.title || undefined)
    onField('image', o.image || undefined)
    onField('url', o.url || undefined)
    for (const [k, v] of Object.entries(o.extra ?? {})) onField(k, v || undefined)
    setSpace(null)
    setSpaces([])
    setOptions([])
    setQuery('')
  }

  function clearPick() {
    onField(copy.refKey, undefined)
    onField('title', undefined)
    onField('image', undefined)
    onField('url', undefined)
    for (const k of copy.lineKeys) onField(k, undefined)
  }

  const ctaLabel = str(content.ctaLabel)

  return (
    <div className="space-y-3">
      <p className="text-2xs leading-relaxed text-muted">{copy.help}</p>

      {selectedRef ? (
        <div className="flex items-center gap-2 rounded-control border border-border bg-surface p-2">
          {selectedImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- operator asset URL, not a build asset
            <img src={selectedImage} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-surface-elevated text-subtle">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-meta font-semibold text-text">{selectedTitle || `Selected ${copy.noun}`}</span>
            {selectedLine && <span className="block truncate text-2xs text-muted">{selectedLine}</span>}
          </span>
          <button
            type="button"
            onClick={clearPick}
            aria-label={`Remove this ${copy.noun}`}
            className="shrink-0 rounded p-1 text-subtle transition-colors hover:bg-danger-bg hover:text-danger"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a Space"
              aria-label={`Search a Space to find its ${copy.noun}s`}
              className="!py-1.5 pl-8 pr-8 text-meta"
            />
            {searching && (
              <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-subtle" aria-hidden />
            )}
          </div>

          {!space && query.trim().length >= 2 && spaces.length > 0 && (
            <ul className="space-y-1">
              {spaces.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => pickSpace(s)}
                    className="flex w-full items-center gap-2 rounded-control border border-border bg-surface px-2 py-1.5 text-left transition-colors hover:border-primary"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-surface-elevated text-subtle">
                      <Store className="h-3 w-3" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-meta font-semibold text-text">{s.label}</span>
                      <span className="block truncate text-3xs text-muted">{s.sublabel}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!space && !searching && query.trim().length >= 2 && spaces.length === 0 && (
            <p className="rounded-control border border-dashed border-border px-2.5 py-3 text-center text-2xs text-muted">
              No Space matches that. Try another name.
            </p>
          )}

          {space && (
            <div className="space-y-1.5 rounded-control border border-border bg-surface-elevated/40 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-2xs font-semibold text-text">{space.label}</p>
                <button
                  type="button"
                  onClick={() => {
                    setSpace(null)
                    setOptions([])
                  }}
                  className="shrink-0 text-3xs font-semibold text-muted underline hover:text-text"
                >
                  Back
                </button>
              </div>
              {loading ? (
                <p className="flex items-center gap-1.5 px-1 py-2 text-2xs text-muted">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {copy.loading}
                </p>
              ) : options.length === 0 ? (
                <p className="px-1 py-2 text-2xs text-muted">{copy.emptyOwner}</p>
              ) : (
                <ul className="max-h-60 space-y-1 overflow-y-auto">
                  {options.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => pickOption(o)}
                        className="group flex w-full items-center gap-2 rounded-control bg-surface px-2 py-1.5 text-left transition-colors hover:ring-1 hover:ring-primary"
                      >
                        {o.image ? (
                          // eslint-disable-next-line @next/next/no-img-element -- operator asset URL, not a build asset
                          <img src={o.image} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                        ) : (
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-surface-elevated text-subtle">
                            <Icon className="h-3.5 w-3.5" aria-hidden />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-meta font-semibold text-text">{o.title || 'Untitled'}</span>
                          {o.line && <span className="block truncate text-3xs text-muted">{o.line}</span>}
                        </span>
                        <Check className="h-3.5 w-3.5 shrink-0 text-subtle opacity-0 group-hover:opacity-100" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-control border border-danger/30 bg-danger-bg px-2.5 py-1.5 text-2xs text-danger" role="alert">
          {error}
        </p>
      )}

      <label className="block space-y-1">
        <span className="text-2xs font-semibold text-muted">Button label</span>
        <Input
          type="text"
          value={ctaLabel}
          onChange={(e) => onField('ctaLabel', e.target.value || undefined)}
          placeholder={copy.defaultCta}
          className="!px-2.5 !py-1.5 text-meta"
        />
      </label>
    </div>
  )
}

const EVENT_COPY: PickerCopy = {
  refKey: 'event',
  lineKeys: ['when', 'where'],
  defaultCta: 'RSVP',
  help: 'Search a Space, then pick one of its upcoming events. The card pulls its cover, date, venue, and link from the event when the email sends, so it never goes stale.',
  emptyOwner: 'This Space has no upcoming events.',
  loading: 'Loading events',
  noun: 'event',
  icon: CalendarDays,
  list: async (spaceId) => {
    const res = await listSpaceEventsAction(spaceId)
    if (isError(res)) return res.error
    return res.data.map((e: EventOption) => ({
      id: e.id,
      title: e.title,
      image: e.image,
      url: e.url,
      line: [e.when, e.where].filter(Boolean).join(' · '),
      extra: { when: e.when, where: e.where },
    }))
  },
}

const CIRCLE_COPY: PickerCopy = {
  refKey: 'circle',
  lineKeys: ['blurb'],
  defaultCta: 'Join the circle',
  help: 'Search a Space, then pick one of its circles. The card pulls its photo, name, blurb, and link from the circle when the email sends, so it never goes stale.',
  emptyOwner: 'This Space has no open circles.',
  loading: 'Loading circles',
  noun: 'circle',
  icon: Users,
  list: async (spaceId) => {
    const res = await listSpaceCirclesAction(spaceId)
    if (isError(res)) return res.error
    return res.data.map((c: CircleOption) => ({
      id: c.id,
      title: c.title,
      image: c.image,
      url: c.url,
      line: c.blurb,
      extra: { blurb: c.blurb },
    }))
  },
}

export function EventCardEditor(props: { content: Record<string, unknown>; onField: (key: string, value: unknown) => void }) {
  return <SpaceItemPicker {...props} copy={EVENT_COPY} />
}

export function CircleCardEditor(props: { content: Record<string, unknown>; onField: (key: string, value: unknown) => void }) {
  return <SpaceItemPicker {...props} copy={CIRCLE_COPY} />
}
