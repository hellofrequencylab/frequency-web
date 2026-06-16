'use client'

import type { ReactNode } from 'react'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, Layers, Lock, Sparkles } from 'lucide-react'
import { HeaderSidebarTemplate } from '@/components/templates'
import { ImageUpload } from '@/components/ui/image-upload'
import { saveJourneyMeta } from '@/app/(main)/journeys/actions'
import { createJourneyDraftAction } from '@/app/(main)/journeys/create-actions'
import { EditableText } from './editable-text'

// Journeys v2 — the SINGLE-PAGE editor shell (ADR-301, supersedes the tabbed builder). One page,
// laid out like the Journey it builds: a cover header up top (standard upload), a click-to-edit
// Title + subtitle, the curriculum (Vera's four-Pillar composer + the phases) in the main column,
// and ALL settings in a right sidebar — the new Header + sidebar template (HeaderSidebarTemplate).
// Details, Settings, and Curriculum now live together; there are no tabs.
//
// DEFERRED CREATION: on `/journeys/new` the shell runs in `draft` mode and persists NOTHING until
// the author names the Journey. Committing a title calls createJourneyDraftAction (creates the row
// + three phases) and drops them into the live editor. No untitled drafts from "pushing the button".
// Existing Journeys autosave every field on blur, so there is no Save button — Done just returns.

function StatusPill({ status }: { status: string }) {
  const live = status === 'published' || status === 'approved'
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-2xs font-semibold ${
        live ? 'bg-primary-bg text-primary-strong' : 'bg-surface-elevated text-muted'
      }`}
    >
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
  /** The curriculum editor (Vera composer + phases) — only in edit mode. */
  curriculum?: ReactNode
  /** The settings panel for the sidebar — only in edit mode. */
  settings?: ReactNode
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [cover, setCover] = useState<string | null>(initialCover)
  const [creating, setCreating] = useState(false)

  const meta = (patch: Parameters<typeof saveJourneyMeta>[1]) => {
    if (!planId) return
    start(async () => {
      await saveJourneyMeta(planId, patch)
      router.refresh()
    })
  }

  // Draft: naming the Journey is the only thing that persists. It creates the row (+ 3 phases) and
  // redirects into the live editor.
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

  const title = (
    <EditableText
      value={draft ? '' : initialTitle}
      placeholder="Name your Journey"
      autoFocus={draft}
      ariaLabel="Journey title"
      onSave={draft ? createFromTitle : (t) => meta({ title: t })}
      inputClassName="text-xl font-bold text-text sm:text-2xl"
    />
  )

  const description = draft ? (
    <span className="block px-1.5 text-sm text-subtle">Name your Journey first, then add a one-line subtitle.</span>
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
      <div className="mx-auto max-w-5xl">
        {/* Cover header — up top, propagated as the standard upload band with an Upload overlay. */}
        <div className="mb-6">
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

        <HeaderSidebarTemplate
          eyebrow={eyebrow}
          title={title}
          description={description}
          actions={actions}
          sidebarWidth="wide"
          sidebar={draft ? <DraftGhostSidebar /> : settings}
        >
          {draft ? <DraftGhostMain /> : curriculum}
        </HeaderSidebarTemplate>
      </div>
    </div>
  )
}

// What the editor will hold, shown inert until the Journey is named (so the page reads whole from
// the first moment without creating an untitled draft).
function DraftGhostMain() {
  return (
    <div className="space-y-4 opacity-60" aria-hidden>
      <div className="rounded-2xl border border-dashed border-border bg-surface p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-text">
          <Sparkles className="h-4 w-4 text-primary-strong" /> Build it with Vera
        </p>
        <p className="mt-1 text-xs text-muted">
          Name your Journey, then describe it and Vera fills a balanced four-Pillar week (Mind, Body, Spirit, Expression).
        </p>
      </div>
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
        Cover, story, visibility, rewards, and delivery unlock once your Journey has a name.
      </p>
    </div>
  )
}
