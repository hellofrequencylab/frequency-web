'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Eye, Send, Loader2, Plus, X, CalendarPlus } from 'lucide-react'
import type { PillarSlug } from '@/lib/pillars'
import { PILLAR_SLUGS } from '@/lib/pillars'
import type { CircleDraft, CircleDraftPatch } from '@/lib/circles/draft'
import type { CircleComposeSection, CircleComposeResult } from '@/lib/ai/circle-compose'
import {
  saveCircleDraftAction,
  composeSectionAction,
  editDraftAction,
} from '@/app/(main)/circles/builder-actions'
import { publishCircleAction, generateCircleEventsAction } from '@/app/(main)/circles/remix-actions'
import { CircleCallouts } from './circle-callouts'
import { CircleVeraPanel } from './circle-vera-panel'

// The member-facing Starter Circle BUILDER (Stage 4). A full-page editor that
// mirrors the Journey builder's chrome (deferred creation already happened on
// /circles/new; this opens the live draft), but its body is a STRUCTURED CIRCLE
// FORM, not a curriculum tree. Every field autosaves on blur via
// saveCircleDraftAction then router.refresh(). Edit-mode callouts (standard
// best-practice + the template's editorNotes) sit beside each section and never
// reach the published Circle. A Vera panel fills sections + applies plain-language
// edits. The header + foot action sets hold the save indicator, Preview, and
// Publish; after publish the Host can generate the two standing events.

const PILLAR_LABELS: Record<PillarSlug, string> = {
  mind: 'Mind',
  body: 'Body',
  spirit: 'Spirit',
  expression: 'Expression',
}

type SaveState = 'idle' | 'saving' | 'saved'

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition-colors hover:border-border-strong focus:border-primary placeholder:text-subtle'

export function CircleBuilder({ draft }: { draft: CircleDraft }) {
  const router = useRouter()
  const { circleId, slug } = draft
  const published = draft.status !== 'draft'

  // Local form mirror of the draft. Autosave-on-blur writes the patch, then
  // router.refresh() reconciles the server truth back into this tree on next render.
  const [name, setName] = useState(draft.name)
  const [about, setAbout] = useState(draft.about ?? '')
  const [type, setType] = useState<CircleDraft['type']>(draft.type)
  const [memberCap, setMemberCap] = useState(String(draft.memberCap))
  const [primaryPillar, setPrimaryPillar] = useState<PillarSlug | null>(draft.primaryPillar)
  const [pillarsInside, setPillarsInside] = useState(draft.pillarsInside)
  const [meetup, setMeetup] = useState(draft.meetup.text)
  const [meetupLength, setMeetupLength] = useState(draft.meetup.length ?? '')
  const [gathering, setGathering] = useState(draft.gathering.text)
  const [thread, setThread] = useState(draft.thread ?? '')
  const [format, setFormat] = useState(draft.format ?? '')
  const [sizeLabel, setSizeLabel] = useState(draft.sizeLabel ?? '')
  const [agreements, setAgreements] = useState(draft.agreements)
  const [remixOptions, setRemixOptions] = useState(draft.remixOptions)

  const [saveState, setSaveState] = useState<SaveState>('idle')
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [, startRefresh] = useTransition()

  // The one autosave path: write a patch, flag saved, refresh the server tree.
  const save = useCallback(
    (patch: CircleDraftPatch) => {
      setSaveState('saving')
      void (async () => {
        try {
          await saveCircleDraftAction(circleId, patch)
          setSaveState('saved')
          if (savedTimer.current) clearTimeout(savedTimer.current)
          savedTimer.current = setTimeout(() => setSaveState('idle'), 1500)
          startRefresh(() => router.refresh())
        } catch {
          setSaveState('idle')
        }
      })()
    },
    [circleId, router],
  )

  // Save a single field only if it actually changed against the draft baseline.
  const saveIfChanged = (key: keyof CircleDraftPatch, next: unknown, baseline: unknown) => {
    if (JSON.stringify(next) !== JSON.stringify(baseline)) save({ [key]: next } as CircleDraftPatch)
  }

  // ── Vera wiring ──────────────────────────────────────────────────────────
  // Merge a compose-section partial into the form + persist it. Returns a note.
  const applyCompose = (result: CircleComposeResult): string | null => {
    const patch: CircleDraftPatch = {}
    if (result.pillarsInside) {
      const merged = { ...pillarsInside, ...result.pillarsInside }
      setPillarsInside(merged)
      patch.pillarsInside = merged
    }
    if (result.meetup !== undefined) {
      setMeetup(result.meetup)
      patch.meetup = { text: result.meetup, length: meetupLength || undefined }
    }
    if (result.gathering !== undefined) {
      setGathering(result.gathering)
      patch.gathering = { text: result.gathering, length: draft.gathering.length }
    }
    if (result.thread !== undefined) {
      setThread(result.thread)
      patch.thread = result.thread
    }
    if (result.agreements) {
      setAgreements(result.agreements)
      patch.agreements = result.agreements
    }
    if (result.remixOptions) {
      setRemixOptions(result.remixOptions)
      patch.remixOptions = result.remixOptions
    }
    // The Card / one-liner land in the Circle's About.
    if (result.oneLiner) {
      setAbout(result.oneLiner)
      patch.about = result.oneLiner
    } else if (result.card) {
      setAbout(result.card)
      patch.about = result.card
    }
    if (Object.keys(patch).length === 0) return null
    save(patch)
    return 'Vera filled that section. Edit anything you like.'
  }

  const onCompose = async (section: CircleComposeSection): Promise<string | null> => {
    const result = await composeSectionAction({ circleId, section })
    if (!result) return null
    return applyCompose(result)
  }

  // Apply a plain-language edit, then sync the whole form from the fresh draft.
  const onEdit = async (request: string): Promise<string | null> => {
    const res = await editDraftAction({ circleId, request })
    if (!res) return null
    const d = res.draft
    setName(d.name)
    setAbout(d.about ?? '')
    setPrimaryPillar(d.primaryPillar)
    setPillarsInside(d.pillarsInside)
    setMeetup(d.meetup.text)
    setMeetupLength(d.meetup.length ?? '')
    setGathering(d.gathering.text)
    setThread(d.thread ?? '')
    setFormat(d.format ?? '')
    setSizeLabel(d.sizeLabel ?? '')
    setAgreements(d.agreements)
    setRemixOptions(d.remixOptions)
    startRefresh(() => router.refresh())
    return 'Vera updated the Circle.'
  }

  const actions = (
    <CircleActions
      circleId={circleId}
      slug={slug}
      published={published}
      saveState={saveState}
    />
  )

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <Link
            href="/circles/templates"
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Starter Circles
          </Link>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-primary-strong">
            Circle builder · Make it yours
          </p>
          <h1 className="text-2xl font-bold text-text">{name || 'Your circle'}</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            A private draft only you can see. Edit every field, then publish it as a live Circle. Every change saves
            as you go.
          </p>
          <div className="mt-4">{actions}</div>
        </header>

        <div className="mb-6">
          <CircleVeraPanel onCompose={onCompose} onEdit={onEdit} />
        </div>

        <div className="space-y-8">
          {/* ── Identity ─────────────────────────────────────────── */}
          <Section title="Identity" anchor="identity" editorNotes={draft.editorNotes}>
            <Labeled label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => saveIfChanged('name', name.trim(), draft.name)}
                maxLength={120}
                placeholder="Name it for the people, e.g. The Reading Room"
                className={FIELD}
              />
            </Labeled>
            <Labeled label="About">
              <textarea
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                onBlur={() => saveIfChanged('about', about.trim() || null, draft.about)}
                rows={3}
                placeholder="Who it is for and what they get, in plain words."
                className={`${FIELD} resize-y`}
              />
            </Labeled>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Labeled label="How it meets">
                <div className="flex gap-2">
                  {(['in-person', 'online'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={type === t}
                      onClick={() => {
                        setType(t)
                        saveIfChanged('type', t, draft.type)
                      }}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        type === t
                          ? 'border-primary/50 bg-primary-bg text-primary-strong'
                          : 'border-border bg-surface text-muted hover:text-text'
                      }`}
                    >
                      {t === 'in-person' ? 'In person' : 'Online'}
                    </button>
                  ))}
                </div>
              </Labeled>
              <Labeled label="Member cap">
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={memberCap}
                  onChange={(e) => setMemberCap(e.target.value)}
                  onBlur={() => {
                    const n = Math.min(50, Math.max(2, Number(memberCap) || draft.memberCap))
                    setMemberCap(String(n))
                    saveIfChanged('memberCap', n, draft.memberCap)
                  }}
                  className={FIELD}
                />
              </Labeled>
            </div>
            <Labeled label="Primary Pillar (the lean)">
              <div className="flex flex-wrap gap-2">
                {PILLAR_SLUGS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={primaryPillar === p}
                    onClick={() => {
                      const next = primaryPillar === p ? null : p
                      setPrimaryPillar(next)
                      saveIfChanged('primaryPillar', next, draft.primaryPillar)
                    }}
                    className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      primaryPillar === p
                        ? 'border-primary/50 bg-primary-bg text-primary-strong'
                        : 'border-border bg-surface text-muted hover:text-text'
                    }`}
                  >
                    {PILLAR_LABELS[p]}
                  </button>
                ))}
              </div>
            </Labeled>
          </Section>

          {/* ── Pillars inside ───────────────────────────────────── */}
          <Section title="The four Pillars inside" anchor="pillars" editorNotes={draft.editorNotes}>
            <div className="space-y-3">
              {PILLAR_SLUGS.map((p) => (
                <Labeled key={p} label={PILLAR_LABELS[p]}>
                  <input
                    value={pillarsInside[p] ?? ''}
                    onChange={(e) => setPillarsInside((prev) => ({ ...prev, [p]: e.target.value }))}
                    onBlur={() => {
                      const line = (pillarsInside[p] ?? '').trim()
                      const next = { ...pillarsInside }
                      if (line) next[p] = line
                      else delete next[p]
                      setPillarsInside(next)
                      saveIfChanged('pillarsInside', next, draft.pillarsInside)
                    }}
                    placeholder={`One honest line for ${PILLAR_LABELS[p]}.`}
                    className={FIELD}
                  />
                </Labeled>
              ))}
            </div>
          </Section>

          {/* ── Rhythm ───────────────────────────────────────────── */}
          <Section title="The standing rhythm" anchor="rhythm" editorNotes={draft.editorNotes}>
            <Labeled label="Circle Meetup (midweek)">
              <textarea
                value={meetup}
                onChange={(e) => setMeetup(e.target.value)}
                onBlur={() =>
                  saveIfChanged(
                    'meetup',
                    { text: meetup.trim(), length: meetupLength.trim() || undefined },
                    draft.meetup,
                  )
                }
                rows={2}
                placeholder="The midweek connect-and-process session: what happens, in person or virtual."
                className={`${FIELD} resize-y`}
              />
            </Labeled>
            <Labeled label="Meetup length (optional)">
              <input
                value={meetupLength}
                onChange={(e) => setMeetupLength(e.target.value)}
                onBlur={() =>
                  saveIfChanged(
                    'meetup',
                    { text: meetup.trim(), length: meetupLength.trim() || undefined },
                    draft.meetup,
                  )
                }
                maxLength={60}
                placeholder="e.g. 90 minutes"
                className={FIELD}
              />
            </Labeled>
            <Labeled label="Weekend Gathering">
              <textarea
                value={gathering}
                onChange={(e) => setGathering(e.target.value)}
                onBlur={() =>
                  saveIfChanged(
                    'gathering',
                    { text: gathering.trim(), length: draft.gathering.length },
                    draft.gathering,
                  )
                }
                rows={2}
                placeholder="The weekend in-person event that fits the group's vibe."
                className={`${FIELD} resize-y`}
              />
            </Labeled>
          </Section>

          {/* ── Thread ───────────────────────────────────────────── */}
          <Section title="The Thread" anchor="rhythm" editorNotes={[]}>
            <Labeled label="What lives in the always-on Thread">
              <textarea
                value={thread}
                onChange={(e) => setThread(e.target.value)}
                onBlur={() => saveIfChanged('thread', thread.trim() || null, draft.thread)}
                rows={2}
                placeholder="The online Thread that runs between gatherings: check-ins, photos, plans."
                className={`${FIELD} resize-y`}
              />
            </Labeled>
          </Section>

          {/* ── Format ───────────────────────────────────────────── */}
          <Section title="Format" anchor="meetup" editorNotes={draft.editorNotes}>
            <Labeled label="How it runs (in person, virtual, hybrid)">
              <textarea
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                onBlur={() => saveIfChanged('format', format.trim() || null, draft.format)}
                rows={2}
                placeholder="In person is the default. Always name a virtual path for busy weeks."
                className={`${FIELD} resize-y`}
              />
            </Labeled>
          </Section>

          {/* ── Size ─────────────────────────────────────────────── */}
          <Section title="Size" anchor="size" editorNotes={draft.editorNotes}>
            <Labeled label="The headcount that makes it work">
              <input
                value={sizeLabel}
                onChange={(e) => setSizeLabel(e.target.value)}
                onBlur={() => saveIfChanged('sizeLabel', sizeLabel.trim() || null, draft.sizeLabel)}
                maxLength={60}
                placeholder="e.g. 5 to 10"
                className={FIELD}
              />
            </Labeled>
          </Section>

          {/* ── Agreements ───────────────────────────────────────── */}
          <Section title="Agreements" anchor="agreements" editorNotes={draft.editorNotes}>
            <ListEditor
              items={agreements}
              onChange={(next) => {
                setAgreements(next)
                saveIfChanged('agreements', next, draft.agreements)
              }}
              addLabel="Add an agreement"
              placeholder="e.g. What is said here stays here."
            />
          </Section>

          {/* ── Remix ideas ──────────────────────────────────────── */}
          <Section title="Remix ideas" anchor="remix" editorNotes={draft.editorNotes}>
            <ListEditor
              items={remixOptions}
              onChange={(next) => {
                setRemixOptions(next)
                saveIfChanged('remixOptions', next, draft.remixOptions)
              }}
              addLabel="Add a remix idea"
              placeholder="A variation a Host could run instead."
            />
          </Section>
        </div>

        {/* Foot action set — the same controls, so the Host never scrolls back up. */}
        <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-6">
          {actions}
        </div>
      </div>
    </div>
  )
}

// ── The save indicator / Preview / Publish action set. Reused at top + foot. ──
function CircleActions({
  circleId,
  slug,
  published,
  saveState,
}: {
  circleId: string
  slug: string
  published: boolean
  saveState: SaveState
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [justPublished, setJustPublished] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventsDone, setEventsDone] = useState(false)
  const live = published || justPublished
  const btn =
    'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-60'

  const publish = () => {
    setError(null)
    start(async () => {
      try {
        const res = await publishCircleAction(circleId)
        setJustPublished(true)
        // Stay in the builder so the Host can generate the standing events; the
        // Publish control becomes a "View Circle" link.
        router.refresh()
        void res
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not publish. Try again.')
      }
    })
  }

  const generateEvents = () => {
    setError(null)
    start(async () => {
      try {
        await generateCircleEventsAction({ circleId })
        setEventsDone(true)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not add the events. Try again.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <SaveIndicator state={saveState} />
        <Link
          href={`/circles/${slug}`}
          target="_blank"
          className={`${btn} border border-border text-text hover:bg-surface-elevated`}
        >
          <Eye className="h-4 w-4" aria-hidden /> Preview
        </Link>
        {live ? (
          <>
            <Link href={`/circles/${slug}`} className={`${btn} border border-success/40 bg-success-bg text-success`}>
              <Check className="h-4 w-4" aria-hidden /> Published
            </Link>
            {eventsDone ? (
              <span className={`${btn} text-muted`}>
                <Check className="h-4 w-4" aria-hidden /> Events added
              </span>
            ) : (
              <button
                type="button"
                onClick={generateEvents}
                disabled={pending}
                className={`${btn} border border-primary/40 bg-primary-bg/40 text-primary-strong hover:bg-primary-bg`}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CalendarPlus className="h-4 w-4" aria-hidden />}{' '}
                Generate the standing events
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={publish}
            disabled={pending}
            className={`${btn} bg-primary text-on-primary hover:bg-primary-hover`}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}{' '}
            {pending ? 'Publishing…' : 'Publish'}
          </button>
        )}
      </div>
      {error && <p className="text-2xs text-danger">{error}</p>}
    </div>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'saving')
    return (
      <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-subtle">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving…
      </span>
    )
  if (state === 'saved')
    return (
      <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-success">
        <Check className="h-3.5 w-3.5" aria-hidden /> Saved
      </span>
    )
  return <span className="text-2xs font-medium text-subtle">Saves automatically</span>
}

// ── A builder section: a heading, its edit-mode callouts, then its fields. ──
function Section({
  title,
  anchor,
  editorNotes,
  children,
}: {
  title: string
  anchor: Parameters<typeof CircleCallouts>[0]['anchor']
  editorNotes: CircleDraft['editorNotes']
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold text-text">{title}</h2>
      <div className="mb-3">
        <CircleCallouts anchor={anchor} editorNotes={editorNotes} />
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">{label}</span>
      {children}
    </label>
  )
}

// A plain string-list editor for Agreements + Remix ideas: each row is editable,
// rows commit on blur, an add button appends, and an X removes.
function ListEditor({
  items,
  onChange,
  addLabel,
  placeholder,
}: {
  items: string[]
  onChange: (next: string[]) => void
  addLabel: string
  placeholder: string
}) {
  const [draftRows, setDraftRows] = useState(items)

  // Keep local rows in sync when the server truth changes (e.g. Vera filled them).
  if (JSON.stringify(items) !== JSON.stringify(draftRows) && items.length !== draftRows.length) {
    setDraftRows(items)
  }

  const commit = (rows: string[]) => {
    const cleaned = rows.map((r) => r.trim()).filter(Boolean)
    onChange(cleaned)
  }

  return (
    <div className="space-y-2">
      {draftRows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={row}
            onChange={(e) => {
              const next = [...draftRows]
              next[i] = e.target.value
              setDraftRows(next)
            }}
            onBlur={() => commit(draftRows)}
            placeholder={placeholder}
            className={FIELD}
          />
          <button
            type="button"
            aria-label="Remove"
            onClick={() => {
              const next = draftRows.filter((_, j) => j !== i)
              setDraftRows(next)
              commit(next)
            }}
            className="shrink-0 rounded-lg border border-border p-2 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setDraftRows([...draftRows, ''])}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-primary/40 hover:text-text"
      >
        <Plus className="h-4 w-4" aria-hidden /> {addLabel}
      </button>
    </div>
  )
}
