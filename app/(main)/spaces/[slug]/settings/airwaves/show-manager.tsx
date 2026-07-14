'use client'

// Airwaves P3 — the Shows (podcast feeds) half of the owner console. A Show groups Recordings into one
// RSS feed: an Episode is just a Recording with its show_id set. This island lets the owner create /
// edit / delete a Show, pick its cover art from the Loom, flip it from draft to published, and then
// manage its episodes — add or remove Recordings, order them, and set each one's public-feed state. All
// writes go through the gated slug-scoped actions; the client only reflects their results. An Episode is
// live in the public feed ONLY when its visibility is Anyone AND its publish date is set and in the past,
// so every episode row spells out why it is or is not live. DAWN tokens only (no hex); voice canon (no
// em dashes), mirroring the Recordings console body next door.

import { useMemo, useState, useTransition } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Music,
  Plus,
  Podcast,
  Radio,
  Trash2,
  Video,
  X,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import { Dialog } from '@/components/ui/dialog'
import {
  isRecordingPublic,
  RECORDING_VISIBILITIES,
  type Recording,
  type RecordingVisibility,
  type Show,
} from '@/lib/airwaves/types'
import { ShowCoverPicker, type CoverPick } from './show-cover-picker'
import {
  createShowAction,
  updateShowAction,
  deleteShowAction,
  assignEpisodeAction,
  reorderEpisodeAction,
  setEpisodePublishAction,
} from './actions'

// Apple Podcasts' top-level categories — the value Apple and Spotify read from the feed. Kept to the
// primary tier so the owner picks one clean label; the lib defaults to Society & Culture.
const ITUNES_CATEGORIES = [
  'Arts',
  'Business',
  'Comedy',
  'Education',
  'Fiction',
  'Government',
  'Health & Fitness',
  'History',
  'Kids & Family',
  'Leisure',
  'Music',
  'News',
  'Religion & Spirituality',
  'Science',
  'Society & Culture',
  'Sports',
  'Technology',
  'True Crime',
  'TV & Film',
] as const

// A short list of common feed languages (RSS `language`, an ISO code). Owners with another language can
// still ship — English is the safe default Apple accepts.
const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'nl', label: 'Dutch' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
]

const VISIBILITY_LABEL: Record<RecordingVisibility, string> = {
  public: 'Anyone',
  space: 'Members',
  private: 'Private',
}

const STATUS_LABEL: Record<Show['status'], string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
}

// ── datetime-local <-> ISO helpers ────────────────────────────────────────────────────────────────

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// Plain-language reason an Episode is or is not live in the public feed. The floor is the pure
// isRecordingPublic predicate (visibility Anyone AND a past publish date), spelled out for the owner.
function feedStatus(rec: Recording): { live: boolean; note: string } {
  if (isRecordingPublic(rec)) return { live: true, note: 'Live in the feed.' }
  if (rec.visibility !== 'public') {
    return { live: false, note: 'Set visibility to Anyone to include it in the feed.' }
  }
  if (!rec.publishedAt) return { live: false, note: 'Add a publish date to make it live.' }
  return { live: false, note: 'Scheduled. It goes live on its publish date.' }
}

// ── the show form draft ───────────────────────────────────────────────────────────────────────────

interface ShowDraft {
  title: string
  slug: string
  description: string
  author: string
  itunesCategory: string
  language: string
  explicit: boolean
  ownerName: string
  ownerEmail: string
  published: boolean
  cover: CoverPick | null
}

function draftFrom(show: Show | null, coverUrl: string | null): ShowDraft {
  return {
    title: show?.title ?? '',
    slug: show?.slug ?? '',
    description: show?.description ?? '',
    author: show?.author ?? '',
    itunesCategory: show?.itunesCategory ?? 'Society & Culture',
    language: show?.language ?? 'en',
    explicit: show?.explicit ?? false,
    ownerName: show?.ownerName ?? '',
    ownerEmail: show?.ownerEmail ?? '',
    published: show?.status === 'published',
    cover: show?.coverAssetId && coverUrl ? { id: show.coverAssetId, url: coverUrl } : null,
  }
}

export function ShowManager({
  slug,
  shows: initialShows,
  recordings: initialRecordings,
  coverUrlByShowId,
  feedBaseUrl,
}: {
  slug: string
  shows: Show[]
  recordings: Recording[]
  /** Resolved cover-art URL per Show id (for the list + edit-form thumbnails). */
  coverUrlByShowId: Record<string, string>
  /** The public podcast base for this space, e.g. `${SITE_URL}/podcasts/${spaceSlug}`. A show's feed
   *  is `${feedBaseUrl}/${show.slug}/rss.xml`. */
  feedBaseUrl: string
}) {
  const [shows, setShows] = useState<Show[]>(initialShows)
  const [recordings, setRecordings] = useState<Recording[]>(initialRecordings)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // The open editor: null = closed, a Show = editing it, 'new' = creating.
  const [editing, setEditing] = useState<Show | 'new' | null>(null)
  const [draft, setDraft] = useState<ShowDraft>(() => draftFrom(null, null))
  // The Show whose episodes are being managed (its card is expanded).
  const [openShowId, setOpenShowId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const episodesFor = (showId: string) =>
    recordings
      .filter((r) => r.showId === showId)
      .sort((a, b) => a.sortOrder - b.sortOrder || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))

  const unassigned = useMemo(() => recordings.filter((r) => !r.showId), [recordings])
  const feedUrlFor = (show: Show) => `${feedBaseUrl}/${show.slug}/rss.xml`

  const openNew = () => {
    setError(null)
    setDraft(draftFrom(null, null))
    setEditing('new')
  }
  const openEdit = (show: Show) => {
    setError(null)
    setDraft(draftFrom(show, coverUrlByShowId[show.id] ?? null))
    setEditing(show)
  }

  const saveShow = () => {
    setError(null)
    const payload = {
      title: draft.title.trim(),
      slug: draft.slug.trim() || null,
      description: draft.description.trim() || null,
      author: draft.author.trim() || null,
      itunesCategory: draft.itunesCategory,
      language: draft.language,
      explicit: draft.explicit,
      ownerName: draft.ownerName.trim() || null,
      ownerEmail: draft.ownerEmail.trim() || null,
      coverAssetId: draft.cover?.id ?? null,
      status: (draft.published ? 'published' : 'draft') as Show['status'],
    }
    startTransition(async () => {
      const res =
        editing === 'new'
          ? await createShowAction(slug, payload)
          : editing
            ? await updateShowAction(slug, editing.id, payload)
            : null
      if (!res) return
      if (res.ok) {
        setShows((prev) =>
          editing === 'new'
            ? [res.value, ...prev]
            : prev.map((s) => (s.id === res.value.id ? res.value : s)),
        )
        // Keep the cover URL map fresh for the row/edit thumbnail after a save.
        if (res.value.coverAssetId && draft.cover?.url) {
          coverUrlByShowId[res.value.id] = draft.cover.url
        }
        setEditing(null)
      } else {
        setError(res.error)
      }
    })
  }

  const removeShow = (show: Show) => {
    setError(null)
    startTransition(async () => {
      const res = await deleteShowAction(slug, show.id)
      if (res.ok) {
        setShows((prev) => prev.filter((s) => s.id !== show.id))
        // The lib unlinked the episodes (cleared show_id) — reflect that so they return to the pool.
        setRecordings((prev) => prev.map((r) => (r.showId === show.id ? { ...r, showId: null } : r)))
        if (openShowId === show.id) setOpenShowId(null)
      } else {
        setError(res.error)
      }
    })
  }

  const addEpisode = (show: Show, recordingId: string) => {
    setError(null)
    const order = episodesFor(show.id).length
    startTransition(async () => {
      const res = await assignEpisodeAction(slug, recordingId, show.id)
      if (!res.ok) return setError(res.error)
      let next = res.value
      const ordered = await reorderEpisodeAction(slug, recordingId, order)
      if (ordered.ok) next = ordered.value
      setRecordings((prev) => prev.map((r) => (r.id === recordingId ? next : r)))
    })
  }

  const removeEpisode = (recordingId: string) => {
    setError(null)
    startTransition(async () => {
      const res = await assignEpisodeAction(slug, recordingId, null)
      if (res.ok) setRecordings((prev) => prev.map((r) => (r.id === recordingId ? res.value : r)))
      else setError(res.error)
    })
  }

  // Move an episode up or down within its show, then renumber every episode to its new position so
  // sort_order stays gap-free. Only the rows that actually changed are written.
  const moveEpisode = (show: Show, recordingId: string, dir: -1 | 1) => {
    setError(null)
    const eps = episodesFor(show.id)
    const from = eps.findIndex((e) => e.id === recordingId)
    const to = from + dir
    if (from < 0 || to < 0 || to >= eps.length) return
    const arr = [...eps]
    const [item] = arr.splice(from, 1)
    arr.splice(to, 0, item!)
    startTransition(async () => {
      const updates: Recording[] = []
      for (let i = 0; i < arr.length; i++) {
        if (arr[i]!.sortOrder !== i) {
          const res = await reorderEpisodeAction(slug, arr[i]!.id, i)
          if (res.ok) updates.push(res.value)
          else return setError(res.error)
        }
      }
      if (updates.length) {
        const byId = new Map(updates.map((u) => [u.id, u]))
        setRecordings((prev) => prev.map((r) => byId.get(r.id) ?? r))
      }
    })
  }

  const setEpisodeVisibility = (recordingId: string, visibility: RecordingVisibility, publishedAt: string | null) => {
    setError(null)
    startTransition(async () => {
      const res = await setEpisodePublishAction(slug, recordingId, { visibility, publishedAt })
      if (res.ok) setRecordings((prev) => prev.map((r) => (r.id === recordingId ? res.value : r)))
      else setError(res.error)
    })
  }

  const copyFeed = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(url)
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 1500)
    } catch {
      // Clipboard blocked — the URL is on screen to copy by hand.
    }
  }

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Shows"
        count={shows.length}
        action={
          <button
            type="button"
            onClick={openNew}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> New show
          </button>
        }
      />

      <p className="text-xs text-muted">
        A show is one podcast feed. Group your recordings into a show, publish it, then submit its feed
        link to Apple Podcasts and Spotify.
      </p>

      {error && <p className="text-xs text-danger">{error}</p>}

      {shows.length === 0 ? (
        <EmptyState
          icon={Podcast}
          title="No shows yet"
          description="Create a show to turn your recordings into a podcast people can subscribe to."
        />
      ) : (
        <ul className="space-y-4">
          {shows.map((show) => {
            const eps = episodesFor(show.id)
            const liveCount = eps.filter((e) => isRecordingPublic(e)).length
            const coverUrl = coverUrlByShowId[show.id]
            const isOpen = openShowId === show.id
            return (
              <li key={show.id} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start gap-3">
                  {coverUrl ? (
                    <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element -- Loom asset URL, not a build asset */}
                      <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                    </span>
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-subtle">
                      <Podcast className="h-5 w-5" aria-hidden />
                    </span>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-text">{show.title}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide ${
                          show.status === 'published'
                            ? 'bg-success-bg text-success'
                            : 'bg-surface-elevated text-muted'
                        }`}
                      >
                        {STATUS_LABEL[show.status]}
                      </span>
                    </div>
                    <p className="text-2xs text-subtle">
                      {eps.length} {eps.length === 1 ? 'episode' : 'episodes'}
                      {eps.length > 0 && ` · ${liveCount} live in the feed`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(show)}
                      disabled={pending}
                      className="rounded-lg border border-border px-2.5 py-1 text-2xs font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${show.title}`}
                      onClick={() => removeShow(show)}
                      disabled={pending}
                      className="rounded p-1 text-subtle transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>

                {/* Feed link + submission helper — only meaningful once the show is published. */}
                {show.status === 'published' ? (
                  <div className="space-y-1.5 rounded-xl border border-border bg-canvas p-3">
                    <div className="flex items-center gap-2">
                      <Radio className="h-3.5 w-3.5 shrink-0 text-primary-strong" aria-hidden />
                      <code className="min-w-0 flex-1 truncate text-2xs text-muted">{feedUrlFor(show)}</code>
                      <button
                        type="button"
                        onClick={() => copyFeed(feedUrlFor(show))}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-3xs font-semibold text-text transition-colors hover:border-border-strong"
                      >
                        <Copy className="h-3 w-3" aria-hidden /> {copied === feedUrlFor(show) ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-3xs text-subtle">
                      Submit this feed link once in Apple Podcasts Connect and in Spotify for Podcasters. They
                      pull in new episodes on their own after that, so you only submit it the first time.
                    </p>
                  </div>
                ) : (
                  <p className="text-2xs text-subtle">
                    Publish this show to get its feed link for Apple Podcasts and Spotify.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setOpenShowId(isOpen ? null : show.id)}
                  className="inline-flex items-center gap-1 text-2xs font-semibold text-primary-strong transition-colors hover:text-primary"
                >
                  {isOpen ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                  {isOpen ? 'Hide episodes' : 'Manage episodes'}
                </button>

                {isOpen && (
                  <EpisodePanel
                    eps={eps}
                    unassigned={unassigned}
                    pending={pending}
                    onAdd={(recId) => addEpisode(show, recId)}
                    onRemove={removeEpisode}
                    onMove={(recId, dir) => moveEpisode(show, recId, dir)}
                    onSetVisibility={setEpisodeVisibility}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}

      {editing !== null && (
        <ShowFormDialog
          slug={slug}
          isNew={editing === 'new'}
          draft={draft}
          setDraft={setDraft}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={saveShow}
        />
      )}
    </section>
  )
}

// ── Episode management panel (one open show) ──────────────────────────────────────────────────────

function EpisodePanel({
  eps,
  unassigned,
  pending,
  onAdd,
  onRemove,
  onMove,
  onSetVisibility,
}: {
  eps: Recording[]
  unassigned: Recording[]
  pending: boolean
  onAdd: (recordingId: string) => void
  onRemove: (recordingId: string) => void
  onMove: (recordingId: string, dir: -1 | 1) => void
  onSetVisibility: (recordingId: string, visibility: RecordingVisibility, publishedAt: string | null) => void
}) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-canvas p-3">
      <div className="space-y-2">
        <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Episodes</p>
        {eps.length === 0 ? (
          <p className="text-2xs text-muted">No episodes yet. Add recordings from the list below.</p>
        ) : (
          <ul className="space-y-2">
            {eps.map((ep, i) => {
              const status = feedStatus(ep)
              return (
                <li key={ep.id} className="space-y-2 rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        aria-label="Move up"
                        disabled={pending || i === 0}
                        onClick={() => onMove(ep.id, -1)}
                        className="rounded p-0.5 text-subtle hover:text-text disabled:opacity-30"
                      >
                        <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        disabled={pending || i === eps.length - 1}
                        onClick={() => onMove(ep.id, 1)}
                        className="rounded p-0.5 text-subtle hover:text-text disabled:opacity-30"
                      >
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                    {ep.mediaKind === 'video' ? (
                      <Video className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                    ) : (
                      <Music className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate text-2xs font-semibold text-text">{ep.title}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${ep.title} from this show`}
                      disabled={pending}
                      onClick={() => onRemove(ep.id)}
                      className="rounded p-1 text-subtle transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pl-6">
                    <label className="flex items-center gap-1.5">
                      <span className="text-3xs font-semibold uppercase tracking-wide text-subtle">Who can see</span>
                      <select
                        value={ep.visibility}
                        disabled={pending}
                        onChange={(e) =>
                          onSetVisibility(ep.id, e.target.value as RecordingVisibility, ep.publishedAt)
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-3xs text-text outline-none focus:border-primary"
                      >
                        {RECORDING_VISIBILITIES.map((v) => (
                          <option key={v} value={v}>
                            {VISIBILITY_LABEL[v]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-1.5">
                      <span className="text-3xs font-semibold uppercase tracking-wide text-subtle">Publish date</span>
                      <input
                        type="datetime-local"
                        value={toLocalInput(ep.publishedAt)}
                        disabled={pending}
                        onChange={(e) => onSetVisibility(ep.id, ep.visibility, fromLocalInput(e.target.value))}
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-3xs text-text outline-none focus:border-primary"
                      />
                    </label>
                    {!ep.publishedAt && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onSetVisibility(ep.id, 'public', new Date().toISOString())}
                        className="rounded-lg border border-border px-2 py-1 text-3xs font-semibold text-primary-strong transition-colors hover:border-border-strong disabled:opacity-50"
                      >
                        Publish now
                      </button>
                    )}
                  </div>

                  <p className={`pl-6 text-3xs ${status.live ? 'text-success' : 'text-subtle'}`}>{status.note}</p>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Add from your recordings</p>
        {unassigned.length === 0 ? (
          <p className="text-2xs text-muted">
            Every recording is already in a show. Upload more in the Recordings tab to add them here.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {unassigned.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                {r.mediaKind === 'video' ? (
                  <Video className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                ) : (
                  <Music className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate text-2xs text-text">{r.title}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onAdd(r.id)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-3xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" aria-hidden /> Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── The show create/edit form (a dialog) ──────────────────────────────────────────────────────────

function ShowFormDialog({
  slug,
  isNew,
  draft,
  setDraft,
  pending,
  onCancel,
  onSave,
}: {
  slug: string
  isNew: boolean
  draft: ShowDraft
  setDraft: React.Dispatch<React.SetStateAction<ShowDraft>>
  pending: boolean
  onCancel: () => void
  onSave: () => void
}) {
  const set = <K extends keyof ShowDraft>(key: K, value: ShowDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const field = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'
  const label = 'block space-y-1'
  const labelText = 'text-xs font-semibold text-muted'

  return (
    <Dialog open onClose={onCancel} ariaLabel={isNew ? 'Create a show' : 'Edit show'} className="max-w-lg">
      <div className="max-h-[86vh] overflow-y-auto rounded-2xl border border-border bg-canvas p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-text">{isNew ? 'New show' : 'Edit show'}</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="rounded-lg p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-4">
          <label className={label}>
            <span className={labelText}>Title</span>
            <input
              type="text"
              value={draft.title}
              placeholder="Name your show"
              onChange={(e) => set('title', e.target.value)}
              className={field}
            />
          </label>

          <label className={label}>
            <span className={labelText}>Link name (optional)</span>
            <input
              type="text"
              value={draft.slug}
              placeholder="Leave blank to build it from the title"
              onChange={(e) => set('slug', e.target.value)}
              className={field}
            />
            <span className="text-2xs text-subtle">This becomes the end of your feed link.</span>
          </label>

          <label className={label}>
            <span className={labelText}>Description</span>
            <textarea
              value={draft.description}
              rows={3}
              placeholder="Tell listeners what the show is about."
              onChange={(e) => set('description', e.target.value)}
              className={`${field} resize-none`}
            />
          </label>

          <div>
            <span className={labelText}>Cover art</span>
            <div className="mt-1">
              <ShowCoverPicker
                slug={slug}
                value={draft.cover}
                onChange={(cover) => set('cover', cover)}
                disabled={pending}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              <span className={labelText}>Author</span>
              <input
                type="text"
                value={draft.author}
                placeholder="Who hosts the show"
                onChange={(e) => set('author', e.target.value)}
                className={field}
              />
            </label>
            <label className={label}>
              <span className={labelText}>Category</span>
              <select
                value={draft.itunesCategory}
                onChange={(e) => set('itunesCategory', e.target.value)}
                className={field}
              >
                {ITUNES_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              <span className={labelText}>Language</span>
              <select value={draft.language} onChange={(e) => set('language', e.target.value)} className={field}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-end gap-2 pb-2">
              <input
                type="checkbox"
                checked={draft.explicit}
                onChange={(e) => set('explicit', e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className={labelText}>Explicit content</span>
            </label>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
            <p className="text-2xs text-subtle">
              Apple and Spotify verify a show by emailing its owner. Use an address you can check.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={label}>
                <span className={labelText}>Owner name</span>
                <input
                  type="text"
                  value={draft.ownerName}
                  onChange={(e) => set('ownerName', e.target.value)}
                  className={field}
                />
              </label>
              <label className={label}>
                <span className={labelText}>Owner email</span>
                <input
                  type="email"
                  value={draft.ownerEmail}
                  onChange={(e) => set('ownerEmail', e.target.value)}
                  className={field}
                />
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.published}
              onChange={(e) => set('published', e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm font-semibold text-text">Published</span>
            <span className="text-2xs text-subtle">Off keeps it a private draft.</span>
          </label>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-muted transition-colors hover:text-text disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={pending || !draft.title.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? 'Saving' : isNew ? 'Create show' : 'Save changes'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
