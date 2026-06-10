'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Megaphone, Plus, Pencil, Trash2, Download, Copy, Check } from 'lucide-react'
import { StyleEditor } from '@/app/(main)/admin/qr/style-editor'
import { trackClient } from '@/components/analytics/track-provider'
import { createMarketingCode, updateMarketingCode, deleteMarketingCode } from './actions'
import { DEFAULT_STYLE, type QrStyle } from '@/lib/qr/style'
import { shortLinkUrl } from '@/lib/qr/links'
import type { MarketingTarget } from '@/lib/qr/marketing'

export interface MarketingCard {
  id: string
  title: string
  slug: string
  url: string
  targetPath: string
  scans: number
  style: QrStyle
  svg: string
}

interface FormState {
  title: string
  path: string
  style: QrStyle
}

export function MarketingCodes({
  cards,
  targets,
  limit,
}: {
  cards: MarketingCard[]
  targets: MarketingTarget[]
  limit: number
}) {
  const [creating, setCreating] = useState(false)
  const atLimit = cards.length >= limit

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-text">
            <Megaphone className="w-4 h-4 text-primary-strong" /> Marketing codes
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Your funnel codes. Point one at a circle or event you&apos;re promoting and track the
            scans. {cards.length}/{limit} used.
          </p>
        </div>
        {!creating && !atLimit && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-on-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary-hover transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New code
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {targets.length === 0 && (
          <p className="text-xs text-muted">
            Join a circle or host an event first, then you can point a code at it.
          </p>
        )}

        {creating && (
          <MarketingForm
            targets={targets}
            onDone={() => setCreating(false)}
            onCancel={() => setCreating(false)}
          />
        )}

        {cards.length === 0 && !creating && (
          <p className="text-xs text-muted">No marketing codes yet.</p>
        )}

        {cards.map((card) => (
          <MarketingRow key={card.id} card={card} targets={targets} />
        ))}
      </div>
    </section>
  )
}

function MarketingRow({ card, targets }: { card: MarketingCard; targets: MarketingTarget[] }) {
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()
  const apiBase = `/api/qr?code=${encodeURIComponent(card.id)}`
  const targetLabel = targets.find((t) => t.path === card.targetPath)?.label ?? card.targetPath

  function copy() {
    navigator.clipboard?.writeText(card.url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function remove() {
    if (!confirm('Delete this marketing code? Its scans history goes too.')) return
    start(async () => {
      await deleteMarketingCode(card.id)
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-border bg-canvas/40 p-3">
      <div className="flex gap-3">
        <div
          className="shrink-0 w-20 h-20 rounded-lg border border-border bg-white p-1 [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: card.svg }}
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-text truncate">{card.title}</h3>
          <p className="text-xs text-muted truncate">→ {targetLabel}</p>
          <p className="mt-0.5 text-xs text-muted">
            <span className="font-semibold text-text">{card.scans}</span> scan{card.scans === 1 ? '' : 's'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              href={`${apiBase}&format=png&download=${encodeURIComponent(card.slug)}`}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface-elevated transition-colors"
            >
              <Download className="w-3 h-3" /> PNG
            </a>
            <a
              href={`${apiBase}&format=svg&download=${encodeURIComponent(card.slug)}`}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface-elevated transition-colors"
            >
              <Download className="w-3 h-3" /> SVG
            </a>
            <button
              onClick={copy}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface-elevated transition-colors"
            >
              {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Link'}
            </button>
            <button
              onClick={() => setEditing((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface-elevated transition-colors"
            >
              <Pencil className="w-3 h-3" /> {editing ? 'Close' : 'Edit'}
            </button>
            <button
              onClick={remove}
              disabled={pending}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-danger transition-colors disabled:opacity-60"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <div className="mt-3">
          <MarketingForm
            card={card}
            targets={targets}
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  )
}

function MarketingForm({
  card,
  targets,
  onDone,
  onCancel,
}: {
  card?: MarketingCard
  targets: MarketingTarget[]
  onDone: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<FormState>(
    card
      ? { title: card.title, path: card.targetPath, style: card.style }
      : { title: '', path: targets[0]?.path ?? '', style: DEFAULT_STYLE },
  )
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function submit() {
    start(async () => {
      const r = card
        ? await updateMarketingCode(card.id, form)
        : await createMarketingCode(form)
      if ('error' in r) {
        setError(r.error)
        return
      }
      trackClient('qr.code_designed', { kind: 'marketing' })
      router.refresh()
      onDone()
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-medium text-subtle mb-1">Code name</span>
          <input
            value={form.title}
            onChange={(e) => {
              setForm((f) => ({ ...f, title: e.target.value }))
              setError(null)
            }}
            placeholder="e.g. Coffee-shop flyer"
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-subtle mb-1">Points at</span>
          <select
            value={form.path}
            onChange={(e) => {
              setForm((f) => ({ ...f, path: e.target.value }))
              setError(null)
            }}
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
          >
            {targets.map((t) => (
              <option key={t.path} value={t.path}>
                {t.type === 'circle' ? '○ ' : '◆ '}
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <StyleEditor
        value={form.style}
        onChange={(style) => setForm((f) => ({ ...f, style }))}
        previewUrl={card?.url ?? shortLinkUrl('preview')}
      />

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={pending || targets.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-on-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
        >
          <Megaphone className="w-3.5 h-3.5" />
          {pending ? 'Saving…' : card ? 'Save changes' : 'Create code'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted hover:text-text transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
