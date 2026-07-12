'use client'

// Email Studio (2026) Phase 3 — the TEMPLATE GALLERY. A standalone client widget: a grid of template cards
// (name, description, category chip) each with a "Use this" button that starts a fresh campaign draft from
// the template and hands the new campaign id back to the workspace (via `onUse`) or navigates to it. It also
// carries the two management affordances: "Load starter templates" (seeds the pre-written presets) and a
// per-card delete.
//
// STANDALONE by design: it takes its templates as a prop and talks only to the Phase-3 template actions
// (../../../app/(main)/admin/email-studio/template-actions). It imports NO Phase-2 workspace file, so the
// coordinator can slot it into the workspace freely.

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutTemplate, Plus, Trash2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { isError } from '@/lib/action-result'
import type { EmailTemplate } from '@/lib/email-studio/types'
import {
  listTemplatesAction,
  startDraftFromTemplateAction,
  seedPresetsAction,
  deleteTemplateAction,
} from '@/app/(main)/admin/email-studio/template-actions'

export interface TemplateGalleryProps {
  /** The templates to show. When absent, the gallery loads them itself on mount. */
  templates?: EmailTemplate[]
  /** Called with the NEW campaign id after "Use this" creates a draft. When omitted, the gallery navigates
   *  to the workspace with the new campaign selected. */
  onUse?: (campaignId: string) => void
  /** Optional target for the default (no `onUse`) navigation. `{id}` is replaced with the campaign id.
   *  Defaults to the Email Studio workspace query param. */
  useHref?: (campaignId: string) => string
}

function defaultHref(campaignId: string): string {
  return `/admin/email-studio?campaign=${encodeURIComponent(campaignId)}`
}

export function TemplateGallery({ templates, onUse, useHref }: TemplateGalleryProps) {
  const router = useRouter()
  const [items, setItems] = useState<EmailTemplate[] | null>(templates ?? null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Self-load once when no templates were provided (never during render).
  useEffect(() => {
    if (templates !== undefined) return
    let active = true
    startTransition(async () => {
      const res = await listTemplatesAction()
      if (active) setItems(isError(res) ? [] : res.data)
    })
    return () => {
      active = false
    }
    // Load once on mount; `templates` is the "provided vs self-load" switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function refresh() {
    startTransition(async () => {
      const res = await listTemplatesAction()
      if (!isError(res)) setItems(res.data)
    })
  }

  function handleUse(template: EmailTemplate) {
    setError(null)
    setPendingId(template.id)
    startTransition(async () => {
      const res = await startDraftFromTemplateAction(template.id)
      setPendingId(null)
      if (isError(res)) {
        setError(res.error)
        return
      }
      const { campaignId } = res.data
      if (onUse) onUse(campaignId)
      else router.push((useHref ?? defaultHref)(campaignId))
    })
  }

  function handleSeed() {
    setError(null)
    startTransition(async () => {
      const res = await seedPresetsAction()
      if (isError(res)) {
        setError(res.error)
        return
      }
      refresh()
    })
  }

  function handleDelete(template: EmailTemplate) {
    setError(null)
    setPendingId(template.id)
    startTransition(async () => {
      const res = await deleteTemplateAction(template.id)
      setPendingId(null)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setItems((prev) => (prev ?? []).filter((t) => t.id !== template.id))
    })
  }

  const loading = items === null
  const list = items ?? []

  return (
    <section className="@container space-y-4" aria-label="Email templates">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-text">
            <LayoutTemplate className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
            Templates
          </h2>
          <p className="text-xs text-muted">Start from a pre-written email, then make it yours.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={handleSeed} disabled={isPending}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Load starter templates
        </Button>
      </header>

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2 @3xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="No templates yet"
          description="Load the pre-written starter templates to get going. You can edit or delete them anytime."
          action={
            <Button variant="primary" size="sm" onClick={handleSeed} disabled={isPending}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Load starter templates
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 @lg:grid-cols-2 @3xl:grid-cols-3">
          {list.map((template) => (
            <li
              key={template.id}
              className="flex flex-col rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
            >
              {template.category && (
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-primary-strong">
                  {template.category}
                </p>
              )}
              <h3 className="text-sm font-bold text-text">{template.name}</h3>
              {template.description && (
                <p className="mt-1 line-clamp-3 flex-1 text-xs leading-relaxed text-muted">
                  {template.description}
                </p>
              )}
              {template.subject && (
                <p className="mt-2 truncate text-xs text-subtle" title={template.subject}>
                  Subject: {template.subject}
                </p>
              )}
              <div className="mt-4 flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleUse(template)}
                  disabled={isPending}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  {pendingId === template.id ? 'Starting...' : 'Use this'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(template)}
                  disabled={isPending}
                  aria-label={`Delete ${template.name}`}
                  title="Delete template"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
