'use client'

// Operator template curation (ADR-126 Phase 2b): toggle which entry-point templates
// crew may use in their builder. Disabled templates stay available to operators.

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setTemplateEnabled } from './actions'

export interface TemplateGov {
  id: string
  label: string
  emoji: string
  blurb: string
  enabled: boolean
}

export function TemplateGovernance({ templates }: { templates: TemplateGov[] }) {
  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-bold text-text">Crew templates</h2>
        <p className="mt-0.5 text-xs text-muted">
          Choose which templates crew can use in their builder. Disabled ones stay available to operators here.
        </p>
      </div>
      <div className="divide-y divide-border/60">
        {templates.map((t) => (
          <Row key={t.id} t={t} />
        ))}
      </div>
    </section>
  )
}

function Row({ t }: { t: TemplateGov }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const toggle = () =>
    start(async () => {
      await setTemplateEnabled(t.id, !t.enabled)
      router.refresh()
    })

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="text-xl leading-none" aria-hidden>{t.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">{t.label}</p>
        <p className="truncate text-xs text-muted">{t.blurb}</p>
      </div>
      <button
        onClick={toggle}
        disabled={pending}
        className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${
          t.enabled ? 'border-success/40 text-success' : 'border-border text-muted hover:text-text'
        }`}
      >
        {t.enabled ? 'Enabled' : 'Disabled'}
      </button>
    </div>
  )
}
