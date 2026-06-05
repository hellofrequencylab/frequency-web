'use client'

// The crew "My Entry Points" builder + list (ADR-126). Template-first, never a blank
// canvas: pick a template, fill a few slots, watch the flyer build live, publish.
// Each entry point gives a short link, a branded QR (PNG/SVG), and a vector flyer.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Download, Copy, Check, ArrowLeft } from 'lucide-react'
import { shortLinkUrl } from '@/lib/qr/links'
import { STYLE_PRESETS, DEFAULT_STYLE, type QrStyle } from '@/lib/qr/style'
import { buildEntryFlyerSvg, type FlyerSlots } from '@/lib/entry-points/flyer'
import {
  listEntryTemplates,
  getEntryTemplate,
  type EntryTemplate,
  type EntryTemplateId,
} from '@/lib/entry-points/templates'
import type { DestinationGroup } from '@/lib/entry-points/destinations'
import { createEntryPoint, updateEntryPoint, deleteEntryPoint, type EntryPointInput } from './actions'

export interface EntryCard {
  id: string
  slug: string
  url: string
  title: string
  destination: string
  templateId: EntryTemplateId
  flyer: FlyerSlots
  scans: number
  qrSvg: string
}

function presetStyle(key: string): QrStyle {
  return STYLE_PRESETS.find((p) => p.key === key)?.style ?? DEFAULT_STYLE
}

function destinationLabel(groups: DestinationGroup[], value: string): string {
  for (const g of groups) {
    const hit = g.items.find((i) => i.value === value)
    if (hit) return hit.label
  }
  return value
}

export function EntryPointsManager({
  cards,
  destinationGroups,
}: {
  cards: EntryCard[]
  destinationGroups: DestinationGroup[]
}) {
  const [template, setTemplate] = useState<EntryTemplate | null>(null)
  const [creating, setCreating] = useState(false)

  function close() {
    setCreating(false)
    setTemplate(null)
  }

  return (
    <div className="space-y-6">
      {/* Create */}
      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-bold text-text">New entry point</h2>
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              <Plus className="h-3.5 w-3.5" /> Start one
            </button>
          )}
        </div>

        {creating && (
          <div className="p-4">
            {!template ? (
              <TemplatePicker onPick={setTemplate} onCancel={close} />
            ) : (
              <EntryForm
                template={template}
                destinationGroups={destinationGroups}
                onBack={() => setTemplate(null)}
                onDone={close}
              />
            )}
          </div>
        )}
      </section>

      {/* List */}
      <section className="space-y-3">
        {cards.length === 0 && !creating && (
          <p className="rounded-2xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
            No entry points yet. Start one above — it takes about a minute.
          </p>
        )}
        {cards.map((card) => (
          <EntryRow key={card.id} card={card} destinationGroups={destinationGroups} />
        ))}
      </section>
    </div>
  )
}

function TemplatePicker({ onPick, onCancel }: { onPick: (t: EntryTemplate) => void; onCancel: () => void }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-text">What are you making?</p>
        <button onClick={onCancel} className="text-xs font-medium text-muted hover:text-text">
          Cancel
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {listEntryTemplates().map((t) => (
          <button
            key={t.id}
            onClick={() => onPick(t)}
            className="flex items-start gap-3 rounded-2xl border border-border bg-canvas/40 px-4 py-3 text-left transition-colors hover:border-primary/40"
          >
            <span className="text-2xl leading-none" aria-hidden>{t.emoji}</span>
            <span>
              <span className="block text-sm font-bold text-text">{t.label}</span>
              <span className="mt-0.5 block text-xs text-muted">{t.blurb}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

interface FormState {
  title: string
  destination: string
  headline: string
  subhead: string
  footer: string
}

export function EntryForm({
  template,
  card,
  destinationGroups,
  campaignId,
  onBack,
  onDone,
}: {
  template: EntryTemplate
  card?: EntryCard
  destinationGroups: DestinationGroup[]
  /** File the new entry point under this campaign (admin builder). */
  campaignId?: string
  onBack?: () => void
  onDone: () => void
}) {
  const firstDestination = destinationGroups[0]?.items[0]?.value ?? template.defaultDestination
  const [form, setForm] = useState<FormState>(
    card
      ? { title: card.title, destination: card.destination, ...card.flyer }
      : {
          title: '',
          destination: template.defaultDestination || firstDestination,
          headline: template.slots.headline,
          subhead: template.slots.subhead,
          footer: template.slots.footer,
        },
  )
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Live flyer preview — exactly what downloads, scaled down.
  const previewSvg = useMemo(
    () =>
      buildEntryFlyerSvg({
        layout: template.flyerLayout,
        slots: { headline: form.headline, subhead: form.subhead, footer: form.footer },
        qrStyle: card ? undefined : presetStyle(template.stylePreset),
        url: card?.url ?? shortLinkUrl('preview'),
        shortLabel: (card?.url ?? shortLinkUrl('your-link')).replace(/^https?:\/\//, ''),
        size: 360,
      }),
    [template, form, card],
  )

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setError(null)
  }

  function submit() {
    const input: EntryPointInput = { templateId: template.id, ...form, ...(campaignId ? { campaignId } : {}) }
    start(async () => {
      const r = card ? await updateEntryPoint(card.id, input) : await createEntryPoint(input)
      if ('error' in r) {
        setError(r.error)
        return
      }
      router.refresh()
      onDone()
    })
  }

  const field = 'w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text'
  const labelCls = 'block text-xs font-medium text-subtle mb-1'

  return (
    <div className="grid gap-5 md:grid-cols-[1fr_auto]">
      <div className="space-y-3">
        {onBack && (
          <button onClick={onBack} className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-text">
            <ArrowLeft className="h-3 w-3" /> {template.label} · change
          </button>
        )}
        <label className="block">
          <span className={labelCls}>Name (just for you)</span>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Coffee-shop flyer" className={field} />
        </label>
        <label className="block">
          <span className={labelCls}>Where it points</span>
          <select value={form.destination} onChange={(e) => set('destination', e.target.value)} className={field}>
            {destinationGroups.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((i) => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Headline</span>
          <input value={form.headline} onChange={(e) => set('headline', e.target.value)} className={field} maxLength={80} />
        </label>
        <label className="block">
          <span className={labelCls}>Subhead</span>
          <input value={form.subhead} onChange={(e) => set('subhead', e.target.value)} className={field} maxLength={120} />
        </label>
        <label className="block">
          <span className={labelCls}>Call to action</span>
          <input value={form.footer} onChange={(e) => set('footer', e.target.value)} className={field} maxLength={40} />
        </label>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? 'Saving…' : card ? 'Save changes' : 'Create entry point'}
          </button>
          <button onClick={onDone} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted hover:text-text">
            Cancel
          </button>
        </div>
      </div>

      {/* Live flyer preview. */}
      <div className="shrink-0">
        <p className={labelCls}>Flyer preview</p>
        <div
          className="w-[200px] overflow-hidden rounded-xl border border-border [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: previewSvg }}
        />
      </div>
    </div>
  )
}

export function EntryRow({ card, destinationGroups }: { card: EntryCard; destinationGroups: DestinationGroup[] }) {
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()
  const template = getEntryTemplate(card.templateId)
  const qrApi = `/api/qr?code=${encodeURIComponent(card.id)}`

  function copy() {
    navigator.clipboard?.writeText(card.url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function remove() {
    if (!confirm('Delete this entry point? Its scan history goes too.')) return
    start(async () => {
      await deleteEntryPoint(card.id)
      router.refresh()
    })
  }

  const action =
    'inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-elevated hover:text-text'

  return (
    <div className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
      <div className="flex gap-3">
        <div
          className="h-20 w-20 shrink-0 rounded-lg border border-border bg-white p-1 [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: card.qrSvg }}
        />
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 truncate text-sm font-bold text-text">
            <span aria-hidden>{template.emoji}</span> {card.title}
          </h3>
          <p className="truncate text-xs text-muted">→ {destinationLabel(destinationGroups, card.destination)}</p>
          <p className="mt-0.5 text-xs text-muted">
            <span className="font-semibold text-text">{card.scans}</span> scan{card.scans === 1 ? '' : 's'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a href={`/api/entry-points/${encodeURIComponent(card.slug)}/flyer`} className={action}>
              <Download className="h-3 w-3" /> Flyer (SVG)
            </a>
            <a href={`${qrApi}&format=png&download=${encodeURIComponent(card.slug)}`} className={action}>
              <Download className="h-3 w-3" /> QR PNG
            </a>
            <a href={`${qrApi}&format=svg&download=${encodeURIComponent(card.slug)}`} className={action}>
              <Download className="h-3 w-3" /> QR SVG
            </a>
            <button onClick={copy} className={action}>
              {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Link'}
            </button>
            <button onClick={() => setEditing((v) => !v)} className={action}>
              <Pencil className="h-3 w-3" /> {editing ? 'Close' : 'Edit'}
            </button>
            <button onClick={remove} disabled={pending} className={`${action} ml-auto hover:text-danger disabled:opacity-60`}>
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <div className="mt-3 border-t border-border pt-3">
          <EntryForm
            template={template}
            card={card}
            destinationGroups={destinationGroups}
            onDone={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  )
}
