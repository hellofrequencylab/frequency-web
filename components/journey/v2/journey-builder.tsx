'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, ChevronDown, Eye, Layers, Lock, Sparkles, SlidersHorizontal } from 'lucide-react'
import { PageHeading } from '@/components/templates'
import { ImageUpload } from '@/components/ui/image-upload'
import { IconAccentFace, IconGrid } from '@/components/studio/kit/studio-identity'
import { DEFAULT_ACCENT, STUDIO_ACCENTS, accentColor } from '@/lib/studio/accents'
import { saveJourneyMeta } from '@/app/(main)/journeys/actions'
import { createJourneyDraftAction } from '@/app/(main)/journeys/create-actions'
import { EditableText } from './editable-text'

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

export function JourneyBuilder({
  draft = false,
  slug = null,
  planId = null,
  status = 'draft',
  initialTitle = '',
  initialSummary = null,
  initialCover = null,
  initialEmoji = null,
  initialAccent = null,
  vera,
  curriculum,
  settings,
}: {
  /** New-journey mode: nothing persists until the title is named. */
  draft?: boolean
  slug?: string | null
  planId?: string | null
  status?: string
  initialTitle?: string
  initialSummary?: string | null
  initialCover?: string | null
  initialEmoji?: string | null
  initialAccent?: string | null
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
            title="Edit icon and color"
            className="group/icn relative rounded-2xl outline-none ring-2 ring-transparent transition hover:ring-border focus-visible:ring-primary"
          >
            <IconAccentFace icon={icon} accent={accent} size="md" />
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-subtle shadow-sm group-hover/icn:text-text">
              <ChevronDown className="h-3 w-3" aria-hidden />
            </span>
          </button>
          {iconOpen && (
            <div className="absolute left-0 top-[3.75rem] z-30 w-64 rounded-2xl border border-border bg-surface p-3 text-left shadow-xl">
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
                      className={`flex h-7 w-7 items-center justify-center rounded-full border transition-transform hover:scale-110 ${on ? 'border-text' : 'border-border'}`}
                      style={{ backgroundColor: accentColor(a.key) }}
                    >
                      {on && <Check className="h-4 w-4 text-on-primary" aria-hidden />}
                    </button>
                  )
                })}
              </div>
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
      placeholder="One line on what this is and who it's for"
      ariaLabel="Journey subtitle"
      onSave={(s) => meta({ summary: s })}
      inputClassName="text-sm text-muted"
    />
  )

  const actions = (
    <div className="flex items-center gap-2">
      {!draft && slug && (
        <Link
          href={`/journeys/${slug}/learn`}
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text hover:bg-surface-elevated"
        >
          <Eye className="h-4 w-4" /> Preview
        </Link>
      )}
      <Link
        href="/journeys"
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
      >
        <ArrowLeft className="h-4 w-4" /> Done
      </Link>
    </div>
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

        <PageHeading eyebrow={eyebrow} title={title} description={description} actions={actions} />

        {/* Vera composer — full width, under the header line. */}
        <div className="mb-6">{draft ? <DraftGhostVera /> : vera}</div>

        {/* Body — curriculum (main) + the in-page Settings column (always shown; the global app
            right rail is the collapsible one, in the app shell). */}
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="min-w-0 flex-1">{draft ? <DraftGhostMain /> : curriculum}</div>

          <aside className="lg:w-[22rem] lg:shrink-0">
            <div className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-text">
              <SlidersHorizontal className="h-4 w-4 text-subtle" aria-hidden /> Settings
            </div>
            {draft ? <DraftGhostSidebar /> : settings}
          </aside>
        </div>
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
