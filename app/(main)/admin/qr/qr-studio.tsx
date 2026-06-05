'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { QrCode, Plus, Pencil, Download, Copy, Check, ExternalLink, Zap } from 'lucide-react'
import { createNode, updateNode, setNodeActive, type NodeInput } from './actions'
import { Field, Badge, toLocalInput, fromLocalInput } from './form-bits'
import { StyleEditor } from './style-editor'
import { DEFAULT_STYLE, type QrStyle } from '@/lib/qr/style'

export interface StudioNode {
  id: string
  type: string
  label: string | null
  zaps_value: number
  capture_rule: string
  active: boolean
  valid_until: string | null
  partner_id: string | null
  captures: number
  style: QrStyle
  /** Absolute capture URL this code encodes. */
  url: string
  /** Pre-rendered inline QR SVG (server-side, styled). */
  svg: string
}

export interface PartnerOption {
  id: string
  name: string
}

const RULE_LABELS: Record<string, string> = {
  once_per_user: 'Once per member',
  repeatable: 'Repeatable',
  once_global: 'First scan only',
}

const BLANK: NodeInput = {
  type: 'qr',
  label: '',
  zaps_value: 10,
  capture_rule: 'once_per_user',
  valid_until: null,
  partner_id: null,
  style: DEFAULT_STYLE,
}

export function QrStudio({
  initialNodes,
  partners,
  hideCreate = false,
}: {
  initialNodes: StudioNode[]
  partners: PartnerOption[]
  /** When the create form lives elsewhere (the dashboard generator), show list only. */
  hideCreate?: boolean
}) {
  const [creating, setCreating] = useState(false)
  const partnerName = useMemo(
    () => new Map(partners.map((p) => [p.id, p.name])),
    [partners],
  )

  return (
    <div className="space-y-6">
      {/* Create */}
      {!hideCreate && (
        <div className="rounded-2xl border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div>
              <h2 className="text-sm font-bold text-text">New code</h2>
              <p className="text-xs text-muted mt-0.5">
                A scannable code that earns zaps and a verified practice on check-in.
              </p>
            </div>
            {!creating && (
              <button
                onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-on-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary-hover transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> New code
              </button>
            )}
          </div>
          {creating && (
            <div className="p-4">
              <NodeForm
                partners={partners}
                onDone={() => setCreating(false)}
                onCancel={() => setCreating(false)}
              />
            </div>
          )}
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {initialNodes.length === 0 && (
          <p className="text-sm text-muted py-6 text-center">
            No codes yet. Create one above, then print or share the QR.
          </p>
        )}
        {initialNodes.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            partners={partners}
            partnerName={node.partner_id ? partnerName.get(node.partner_id) ?? null : null}
          />
        ))}
      </div>
    </div>
  )
}

function NodeCard({
  node,
  partners,
  partnerName,
}: {
  node: StudioNode
  partners: PartnerOption[]
  partnerName: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()
  const downloadName = (node.label ?? 'frequency-code').replace(/[^\w.-]+/g, '-').slice(0, 48)
  const apiBase = `/api/qr?node=${encodeURIComponent(node.id)}`

  function toggleActive() {
    start(async () => {
      await setNodeActive(node.id, !node.active)
      router.refresh()
    })
  }

  function copyLink() {
    navigator.clipboard?.writeText(node.url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row gap-4 p-4">
        {/* QR preview */}
        <div className="shrink-0 mx-auto sm:mx-0">
          <div
            className="w-28 h-28 rounded-lg border border-border bg-white p-1.5 [&>svg]:w-full [&>svg]:h-full"
            // Server-rendered, same-origin SVG of a Frequency URL — safe to inline.
            dangerouslySetInnerHTML={{ __html: node.svg }}
          />
        </div>

        {/* Details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-text truncate">
                {node.label ?? 'Untitled code'}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge>{node.type.toUpperCase()}</Badge>
                <Badge>{RULE_LABELS[node.capture_rule] ?? node.capture_rule}</Badge>
                {partnerName && <Badge tone="signal">{partnerName}</Badge>}
                {!node.active && <Badge tone="danger">Retired</Badge>}
                {node.valid_until && (
                  <Badge tone="warning">
                    until {new Date(node.valid_until).toLocaleDateString()}
                  </Badge>
                )}
              </div>
            </div>
            <button
              onClick={() => setEditing((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface-elevated transition-colors shrink-0"
            >
              <Pencil className="w-3 h-3" /> {editing ? 'Close' : 'Edit'}
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Zap className="w-3 h-3 text-primary" /> {node.zaps_value} zaps
            </span>
            <span>{node.captures} check-in{node.captures === 1 ? '' : 's'}</span>
          </div>

          {/* Actions */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={`${apiBase}&format=png&download=${encodeURIComponent(downloadName)}`}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface-elevated transition-colors"
            >
              <Download className="w-3 h-3" /> PNG
            </a>
            <a
              href={`${apiBase}&format=svg&download=${encodeURIComponent(downloadName)}`}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface-elevated transition-colors"
            >
              <Download className="w-3 h-3" /> SVG
            </a>
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface-elevated transition-colors"
            >
              {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Link'}
            </button>
            <a
              href={node.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface-elevated transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> Open
            </a>
            <button
              onClick={toggleActive}
              disabled={pending}
              className="ml-auto text-xs font-semibold text-muted hover:text-text transition-colors disabled:opacity-60"
            >
              {node.active ? 'Retire' : 'Re-activate'}
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <div className="border-t border-border bg-surface-elevated/40 p-4">
          <NodeForm
            node={node}
            partners={partners}
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  )
}

export function NodeForm({
  node,
  partners,
  onDone,
  onCancel,
}: {
  node?: StudioNode
  partners: PartnerOption[]
  onDone: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<NodeInput>(
    node
      ? {
          type: node.type,
          label: node.label ?? '',
          zaps_value: node.zaps_value,
          capture_rule: node.capture_rule,
          valid_until: node.valid_until,
          partner_id: node.partner_id,
          style: node.style,
        }
      : BLANK,
  )
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function set<K extends keyof NodeInput>(key: K, value: NodeInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setError(null)
  }

  function submit() {
    start(async () => {
      const result = node ? await updateNode(node.id, form) : await createNode(form)
      if ('error' in result) {
        setError(result.error)
        return
      }
      router.refresh()
      onDone()
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Label">
          <input
            value={form.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder="e.g. Tuesday meditation check-in"
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
          />
        </Field>
        <Field label="Type">
          <select
            value={form.type}
            onChange={(e) => set('type', e.target.value)}
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
          >
            <option value="qr">QR code</option>
            <option value="nfc">NFC tag</option>
          </select>
        </Field>
        <Field label="Zaps on check-in">
          <input
            type="number"
            min={0}
            value={form.zaps_value}
            onChange={(e) => set('zaps_value', Number(e.target.value))}
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
          />
        </Field>
        <Field label="How often it can be claimed">
          <select
            value={form.capture_rule}
            onChange={(e) => set('capture_rule', e.target.value)}
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
          >
            <option value="once_per_user">Once per member</option>
            <option value="repeatable">Repeatable</option>
            <option value="once_global">First scan only</option>
          </select>
        </Field>
        <Field label="Expires (optional)">
          <input
            type="datetime-local"
            value={toLocalInput(form.valid_until)}
            onChange={(e) => set('valid_until', fromLocalInput(e.target.value))}
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
          />
        </Field>
        <Field label="Partner (optional)">
          <select
            value={form.partner_id ?? ''}
            onChange={(e) => set('partner_id', e.target.value || null)}
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
          >
            <option value="">Community code (no partner)</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {form.partner_id && (
        <p className="text-xs text-muted">
          Partner codes unlock the partner&apos;s active offer on scan and log a redemption (they
          don&apos;t award a verified practice).
        </p>
      )}

      <StyleEditor
        value={form.style}
        onChange={(style) => setForm((f) => ({ ...f, style }))}
        previewUrl={node?.url ?? 'https://frequencylocal.com/n/preview'}
      />

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-on-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
        >
          <QrCode className="w-3.5 h-3.5" />
          {pending ? 'Saving…' : node ? 'Save changes' : 'Create code'}
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

