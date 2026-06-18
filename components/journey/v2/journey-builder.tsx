'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Camera, Eye, Layers, Lock, Sparkles, SlidersHorizontal, Save, Send, Loader2, ListChecks, Gem, Clock, BarChart3 } from 'lucide-react'
import { ImageUpload } from '@/components/ui/image-upload'
import { IconAccentFace, IconGrid } from '@/components/studio/kit/studio-identity'
import { DEFAULT_ACCENT, STUDIO_ACCENTS, accentColor } from '@/lib/studio/accents'
import { saveJourneyMeta, setJourneyVisibility, adoptJourney } from '@/app/(main)/journeys/actions'
import { createJourneyDraftAction } from '@/app/(main)/journeys/create-actions'
import { isError } from '@/lib/action-result'
import type { PlanVisibility } from '@/lib/journey-plans'
import { EditableText } from './editable-text'

/** Quick-stats shown in the header's "Journey Details" card. */
export interface JourneyDetailsData {
  phases: number
  steps: number
  completionGems: number
  dailyMinutes: number | null
  difficulty: string | null
}

// Journeys v2 — the SINGLE-PAGE editor shell (ADR-301). Laid out like the Journey it builds and
// following course-builder best practice: a cover band up top, then the identity row (icon + accent
// picker beside a click-to-edit Title + subtitle), then Vera's four-Pillar composer FULL WIDTH, then
// a two-column body — the curriculum in the main column and ALL settings in a collapsible right rail.
// No tabs; every field autosaves on blur.
//
// DEFERRED CREATION: on `/journeys/new` the shell runs in `draft` mode and persists NOTHING until the
// author names the Journey. Committing a title calls createJourneyDraftAction (creates the row + the
// standard three phases) and drops them into the live editor. No untitled drafts from a button press.

function StatusPill({ status }: { status: string }) {
  const live = status === 'published' || status === 'approved'
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-2xs font-semibold ${live ? 'bg-primary-bg text-primary-strong' : 'bg-surface-elevated text-muted'}`}>
      {live ? 'Published' : 'Draft'}
    </span>
  )
}

// The Save Draft / Preview / Publish action set — at the TOP of the header and again at the FOOT of
// the editor. The convention (owner's button-convention pass): every field autosaves on blur, so
// SAVE DRAFT just flips to VIEW mode (/learn), where the control reads "Edit Journey" — "Save Draft
// becomes Edit when clicked". PUBLISH publishes to the community library, turns to "Published", and
// lands on the published page. Once live, the control reads "Published" (unpublish lives in Settings).
function JourneyActions({
  slug,
  planId,
  visibility,
  hasAnchor = null,
  align = 'right',
}: {
  slug: string | null
  planId: string | null
  visibility: PlanVisibility
  /** Whether an Anchor practice exists (Master Template). `false` warns before save/publish; `null`
   *  (unknown — the page didn't compute it) never warns. */
  hasAnchor?: boolean | null
  /** 'left' aligns the column to the start (the foot bar); 'right' is the header default. */
  align?: 'left' | 'right'
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [justPublished, setJustPublished] = useState(false)
  const [adopt, setAdopt] = useState(true)
  const [note, setNote] = useState<string | null>(null)
  // The no-anchor warning is non-blocking: the first save/publish without an Anchor shows it and
  // holds; a second click proceeds. Once acknowledged, it stays acknowledged for the session.
  const [anchorAck, setAnchorAck] = useState(false)
  const missingAnchor = hasAnchor === false
  const live = visibility === 'public' || justPublished
  const viewHref = slug ? `/journeys/${slug}/learn` : '/journeys'

  // Save Draft → View mode. Fields already autosave on blur, so this just takes the author to the
  // course view, where the control becomes "Edit Journey". A missing Anchor warns once first.
  const saveAndView = () => {
    if (!slug) return
    if (missingAnchor && !anchorAck) { setAnchorAck(true); return }
    start(() => router.push(viewHref))
  }

  // Publish to the community library, then land on the now-published page. A missing Anchor warns
  // once first (non-blocking — a second click publishes anyway).
  const publish = () => {
    if (!planId || !slug) return
    if (missingAnchor && !anchorAck) { setAnchorAck(true); return }
    setNote(null)
    start(async () => {
      const res = await setJourneyVisibility(planId, 'public')
      if (isError(res)) { setNote(res.error); return }
      // Optionally adopt it for yourself too, so you can run it from On Air.
      if (adopt) await adoptJourney(planId)
      setJustPublished(true)
      router.push(viewHref)
    })
  }

  const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-60'
  return (
    <div className={`flex flex-col gap-1 ${align === 'left' ? 'items-start' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={saveAndView} disabled={pending || !slug} className={`${btn} border border-border text-text hover:bg-surface-elevated`}>
          <Save className="h-4 w-4" /> Save Draft
        </button>
        {slug && (
          <Link href={viewHref} target="_blank" className={`${btn} border border-border text-text hover:bg-surface-elevated`}>
            <Eye className="h-4 w-4" /> Preview
          </Link>
        )}
        {live ? (
          <Link href={viewHref} className={`${btn} border border-success/40 bg-success-bg text-success`}>
            <Check className="h-4 w-4" /> Published
          </Link>
        ) : (
          <>
            <button type="button" onClick={publish} disabled={pending} className={`${btn} bg-primary text-on-primary hover:bg-primary-hover`}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {pending ? 'Publishing…' : 'Publish'}
            </button>
            <label
              title="Assign yourself every practice so you can run it from On Air."
              className="inline-flex items-center gap-1.5 text-sm text-muted"
            >
              <input
                type="checkbox"
                checked={adopt}
                onChange={(e) => setAdopt(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              Adopt it for myself
            </label>
          </>
        )}
      </div>
      {note && <p className="text-2xs text-danger">{note}</p>}
      {missingAnchor && anchorAck && !live && (
        // Non-blocking nudge: the Master Template recommends an Anchor but never requires one. After
        // this shows, the same button proceeds on the next click.
        <p className="max-w-md text-2xs text-warning">
          No anchor practice set. Journeys build habits best with one daily through-line. You can add one, or continue.
        </p>
      )}
    </div>
  )
}

// The "Journey Details" quick-stats card, top-right of the header — phases, steps, daily time,
// completion reward, difficulty. A compact read-only snapshot so the author sees the shape of the
// course at a glance without opening Settings.
function JourneyDetails({ status, visibility, details }: { status: string; visibility: PlanVisibility; details: JourneyDetailsData }) {
  const vis = visibility === 'public' ? 'Public' : visibility === 'unlisted' ? 'Unlisted' : 'Private'
  const rows: { icon: typeof Layers; label: string; value: string }[] = [
    { icon: Layers, label: 'Phases', value: String(details.phases) },
    { icon: ListChecks, label: 'Steps', value: String(details.steps) },
    { icon: Clock, label: 'Daily time', value: details.dailyMinutes ? `${details.dailyMinutes} min` : 'Not set' },
    { icon: Gem, label: 'Completion', value: `${details.completionGems} gems` },
    { icon: BarChart3, label: 'Difficulty', value: details.difficulty ? details.difficulty[0].toUpperCase() + details.difficulty.slice(1) : 'Not set' },
  ]
  return (
    <div className="w-full rounded-2xl border border-border bg-surface p-3.5 lg:w-72">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-subtle">Journey Details</span>
        <span className="inline-flex items-center gap-1 text-2xs font-medium text-muted">
          <StatusPill status={status} /> · {vis}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-1.5">
            <r.icon className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
            <dt className="sr-only">{r.label}</dt>
            <dd className="min-w-0">
              <span className="block truncate text-sm font-bold tabular-nums text-text">{r.value}</span>
              <span className="block text-2xs text-subtle">{r.label}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function JourneyBuilder({
  draft = false,
  slug = null,
  planId = null,
  status = 'draft',
  visibility = 'private',
  initialTitle = '',
  initialSummary = null,
  initialCover = null,
  initialEmoji = null,
  initialAccent = null,
  initialIntro = null,
  details = null,
  hasAnchor = null,
  vera,
  curriculum,
  settings,
}: {
  /** New-journey mode: nothing persists until the title is named. */
  draft?: boolean
  slug?: string | null
  planId?: string | null
  status?: string
  visibility?: PlanVisibility
  initialTitle?: string
  initialSummary?: string | null
  initialCover?: string | null
  initialEmoji?: string | null
  initialAccent?: string | null
  /** The story/overview write-up, shown above the curriculum (moved out of Settings). */
  initialIntro?: string | null
  /** Quick stats for the header's Journey Details card (edit mode). */
  details?: JourneyDetailsData | null
  /** Whether an Anchor practice exists (Master Template). Computed by the page (which holds the
   *  blocks); `false` warns before save/publish, `null`/unset never warns. */
  hasAnchor?: boolean | null
  /** Vera's four-Pillar composer — rendered full-width above the body (edit mode). */
  vera?: ReactNode
  /** The curriculum editor (phases) — main column, edit mode. */
  curriculum?: ReactNode
  /** The settings panel for the right rail — edit mode. */
  settings?: ReactNode
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [cover, setCover] = useState<string | null>(initialCover)
  const [icon, setIcon] = useState(initialEmoji ?? 'compass')
  const [accent, setAccent] = useState(initialAccent ?? DEFAULT_ACCENT)
  const [iconOpen, setIconOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const pickerRef = useRef<HTMLSpanElement>(null)

  // Close the icon/color popover on an outside click or Escape (it used to get stuck open).
  useEffect(() => {
    if (!iconOpen) return
    const onDown = (e: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setIconOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIconOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [iconOpen])

  const meta = (patch: Parameters<typeof saveJourneyMeta>[1]) => {
    if (!planId) return
    start(async () => {
      await saveJourneyMeta(planId, patch)
      router.refresh()
    })
  }

  // Draft: naming the Journey is the only thing that persists. It creates the row (+ standard phases)
  // and redirects into the live editor.
  const createFromTitle = (title: string) => {
    if (!title.trim() || creating) return
    setCreating(true)
    start(() => createJourneyDraftAction(title.trim()))
  }

  const eyebrow = (
    <span className="inline-flex items-center gap-2">
      Studio · Journey {!draft && <StatusPill status={status} />}
    </span>
  )

  // Identity row: the icon/accent picker sits BESIDE the title (one intentional picker — no loose
  // accent dots in the sidebar), then the click-to-edit Title.
  const title = (
    <span className="flex items-center gap-3">
      {!draft && planId && (
        <span ref={pickerRef} className="relative shrink-0 font-normal">
          {/* A clearly-tappable trigger: the icon tile + a caret badge + a hover ring, so it
              reads as an "edit icon and color" button (not flat decoration). */}
          <button
            type="button"
            onClick={() => setIconOpen((v) => !v)}
            aria-expanded={iconOpen}
            title="Set a logo image, icon, or color"
            className="group/icn relative rounded-2xl outline-none ring-2 ring-transparent transition hover:ring-border focus-visible:ring-primary"
          >
            {cover && /^https:\/\//i.test(cover) ? (
              // The uploaded image doubles as the Journey's logo (build item 1). next/image (the
              // Supabase Storage host is allowlisted in next.config); guarded to https so the URL
              // can never carry a javascript:/data: scheme.
              <Image src={cover} alt="" width={56} height={56} unoptimized className="h-14 w-14 rounded-2xl object-cover" />
            ) : (
              <IconAccentFace icon={icon} accent={accent} size="md" />
            )}
            {/* A camera badge cues that the logo is clickable (build item 1). */}
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-subtle shadow-sm group-hover/icn:text-text">
              <Camera className="h-3 w-3" aria-hidden />
            </span>
          </button>
          {iconOpen && (
            <div className="absolute left-0 top-[3.75rem] z-30 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface p-3 text-left shadow-xl">
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">Icon</p>
              {/* Picking an icon closes the popover (clear commit). */}
              <IconGrid value={icon} size="sm" onPick={(k) => { setIcon(k); meta({ emoji: k }); setIconOpen(false) }} />
              <p className="mb-1.5 mt-3 text-2xs font-semibold uppercase tracking-wide text-subtle">Color</p>
              <div className="flex flex-wrap gap-2">
                {STUDIO_ACCENTS.map((a) => {
                  const on = accent === a.key
                  return (
                    <button
                      key={a.key}
                      type="button"
                      aria-label={a.label}
                      aria-pressed={on}
                      title={a.label}
                      onClick={() => { setAccent(a.key); meta({ accent: a.key }) }}
                      className={`flex h-8 w-8 items-center justify-center rounded-full border transition-transform hover:scale-110 ${on ? 'border-text' : 'border-border'}`}
                      style={{ backgroundColor: accentColor(a.key) }}
                    >
                      {on && <Check className="h-4 w-4 text-on-primary" aria-hidden />}
                    </button>
                  )
                })}
              </div>
              {/* Or upload an image to use as the Journey's logo (build item 1). It doubles as the
                  cover, so the small face + the cover band stay in sync. */}
              <p className="mb-1.5 mt-3 text-2xs font-semibold uppercase tracking-wide text-subtle">Logo image</p>
              <ImageUpload
                label="Upload an image"
                value={cover}
                onChange={(url) => { setCover(url ?? null); meta({ coverImage: url }) }}
                folder="journey-covers"
                hint="Used as the Journey's logo and cover. Replaces the icon."
              />
            </div>
          )}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <EditableText
          value={draft ? '' : initialTitle}
          placeholder="Name your Journey"
          autoFocus={draft}
          ariaLabel="Journey title"
          onSave={draft ? createFromTitle : (t) => meta({ title: t })}
          inputClassName="text-xl font-bold text-text sm:text-2xl"
        />
      </span>
    </span>
  )

  const description = draft ? (
    <span className="block px-1 text-sm text-subtle">Name your Journey first, then add a one-line subtitle.</span>
  ) : (
    <EditableText
      value={initialSummary ?? ''}
      placeholder="A line or two on what this is and who it's for"
      ariaLabel="Journey subtitle"
      onSave={(s) => meta({ summary: s })}
      inputClassName="text-sm text-muted"
      multiline
      rows={3}
    />
  )

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Cover header — up top, the standard upload band with an Upload overlay. */}
        <div className="mb-5">
          {draft ? (
            <div className="flex h-32 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm text-subtle">
              <Lock className="h-4 w-4" aria-hidden /> Add a cover photo once you name it
            </div>
          ) : (
            <ImageUpload
              label="Cover"
              value={cover}
              onChange={(url) => {
                setCover(url)
                meta({ coverImage: url })
              }}
              folder="journey-covers"
              hint="Shown on the Journey's page and cards."
            />
          )}
        </div>

        {/* Header — a two-column band: the identity (eyebrow/status, title, subtitle) + the action
            set on the left, and the Journey Details quick-stats card on the right. */}
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-strong">{eyebrow}</div>
            <div className="text-text">{title}</div>
            {/* No max-width: title + subtitle share the column width, so their right edges line up. */}
            <div className="mt-1.5">{description}</div>
            {/* Save / Preview / Publish sit UNDER the title + subtitle (build item 2). */}
            {!draft && (
              <div className="mt-4">
                <JourneyActions slug={slug} planId={planId} visibility={visibility} hasAnchor={hasAnchor} />
              </div>
            )}
            {draft && (
              <Link href="/journeys" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-text">
                <ArrowLeft className="h-4 w-4" /> Back to Journeys
              </Link>
            )}
          </div>
          {/* Journey Details quick-stats card stays top-right. */}
          {!draft && details && (
            <div className="w-full shrink-0 lg:w-72">
              <JourneyDetails status={status} visibility={visibility} details={details} />
            </div>
          )}
        </header>

        {/* Vera composer — full width, under the header line. */}
        <div className="mb-6">{draft ? <DraftGhostVera /> : vera}</div>

        {/* Body — curriculum (main) + the in-page Settings column (always shown; the global app
            right rail is the collapsible one, in the app shell). */}
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="min-w-0 flex-1">
            {draft ? (
              <DraftGhostMain />
            ) : (
              <>
                {/* Introductory write-up — the story/overview, moved out of Settings to sit above
                    the curriculum (the reader's first thing). */}
                <div className="mb-6">
                  <p className="mb-1.5 text-sm font-bold text-text">Introduction</p>
                  <EditableText
                    value={initialIntro ?? ''}
                    placeholder="The why, the how, what they'll get from it. A few lines is plenty."
                    ariaLabel="Journey introduction"
                    onSave={(t) => meta({ intro: t })}
                    inputClassName="text-sm leading-relaxed text-text"
                    multiline
                    rows={4}
                  />
                </div>
                {curriculum}
              </>
            )}
          </div>

          <aside className="lg:w-[22rem] lg:shrink-0">
            <div className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-text">
              <SlidersHorizontal className="h-4 w-4 text-subtle" aria-hidden /> Settings
            </div>
            {draft ? <DraftGhostSidebar /> : settings}
          </aside>
        </div>

        {/* Foot action bar — the same Save Draft / Preview / Publish set, left-aligned (owner's
            button-convention pass), so the author never has to scroll back up after a long curriculum. */}
        {!draft && (
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-5">
            <JourneyActions slug={slug} planId={planId} visibility={visibility} hasAnchor={hasAnchor} align="left" />
            <span className="text-2xs text-subtle">Every field saves automatically as you go.</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Draft-mode placeholders — the page reads whole from the first moment, inert until it is named
//    (so naming, not a button press, is what creates the Journey). ──

function DraftGhostVera() {
  return (
    <div className="rounded-2xl border border-dashed border-primary/30 bg-primary-bg/10 p-4 opacity-70" aria-hidden>
      <p className="flex items-center gap-2 text-base font-bold text-text">
        <Sparkles className="h-5 w-5 text-primary-strong" /> Build your Journey with Vera
      </p>
      <p className="mt-1 text-sm text-muted">
        Name your Journey, then describe it and Vera fills a balanced four-Pillar week (Mind, Body, Spirit, Expression).
      </p>
    </div>
  )
}

function DraftGhostMain() {
  return (
    <div className="space-y-4 opacity-70" aria-hidden>
      <header>
        <h2 className="text-base font-bold text-text">Curriculum</h2>
        <p className="text-sm text-muted">Three phases are ready to fill the moment you name your Journey.</p>
      </header>
      {[1, 2, 3].map((n) => (
        <div key={n} className="rounded-2xl border border-border bg-surface p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-text">
            <Layers className="h-4 w-4 text-subtle" /> Phase {n}
          </p>
          <p className="mt-1 text-xs text-subtle">Ready to edit once your Journey has a name.</p>
        </div>
      ))}
    </div>
  )
}

function DraftGhostSidebar() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface p-4 opacity-70" aria-hidden>
      <p className="text-sm font-semibold text-text">Settings</p>
      <p className="mt-1 text-xs text-muted">
        Cover, story, visibility, rewards, delivery, and the advanced options unlock once your Journey has a name.
      </p>
    </div>
  )
}
