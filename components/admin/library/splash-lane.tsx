'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  X,
  LayoutTemplate,
  GitBranch,
  ExternalLink,
  PencilLine,
  Layers,
  CalendarClock,
  Globe,
  QrCode,
  Target,
} from 'lucide-react'
import { splashUsageHref, type SplashTemplate } from '@/lib/library/splash-templates'
import type { LiveSplash, SplashUsage } from '@/lib/library/splash-registry'

// The Loom Studio Splash lane (docs/LOOM-PLATFORM.md §4, docs/PAGE-FRAMEWORK.md §10). Renders the
// code-drawn splash CATALOG (templates) as browse cards, and the GOVERNANCE list (live splashes) as
// status rows. Staff-gated by the page (requireAdmin) that mounts it.
//
// 🔴 §10 BOUNDARY made explicit in the UI: nothing here edits a block tree. A template card opens a
// read-only drawer whose only action DEEP-LINKS OUT to the real editor; a live-splash row's Edit is a
// plain link OUT (the Puck micro-site editor, or the QR studio). The Loom catalogs + governs; it is
// never the splash block editor.

/** A splash template plus its precomputed preview node (resolved in the Server Component) and its
 *  "Used in" index (public.library_usages, resolved server-side by sourceSlug). */
export type SplashTemplateCard = SplashTemplate & { preview: ReactNode; usages: SplashUsage[] }

/** A live splash plus its "Used in" index (public.library_usages, resolved server-side). */
export type LiveSplashCard = LiveSplash & { usages: SplashUsage[] }

const KIND_META: Record<SplashTemplate['kind'], { label: string; Icon: typeof LayoutTemplate }> = {
  template: { label: 'Template', Icon: LayoutTemplate },
  flow: { label: 'Flow', Icon: Layers },
}

const SOURCE_META: Record<LiveSplash['source'], { label: string; Icon: typeof Globe }> = {
  'micro-site': { label: 'Micro-site', Icon: Globe },
  qr: { label: 'QR', Icon: QrCode },
}

const STATUS_TONE: Record<string, string> = {
  published: 'border-signal text-signal-strong',
  active: 'border-signal text-signal-strong',
  draft: 'border-border-strong text-muted',
  coded: 'border-border text-subtle',
  inactive: 'border-border text-subtle',
}

function KindBadge({ kind }: { kind: SplashTemplate['kind'] }) {
  const { label, Icon } = KIND_META[kind]
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-2xs font-medium text-muted">
      <Icon className="h-3 w-3" aria-hidden /> {label}
    </span>
  )
}

function StatusChip({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'border-border text-subtle'
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide ${tone}`}>
      {status}
    </span>
  )
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function SplashLane({
  templates,
  live,
  show = 'all',
  view = 'cards',
}: {
  templates: SplashTemplateCard[]
  live: LiveSplashCard[]
  /** Which halves to render: all | templates | live | qr | micro. */
  show?: 'all' | 'templates' | 'live' | 'qr' | 'micro'
  view?: 'cards' | 'list'
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [openLiveId, setOpenLiveId] = useState<string | null>(null)
  const selected = templates.find((t) => t.id === openId) ?? null
  const selectedLive = live.find((l) => l.id === openLiveId) ?? null

  const showTemplates = show === 'all' || show === 'templates'
  const showLive = show === 'all' || show === 'live' || show === 'qr' || show === 'micro'
  const liveRows =
    show === 'qr' ? live.filter((l) => l.source === 'qr')
    : show === 'micro' ? live.filter((l) => l.source === 'micro-site')
    : live

  const empty = (showTemplates ? templates.length : 0) + (showLive ? liveRows.length : 0) === 0
  if (empty) {
    return (
      <div className="rounded-2xl border border-dashed border-border-strong px-6 py-16 text-center">
        <LayoutTemplate className="mx-auto mb-3 h-8 w-8 text-subtle" aria-hidden />
        <p className="text-base text-muted">No splashes match.</p>
        <p className="mt-1 text-sm text-subtle">Try clearing the search or picking another folder.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── (a) CATALOG — templates, browse cards ─────────────────────────────── */}
      {showTemplates && templates.length > 0 && (
        <section>
          <h3 className="mb-3 font-display text-sm uppercase tracking-wide text-subtle">Templates</h3>
          {view === 'list' ? (
            <div className="overflow-hidden rounded-2xl border border-border">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setOpenId(t.id)}
                  className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-surface-elevated"
                >
                  <span className="block h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-elevated">{t.preview}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-text" title={t.title}>{t.title}</span>
                  <KindBadge kind={t.kind} />
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-pop"
                >
                  <button type="button" onClick={() => setOpenId(t.id)} className="block w-full text-left">
                    <span className="block aspect-[4/3] overflow-hidden bg-surface-elevated transition-transform duration-200 group-hover:scale-[1.02]">
                      {t.preview}
                    </span>
                    <span className="block px-3 py-2">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-text" title={t.title}>{t.title}</span>
                        <span className="shrink-0 text-2xs uppercase tracking-wide text-subtle">Splash</span>
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        <KindBadge kind={t.kind} />
                      </span>
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── (b) GOVERNANCE — live splashes, status rows with a deep-link-out Edit ─ */}
      {showLive && liveRows.length > 0 && (
        <section>
          <h3 className="mb-3 font-display text-sm uppercase tracking-wide text-subtle">Live splashes</h3>
          <div className="overflow-hidden rounded-2xl border border-border">
            {liveRows.map((l) => {
              const { label: sourceLabel, Icon: SourceIcon } = SOURCE_META[l.source]
              const when = fmtDate(l.schedule)
              return (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-3 py-2.5 last:border-b-0 hover:bg-surface-elevated"
                >
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-2xs font-medium text-muted">
                    <SourceIcon className="h-3 w-3" aria-hidden /> {sourceLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenLiveId(l.id)}
                    className="min-w-0 flex-1 truncate text-left text-sm text-text hover:underline"
                    title={l.title}
                  >
                    {l.title}
                  </button>
                  <StatusChip status={l.status} />
                  {l.target && (
                    <span className="hidden min-w-0 max-w-[14rem] items-center gap-1 truncate text-xs text-subtle sm:inline-flex" title={l.target}>
                      <Target className="h-3 w-3 shrink-0" aria-hidden /> {l.target}
                    </span>
                  )}
                  {when && (
                    <span className="hidden shrink-0 items-center gap-1 text-xs text-subtle md:inline-flex">
                      <CalendarClock className="h-3 w-3" aria-hidden /> {when}
                    </span>
                  )}
                  <Link
                    href={l.editHref}
                    className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-border-strong px-2.5 py-1 text-xs font-semibold text-text hover:bg-surface"
                    title={l.editLabel}
                  >
                    <PencilLine className="h-3.5 w-3.5" aria-hidden /> Edit
                    <ExternalLink className="h-3 w-3 text-subtle" aria-hidden />
                  </Link>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-subtle">
            Editing opens the real editor: the Puck page editor for a micro-site, the QR studio for a QR
            splash. The Loom catalogs and governs; it does not edit the splash here.
          </p>
        </section>
      )}

      {selected && <TemplateDrawer template={selected} onClose={() => setOpenId(null)} />}
      {selectedLive && <LiveSplashDrawer splash={selectedLive} onClose={() => setOpenLiveId(null)} />}
    </div>
  )
}

/** The "Used in" index (public.library_usages): each surface a splash asset lands on, deep-linked OUT
 *  to its editor when one exists (a page usage → the Puck micro-site editor). Empty → a quiet line. */
function UsageList({ usages }: { usages: SplashUsage[] }) {
  if (usages.length === 0) {
    return <p className="text-sm text-subtle">Not referenced yet</p>
  }
  return (
    <ul className="space-y-1.5">
      {usages.map((u, i) => {
        const href = splashUsageHref(u.context, u.refId)
        const label = u.refId ?? u.context
        return (
          <li
            key={`${u.context}:${u.refId ?? ''}:${u.blockId ?? ''}:${i}`}
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm"
          >
            <span className="shrink-0 rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-subtle">
              {u.context}
            </span>
            {href ? (
              <Link href={href} className="inline-flex items-center gap-1 font-medium text-primary-strong hover:underline">
                {label}
                <ExternalLink className="h-3 w-3 text-subtle" aria-hidden />
              </Link>
            ) : (
              <span className="min-w-0 truncate text-text" title={label}>{label}</span>
            )}
            {u.blockId && <span className="text-xs text-subtle">block {u.blockId}</span>}
          </li>
        )
      })}
    </ul>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-subtle">{label}</p>
      <div className="text-sm text-text">{children}</div>
    </div>
  )
}

function TemplateDrawer({ template, onClose }: { template: SplashTemplateCard; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Splash template">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-slat/40" />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-lg uppercase text-text">Splash template</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-subtle hover:bg-surface-elevated" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="flex h-56 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface-elevated">
            {template.preview}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-text" title={template.title}>
                {template.title}
              </h3>
              <KindBadge kind={template.kind} />
            </div>
            <p className="text-xs text-subtle">Splash{template.sourceSlug ? ` · from ${template.sourceSlug}` : ''}</p>
            <p className="pt-1 text-sm text-muted">{template.description}</p>
          </div>

          {/* Source — code is the source of truth; the Loom indexes it read-only (§10). */}
          <div className="rounded-2xl border border-border bg-surface-elevated/50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
              <GitBranch className="h-4 w-4 text-primary-strong" aria-hidden /> Source: code
            </p>
            <p className="mt-1 text-xs text-subtle">
              This template is drawn from code. The Loom catalogs it; the splash itself is composed in the
              real editor, never as blocks here.
            </p>
          </div>

          <Field label="Compose">
            <Link
              href={template.composeHref}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border-strong px-3 py-1.5 text-sm font-semibold text-text hover:bg-surface-elevated"
            >
              {template.composeLabel}
              <ExternalLink className="h-3.5 w-3.5 text-subtle" aria-hidden />
            </Link>
          </Field>

          <Field label="Used in">
            <UsageList usages={template.usages} />
          </Field>
        </div>
      </div>
    </div>
  )
}

function LiveSplashDrawer({ splash, onClose }: { splash: LiveSplashCard; onClose: () => void }) {
  const { label: sourceLabel, Icon: SourceIcon } = SOURCE_META[splash.source]
  const when = fmtDate(splash.schedule)
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Live splash">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-slat/40" />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-lg uppercase text-text">Live splash</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-subtle hover:bg-surface-elevated" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-text" title={splash.title}>
                {splash.title}
              </h3>
              <StatusChip status={splash.status} />
            </div>
            <p className="inline-flex items-center gap-1.5 text-xs text-subtle">
              <SourceIcon className="h-3.5 w-3.5" aria-hidden /> {sourceLabel}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <Field label="Source">{sourceLabel}</Field>
            <Field label="Status">{splash.status}</Field>
            {splash.target && (
              <Field label="Target">
                <span className="inline-flex items-center gap-1.5 break-words">
                  <Target className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden /> {splash.target}
                </span>
              </Field>
            )}
            {when && (
              <Field label="Schedule">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5 text-subtle" aria-hidden /> {when}
                </span>
              </Field>
            )}
          </div>

          {/* The only action DEEP-LINKS OUT to the real editor; the Loom never edits the splash here (§10). */}
          <Field label="Edit">
            <Link
              href={splash.editHref}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border-strong px-3 py-1.5 text-sm font-semibold text-text hover:bg-surface-elevated"
              title={splash.editLabel}
            >
              <PencilLine className="h-3.5 w-3.5" aria-hidden /> {splash.editLabel}
              <ExternalLink className="h-3.5 w-3.5 text-subtle" aria-hidden />
            </Link>
          </Field>

          <Field label="Used in">
            <UsageList usages={splash.usages} />
          </Field>

          <p className="text-xs text-subtle">
            Editing opens the real editor: the Puck page editor for a micro-site, the QR studio for a QR
            splash. The Loom catalogs and governs; it does not edit the splash here.
          </p>
        </div>
      </div>
    </div>
  )
}
