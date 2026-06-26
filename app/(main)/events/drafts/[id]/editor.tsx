'use client'

// The flexible draft editor for a captured poster event. Primary fields up top
// (stacked datetime inputs on phones, mirroring event-settings-module), then a
// section per details group — each renders only when it has rows, every row is
// editable + removable, and missing sections come back via "Add a section".
// Low-confidence rows (the model flagged a hard-to-read spot) carry a small
// "Check this" chip. Save is explicit (same pattern as event-settings-module);
// Publish asks the one ownership question and, for posted events, hands the
// member the outreach prompt with the claim link.

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Plus, X, Send, UserRound, ImageIcon } from 'lucide-react'
import { Input, Textarea, Label, fieldClasses } from '@/components/ui/field'
import type {
  EventDetails, LineupItem, ScheduleItem, TicketTier, EventLink, ImageRegion, OtherDetail,
} from '@/lib/events/types'
import type { DetailsMedia, EventDetailsWithMedia } from '@/lib/events/details-media'
import { updateDraft, publishDraft } from '../../scan/actions'
import { isoToWallClockInput, wallClockToIso } from '@/lib/events/datetime'
import { OutreachCard } from './outreach-card'

export interface DraftEditorData {
  id: string
  title: string
  description: string
  startsAt: string | null
  endsAt: string | null
  location: string
  priceCents: number | null
  organizerName: string
  organizerContact: string
  /** Pillar slug ('' when unset). */
  domain: string
  details: EventDetailsWithMedia
  posterPath: string | null
}

const PILLAR_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Not sure yet' },
  { value: 'mind', label: 'Mind' },
  { value: 'body', label: 'Body' },
  { value: 'spirit', label: 'Spirit' },
  { value: 'expression', label: 'Expression' },
]

const ROLE_OPTIONS = ['band', 'speaker', 'dj', 'performer', 'host', 'other'] as const
const LINK_KIND_OPTIONS = ['tickets', 'rsvp', 'website', 'instagram', 'other'] as const

type LineupRow = LineupItem & { imagePath?: string }
type GalleryRow = ImageRegion & { imagePath?: string }

type SectionKey = 'lineup' | 'schedule' | 'features' | 'tickets' | 'links' | 'sponsors' | 'other'

const SECTION_LABEL: Record<SectionKey, string> = {
  lineup: 'Lineup',
  schedule: 'Schedule',
  features: 'Features',
  tickets: 'Tickets',
  links: 'Links',
  sponsors: 'Sponsors',
  other: 'Other details',
}


/** Small amber "the model was unsure here" marker. */
function CheckChip() {
  return (
    <span className="shrink-0 rounded-full border border-primary/40 bg-primary-bg px-2 py-0.5 text-2xs font-semibold text-primary-strong">
      Check this
    </span>
  )
}

export function DraftEditor({
  draft,
  signedUrls,
}: {
  draft: DraftEditorData
  /** storage path → short-lived signed URL, for the cover + crop thumbnails. */
  signedUrls: Record<string, string>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // ── Primary fields ───────────────────────────────────────────────────────────
  const [title, setTitle] = useState(draft.title)
  const [description, setDescription] = useState(draft.description)
  const [startsAt, setStartsAt] = useState(isoToWallClockInput(draft.startsAt))
  const [endsAt, setEndsAt] = useState(isoToWallClockInput(draft.endsAt))
  const [location, setLocation] = useState(draft.location)
  const [isFree, setIsFree] = useState(draft.priceCents === 0)
  const [price, setPrice] = useState(
    draft.priceCents && draft.priceCents > 0 ? (draft.priceCents / 100).toFixed(2) : '',
  )
  const [domain, setDomain] = useState(draft.domain)
  const [organizerName, setOrganizerName] = useState(draft.organizerName)
  const [organizerContact, setOrganizerContact] = useState(draft.organizerContact)

  // ── Flexible sections (rows carry their crop path inline; media is re-derived
  //    from row order on save so indices never drift) ───────────────────────────
  const media = draft.details.media
  const [lineup, setLineup] = useState<LineupRow[]>(
    (draft.details.lineup ?? []).map((r, i) => ({ ...r, imagePath: media?.lineup?.[String(i)] })),
  )
  const [schedule, setSchedule] = useState<ScheduleItem[]>(draft.details.schedule ?? [])
  const [features, setFeatures] = useState<string[]>(draft.details.features ?? [])
  const [tickets, setTickets] = useState<TicketTier[]>(draft.details.tickets ?? [])
  const [links, setLinks] = useState<EventLink[]>(draft.details.links ?? [])
  const [sponsors, setSponsors] = useState<string[]>(draft.details.sponsors ?? [])
  const [other, setOther] = useState<OtherDetail[]>(draft.details.other ?? [])
  const [gallery, setGallery] = useState<GalleryRow[]>(
    (draft.details.imageRegions ?? []).map((r, i) => ({ ...r, imagePath: media?.gallery?.[String(i)] })),
  )

  const [saved, setSaved] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // ── Publish state ─────────────────────────────────────────────────────────────
  const [ownership, setOwnership] = useState<'mine' | 'posted' | null>(null)
  const [published, setPublished] = useState<{ slug: string; claimToken?: string; claimSentTo?: string } | null>(null)

  // A missing or past start date means the event would never appear in the library
  // (the Catalog only lists `starts_at >= now`), so we warn here and block publish.
  // `nowMs` is read in an effect (never during render — react-hooks/purity) and kept
  // fresh; the server publish guard is the real backstop regardless.
  const [nowMs, setNowMs] = useState(0)
  useEffect(() => {
    // Set on the next tick (not synchronously in the effect) and refresh each minute.
    const t0 = setTimeout(() => setNowMs(Date.now()), 0)
    const iv = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => { clearTimeout(t0); clearInterval(iv) }
  }, [])
  const startIso = wallClockToIso(startsAt)
  const startMs = startIso ? new Date(startIso).getTime() : NaN
  const dateProblem: 'missing' | 'past' | null = !Number.isFinite(startMs)
    ? 'missing'
    : nowMs > 0 && startMs < nowMs
      ? 'past'
      : null

  const coverUrl =
    (media?.coverPath && signedUrls[media.coverPath]) ||
    (draft.posterPath && signedUrls[draft.posterPath]) ||
    null

  const sectionCounts: Record<SectionKey, number> = {
    lineup: lineup.length,
    schedule: schedule.length,
    features: features.length,
    tickets: tickets.length,
    links: links.length,
    sponsors: sponsors.length,
    other: other.length,
  }
  const missingSections = (Object.keys(SECTION_LABEL) as SectionKey[]).filter((k) => sectionCounts[k] === 0)

  function addSection(key: SectionKey) {
    addRow(key)
  }

  function addRow(key: SectionKey) {
    if (key === 'lineup') setLineup((p) => [...p, { name: '', role: 'other' }])
    if (key === 'schedule') setSchedule((p) => [...p, { title: '' }])
    if (key === 'features') setFeatures((p) => [...p, ''])
    if (key === 'tickets') setTickets((p) => [...p, { label: '' }])
    if (key === 'links') setLinks((p) => [...p, { label: '', url: '', kind: 'other' }])
    if (key === 'sponsors') setSponsors((p) => [...p, ''])
    if (key === 'other') setOther((p) => [...p, { label: '', value: '' }])
  }

  /** Assemble the details payload: drop empty rows, then rebuild media from the
   *  kept rows' inline paths so the index keys stay aligned. */
  const buildDetails = useMemo(
    () => (): EventDetailsWithMedia => {
      const keptLineup = lineup.filter((r) => r.name.trim())
      const keptGallery = gallery // gallery rows always carry a box (captured only)
      const nextMedia: DetailsMedia = {}
      if (media?.coverPath) nextMedia.coverPath = media.coverPath
      const lineupMedia: Record<string, string> = {}
      keptLineup.forEach((r, i) => { if (r.imagePath) lineupMedia[String(i)] = r.imagePath })
      if (Object.keys(lineupMedia).length) nextMedia.lineup = lineupMedia
      const galleryMedia: Record<string, string> = {}
      keptGallery.forEach((r, i) => { if (r.imagePath) galleryMedia[String(i)] = r.imagePath })
      if (Object.keys(galleryMedia).length) nextMedia.gallery = galleryMedia

      const details: EventDetails = {
        ...(keptLineup.length
          ? { lineup: keptLineup.map((r) => { const copy = { ...r }; delete copy.imagePath; return copy }) }
          : {}),
        ...(schedule.filter((r) => r.title.trim()).length
          ? { schedule: schedule.filter((r) => r.title.trim()) }
          : {}),
        ...(features.filter((f) => f.trim()).length ? { features: features.filter((f) => f.trim()) } : {}),
        ...(tickets.filter((r) => r.label.trim()).length
          ? { tickets: tickets.filter((r) => r.label.trim()) }
          : {}),
        ...(links.filter((r) => r.url.trim()).length ? { links: links.filter((r) => r.url.trim()) } : {}),
        ...(sponsors.filter((s) => s.trim()).length ? { sponsors: sponsors.filter((s) => s.trim()) } : {}),
        ...(keptGallery.length
          ? { imageRegions: keptGallery.map((r) => { const copy = { ...r }; delete copy.imagePath; return copy }) }
          : {}),
        ...(other.filter((r) => r.label.trim() && r.value.trim()).length
          ? { other: other.filter((r) => r.label.trim() && r.value.trim()) }
          : {}),
        ...(draft.details.confidence ? { confidence: draft.details.confidence } : {}),
      }
      return Object.keys(nextMedia).length ? { ...details, media: nextMedia } : details
    },
    [lineup, schedule, features, tickets, links, sponsors, other, gallery, media, draft.details.confidence],
  )

  function payload() {
    const cents = Math.round(parseFloat(price || '0') * 100)
    return {
      title,
      description,
      startsAt: wallClockToIso(startsAt),
      endsAt: wallClockToIso(endsAt),
      location,
      isFree,
      priceCents: Number.isFinite(cents) && cents > 0 ? cents : null,
      organizerName,
      organizerContact,
      domain: domain || null,
      details: buildDetails(),
    }
  }

  function handleSave() {
    if (pending) return
    setMsg(null)
    startTransition(async () => {
      const res = await updateDraft(draft.id, payload())
      if ('error' in res) { setMsg(res.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  function handlePublish() {
    if (pending || !ownership) return
    // Block publishing an undated/past event before it ever hits the server — it would
    // never list, and the scan often misreads the year.
    if (dateProblem === 'missing') {
      setMsg('Add a start date before publishing, so people can find this event.')
      return
    }
    if (dateProblem === 'past') {
      setMsg('That start date is in the past. Set a future date before publishing (the scan may have misread the year).')
      return
    }
    setMsg(null)
    startTransition(async () => {
      // Save first so the published event matches what is on screen.
      const savedRes = await updateDraft(draft.id, payload())
      if ('error' in savedRes) { setMsg(savedRes.error); return }
      const res = await publishDraft(draft.id, ownership)
      if (!res.ok) { setMsg(res.error); return }
      if (ownership === 'mine') {
        router.push(`/events/${res.slug}`)
        return
      }
      setPublished({ slug: res.slug, claimToken: res.claimToken, claimSentTo: res.claimSentTo })
    })
  }

  // After a 'posted' publish: the outreach prompt replaces the editor.
  if (published) {
    return (
      <div className="space-y-4">
        {published.claimSentTo && (
          <p className="rounded-lg border border-success/40 bg-success-bg px-3 py-2 text-sm text-success">
            Published, and we emailed the organizer a claim link at{' '}
            <span className="font-semibold">{published.claimSentTo}</span>. You can also share it yourself below.
          </p>
        )}
        {published.claimToken ? (
          <OutreachCard claimToken={published.claimToken} slug={published.slug} sentTo={published.claimSentTo} />
        ) : (
          <p className="rounded-lg border border-success/40 bg-success-bg px-3 py-2 text-sm text-success">
            Published. It is live on local events.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {msg && (
        <p className="rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">{msg}</p>
      )}

      {/* ── Cover preview ── */}
      {coverUrl && (
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt="Event cover"
            className="h-28 w-28 shrink-0 rounded-2xl border border-border object-cover"
          />
          <p className="text-xs text-subtle">
            The cover, cut from your poster. It fronts the event on local events.
          </p>
        </div>
      )}

      {/* ── Primary fields ── */}
      <div className="space-y-3">
        <label className="block space-y-1">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={pending} />
        </label>

        <label className="block space-y-1">
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            disabled={pending}
            className="resize-none"
          />
        </label>

        {/* Stacked on phones (two datetime-local inputs cannot shrink side by
            side on a phone — same fix as event-settings-module). */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block min-w-0 space-y-1">
            <Label>Starts</Label>
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              disabled={pending}
              className="min-w-0"
            />
            {dateProblem && (
              <p className="text-2xs font-medium text-danger">
                {dateProblem === 'missing'
                  ? 'Add a start date, or this event won’t show in the library.'
                  : 'This date is in the past (the scan may have misread the year). Fix it to publish.'}
              </p>
            )}
          </label>
          <label className="block min-w-0 space-y-1">
            <Label>Ends</Label>
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              disabled={pending}
              className="min-w-0"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <Label>Location</Label>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Venue and city"
            disabled={pending}
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Price</Label>
            <div className="flex items-center gap-3">
              <label className="flex shrink-0 items-center gap-1.5 text-sm text-text">
                <input
                  type="checkbox"
                  checked={isFree}
                  onChange={(e) => setIsFree(e.target.checked)}
                  disabled={pending}
                  className="h-4 w-4 accent-primary"
                />
                Free
              </label>
              {!isFree && (
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="15.00"
                  disabled={pending}
                  className="min-w-0"
                />
              )}
            </div>
          </div>
          <label className="block space-y-1">
            <Label>Pillar</Label>
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              disabled={pending}
              className={fieldClasses}
            >
              {PILLAR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <Label>Organizer name</Label>
            <Input value={organizerName} onChange={(e) => setOrganizerName(e.target.value)} disabled={pending} />
          </label>
          <label className="block space-y-1">
            <Label>Organizer contact</Label>
            <Input
              value={organizerContact}
              onChange={(e) => setOrganizerContact(e.target.value)}
              placeholder="Email, phone, or handle"
              disabled={pending}
            />
          </label>
        </div>
      </div>

      {/* ── Flexible sections ── */}
      {lineup.length > 0 && (
        <Section title="Lineup" onAdd={() => addRow('lineup')}>
          {lineup.map((row, i) => (
            <Row key={i} flagged={row.confidence === 'low'} onRemove={() => setLineup((p) => p.filter((_, x) => x !== i))}>
              {row.imagePath && signedUrls[row.imagePath] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signedUrls[row.imagePath]} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-subtle">
                  <UserRound className="h-4 w-4" />
                </span>
              )}
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  value={row.name}
                  onChange={(e) => setLineup((p) => p.map((r, x) => (x === i ? { ...r, name: e.target.value, confidence: undefined } : r)))}
                  placeholder="Name"
                  disabled={pending}
                />
                <select
                  value={row.role}
                  onChange={(e) => setLineup((p) => p.map((r, x) => (x === i ? { ...r, role: e.target.value as LineupItem['role'] } : r)))}
                  disabled={pending}
                  className={`${fieldClasses} sm:w-32`}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </Row>
          ))}
        </Section>
      )}

      {schedule.length > 0 && (
        <Section title="Schedule" onAdd={() => addRow('schedule')}>
          {schedule.map((row, i) => (
            <Row key={i} flagged={row.confidence === 'low'} onRemove={() => setSchedule((p) => p.filter((_, x) => x !== i))}>
              <div className="grid min-w-0 flex-1 grid-cols-[6rem_1fr] gap-2">
                <Input
                  value={row.time ?? ''}
                  onChange={(e) => setSchedule((p) => p.map((r, x) => (x === i ? { ...r, time: e.target.value, confidence: undefined } : r)))}
                  placeholder="7 pm"
                  disabled={pending}
                  className="min-w-0"
                />
                <Input
                  value={row.title}
                  onChange={(e) => setSchedule((p) => p.map((r, x) => (x === i ? { ...r, title: e.target.value, confidence: undefined } : r)))}
                  placeholder="What happens"
                  disabled={pending}
                  className="min-w-0"
                />
              </div>
            </Row>
          ))}
        </Section>
      )}

      {features.length > 0 && (
        <Section title="Features" onAdd={() => addRow('features')}>
          {features.map((f, i) => (
            <Row key={i} onRemove={() => setFeatures((p) => p.filter((_, x) => x !== i))}>
              <Input
                value={f}
                onChange={(e) => setFeatures((p) => p.map((v, x) => (x === i ? e.target.value : v)))}
                placeholder="e.g. all ages, food trucks"
                disabled={pending}
              />
            </Row>
          ))}
        </Section>
      )}

      {tickets.length > 0 && (
        <Section title="Tickets" onAdd={() => addRow('tickets')}>
          {tickets.map((row, i) => (
            <Row key={i} flagged={row.confidence === 'low'} onRemove={() => setTickets((p) => p.filter((_, x) => x !== i))}>
              <div className="grid min-w-0 flex-1 grid-cols-[1fr_6rem] gap-2">
                <Input
                  value={row.label}
                  onChange={(e) => setTickets((p) => p.map((r, x) => (x === i ? { ...r, label: e.target.value, confidence: undefined } : r)))}
                  placeholder="General admission"
                  disabled={pending}
                  className="min-w-0"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={row.priceCents != null ? (row.priceCents / 100).toString() : ''}
                  onChange={(e) => {
                    const cents = Math.round(parseFloat(e.target.value || '') * 100)
                    setTickets((p) =>
                      p.map((r, x) =>
                        x === i
                          ? { ...r, priceCents: Number.isFinite(cents) && cents >= 0 ? cents : null, confidence: undefined }
                          : r,
                      ),
                    )
                  }}
                  placeholder="$"
                  disabled={pending}
                  className="min-w-0"
                />
              </div>
            </Row>
          ))}
        </Section>
      )}

      {links.length > 0 && (
        <Section title="Links" onAdd={() => addRow('links')}>
          {links.map((row, i) => (
            <Row key={i} onRemove={() => setLinks((p) => p.filter((_, x) => x !== i))}>
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  value={row.label}
                  onChange={(e) => setLinks((p) => p.map((r, x) => (x === i ? { ...r, label: e.target.value } : r)))}
                  placeholder="Label"
                  disabled={pending}
                  className="min-w-0"
                />
                <Input
                  value={row.url}
                  onChange={(e) => setLinks((p) => p.map((r, x) => (x === i ? { ...r, url: e.target.value } : r)))}
                  placeholder="https://"
                  disabled={pending}
                  className="min-w-0"
                />
                <select
                  value={row.kind}
                  onChange={(e) => setLinks((p) => p.map((r, x) => (x === i ? { ...r, kind: e.target.value as EventLink['kind'] } : r)))}
                  disabled={pending}
                  className={`${fieldClasses} sm:w-28`}
                >
                  {LINK_KIND_OPTIONS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
            </Row>
          ))}
        </Section>
      )}

      {sponsors.length > 0 && (
        <Section title="Sponsors" onAdd={() => addRow('sponsors')}>
          {sponsors.map((s, i) => (
            <Row key={i} onRemove={() => setSponsors((p) => p.filter((_, x) => x !== i))}>
              <Input
                value={s}
                onChange={(e) => setSponsors((p) => p.map((v, x) => (x === i ? e.target.value : v)))}
                placeholder="Sponsor name"
                disabled={pending}
              />
            </Row>
          ))}
        </Section>
      )}

      {gallery.length > 0 && (
        <Section title="Gallery">
          <div className="flex flex-wrap gap-2">
            {gallery.map((row, i) => (
              <div key={i} className="relative">
                {row.imagePath && signedUrls[row.imagePath] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={signedUrls[row.imagePath]} alt={row.note ?? ''} className="h-20 w-20 rounded-xl border border-border object-cover" />
                ) : (
                  <span className="flex h-20 w-20 items-center justify-center rounded-xl bg-surface-elevated text-subtle">
                    <ImageIcon className="h-5 w-5" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setGallery((p) => p.filter((_, x) => x !== i))}
                  aria-label="Remove image"
                  className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-surface p-0.5 text-subtle transition-colors hover:text-danger"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {other.length > 0 && (
        <Section title="Other details" onAdd={() => addRow('other')}>
          {other.map((row, i) => (
            <Row key={i} onRemove={() => setOther((p) => p.filter((_, x) => x !== i))}>
              <div className="grid min-w-0 flex-1 grid-cols-[8rem_1fr] gap-2">
                <Input
                  value={row.label}
                  onChange={(e) => setOther((p) => p.map((r, x) => (x === i ? { ...r, label: e.target.value } : r)))}
                  placeholder="Label"
                  disabled={pending}
                  className="min-w-0"
                />
                <Input
                  value={row.value}
                  onChange={(e) => setOther((p) => p.map((r, x) => (x === i ? { ...r, value: e.target.value } : r)))}
                  placeholder="Value"
                  disabled={pending}
                  className="min-w-0"
                />
              </div>
            </Row>
          ))}
        </Section>
      )}

      {/* Add a missing section back. */}
      {missingSections.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-subtle">Add a section:</span>
          {missingSections.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => addSection(k)}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-text"
            >
              <Plus className="h-3 w-3" /> {SECTION_LABEL[k]}
            </button>
          ))}
        </div>
      )}

      {/* ── Save ── */}
      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        {saved && (
          <span className="flex items-center gap-1 text-xs font-medium text-primary-strong">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {pending ? 'Saving' : 'Save draft'}
        </button>
      </div>

      {/* ── Publish: the ownership question ── */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm font-bold text-text">Ready to publish?</p>
        <p className="mt-1 text-xs text-muted">One honest question first. It decides who hosts the event.</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <OwnershipOption
            selected={ownership === 'mine'}
            onSelect={() => setOwnership('mine')}
            title="This is my event"
            blurb="You become the host and manage it from the event page."
            disabled={pending}
          />
          <OwnershipOption
            selected={ownership === 'posted'}
            onSelect={() => setOwnership('posted')}
            title="I found this event"
            blurb="It posts to local events, and the organizer can claim it as theirs."
            disabled={pending}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handlePublish}
            disabled={pending || !ownership || !!dateProblem}
            title={dateProblem ? 'Set a valid future start date to publish' : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Publish
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, onAdd, children }: { title: string; onAdd?: () => void; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3">
        <h2 className="text-sm font-bold tracking-tight text-text">{title}</h2>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong hover:underline"
          >
            <Plus className="h-3 w-3" /> Add row
          </button>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function Row({
  children,
  flagged,
  onRemove,
}: {
  children: React.ReactNode
  flagged?: boolean
  onRemove: () => void
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      <div className="flex shrink-0 items-center gap-1.5 pt-2">
        {flagged && <CheckChip />}
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove row"
          className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-danger"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function OwnershipOption({
  selected,
  onSelect,
  title,
  blurb,
  disabled,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  blurb: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`rounded-xl border p-3 text-left transition-colors ${
        selected
          ? 'border-primary bg-primary-bg/60'
          : 'border-border bg-surface hover:border-border-strong'
      }`}
    >
      <span className="block text-sm font-semibold text-text">{title}</span>
      <span className="mt-0.5 block text-xs text-muted">{blurb}</span>
    </button>
  )
}
