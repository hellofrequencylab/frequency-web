'use client'

import { useState, type ReactNode } from 'react'
import {
  X,
  Blocks,
  AppWindow,
  LayoutTemplate,
  PanelLeft,
  Shapes,
  GitBranch,
  Lock,
  ShieldCheck,
  Sliders,
  Link2,
  History,
} from 'lucide-react'
import type { AppLibraryItem } from '@/lib/apps/app-registry'
import type { AppSurfaceKind } from '@/lib/apps/types'

// The Loom Studio Apps lane (LP5b, docs/LOOM-PLATFORM.md §4). Renders the code-drawn App catalog as
// browse cards in the shared grid; clicking a card opens a read-only detail drawer (what the App is,
// its surfaces, gate, config schema, and where it lives). Staff-gated by the page (requireAdmin).
// The App is Layer-1 source: git is the source of truth, so nothing here edits it — the drawer indexes.

/** A browse row plus its precomputed preview node (resolved in the Server Component, RSC-slot style). */
export type AppCard = AppLibraryItem & { preview: ReactNode }

const SURFACE_META: Record<AppSurfaceKind, { label: string; Icon: typeof AppWindow }> = {
  editor: { label: 'Editor', Icon: AppWindow },
  page: { label: 'Page', Icon: LayoutTemplate },
  rail: { label: 'Rail', Icon: PanelLeft },
  element: { label: 'Element', Icon: Shapes },
}

const STATUS_TONE: Record<AppLibraryItem['status'], string> = {
  draft: 'border-border text-subtle',
  in_review: 'border-border-strong text-muted',
  approved: 'border-signal text-signal-strong',
  final: 'border-primary text-primary-strong',
  archived: 'border-border text-subtle',
}

function SurfaceBadge({ surface }: { surface: AppSurfaceKind }) {
  const { label, Icon } = SURFACE_META[surface]
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-2xs font-medium text-muted">
      <Icon className="h-3 w-3" aria-hidden /> {label}
    </span>
  )
}

export function AppsLane({ items, view = 'cards' }: { items: AppCard[]; view?: 'cards' | 'list' }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const selected = items.find((a) => a.id === openId) ?? null

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-strong px-6 py-16 text-center">
        <Blocks className="mx-auto mb-3 h-8 w-8 text-subtle" aria-hidden />
        <p className="text-base text-muted">No Apps match.</p>
        <p className="mt-1 text-sm text-subtle">Try clearing the search or picking another folder.</p>
      </div>
    )
  }

  return (
    <>
      {view === 'list' ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          {items.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setOpenId(a.id)}
              className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-surface-elevated"
            >
              <span className="block h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-elevated">
                {a.preview}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-text" title={a.title}>
                {a.title}
              </span>
              <span className="hidden w-24 shrink-0 truncate text-xs text-subtle sm:block">{a.categoryLabel}</span>
              <span className="hidden shrink-0 gap-1 md:flex">
                {a.surfaces.map((s) => (
                  <SurfaceBadge key={s} surface={s} />
                ))}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((a, i) => {
            const featured = i === 0
            return (
              <div
                key={a.id}
                className={`group relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-pop ${
                  featured ? 'col-span-2 sm:col-span-1' : ''
                }`}
              >
                <button type="button" onClick={() => setOpenId(a.id)} className="block w-full text-left">
                  <span className="block aspect-[4/3] overflow-hidden bg-surface-elevated transition-transform duration-200 group-hover:scale-[1.02]">
                    {a.preview}
                  </span>
                  <span className="block px-3 py-2">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-text" title={a.title}>
                        {a.title}
                      </span>
                      <span className="shrink-0 text-2xs uppercase tracking-wide text-subtle">{a.categoryLabel}</span>
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {a.surfaces.map((s) => (
                        <SurfaceBadge key={s} surface={s} />
                      ))}
                    </span>
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {selected && <AppDrawer app={selected} onClose={() => setOpenId(null)} />}
    </>
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

function AppDrawer({ app, onClose }: { app: AppCard; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="App details">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-slat/40" />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-lg uppercase text-text">App</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-subtle hover:bg-surface-elevated"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Preview + identity. */}
          <div className="flex h-56 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface-elevated">
            {app.preview}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-text" title={app.title}>
                {app.title}
              </h3>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide ${STATUS_TONE[app.status]}`}
              >
                {app.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-subtle">
              {app.categoryLabel} · v{app.version}
            </p>
            {app.description && <p className="pt-1 text-sm text-muted">{app.description}</p>}
          </div>

          {/* Surfaces. */}
          <Field label="Surfaces">
            <div className="flex flex-wrap gap-1.5">
              {app.surfaces.map((s) => (
                <SurfaceBadge key={s} surface={s} />
              ))}
            </div>
          </Field>

          {/* Gate. */}
          <Field label="Gate">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-elevated px-2.5 py-1 text-sm text-text">
              {app.gate.system === 'none' ? (
                <ShieldCheck className="h-4 w-4 text-signal-strong" aria-hidden />
              ) : (
                <Lock className="h-4 w-4 text-subtle" aria-hidden />
              )}
              {app.gateLabel}
            </span>
          </Field>

          {/* Config schema (read-only). */}
          <Field label="Config schema">
            {app.config.length === 0 ? (
              <p className="flex items-center gap-1.5 text-sm text-subtle">
                <Sliders className="h-4 w-4" aria-hidden /> No configurable fields.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {app.config.map((f) => (
                  <li key={f.key} className="flex items-baseline justify-between gap-3 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-text">
                        {f.label}
                        {f.required && <span className="ml-1 text-danger">*</span>}
                      </span>
                      {f.description && <span className="block truncate text-xs text-subtle">{f.description}</span>}
                    </span>
                    <span className="shrink-0 rounded-md bg-surface-elevated px-1.5 py-0.5 text-2xs font-medium text-muted">
                      {f.type}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Field>

          {/* Connections (external wiring the App declares). */}
          {app.connections.length > 0 && (
            <Field label="Connections">
              <ul className="space-y-1">
                {app.connections.map((c) => (
                  <li key={c.id} className="flex items-center gap-1.5 text-sm text-text">
                    <Link2 className="h-4 w-4 text-subtle" aria-hidden />
                    {c.label}
                    {c.required && <span className="text-2xs text-subtle">(required)</span>}
                  </li>
                ))}
              </ul>
            </Field>
          )}

          {/* Source — Layer 1 is read-only: git is the source of truth (docs/LOOM-PLATFORM.md §10). */}
          <div className="rounded-2xl border border-border bg-surface-elevated/50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
              <GitBranch className="h-4 w-4 text-primary-strong" aria-hidden /> Source: code
            </p>
            <p className="mt-1 text-xs text-subtle">
              This App is drawn from code, versioned in git. The Loom indexes it read-only; a version bump
              is a commit. Config and placement are edited as data, never the source.
            </p>
          </div>

          {/* Used in — the "help section for assets" index (docs/LOOM-PLATFORM.md §4). */}
          <Field label="Used in">
            <p className="flex items-center gap-1.5 text-sm text-subtle">
              <History className="h-4 w-4" aria-hidden /> Usage tracking coming soon.
            </p>
            {/* TODO(LP3/LP5): wire library_usages (context/ref_id/block_id → deep links) so this lists
                every surface the App is placed on. The where-referenced backbone lands with app_instances. */}
          </Field>
        </div>
      </div>
    </div>
  )
}
