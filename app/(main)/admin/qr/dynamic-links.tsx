'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Plus, Pencil, Download, Copy, Check, ExternalLink, Info, Printer, Trash2, Folder as FolderIcon, FolderOpen, ChevronRight } from 'lucide-react'
import { groupedDestinations, isKnownDestination, SITE_DESTINATIONS } from '@/lib/qr/destinations'
import { createLink, updateLink, setLinkActive, deletePageQr, type LinkInput } from './link-actions'
import { Field, Badge, toLocalInput, fromLocalInput } from './form-bits'
import { StyleEditor } from './style-editor'
import { NfcWriter } from './nfc-writer'
import { DEFAULT_STYLE, type QrStyle } from '@/lib/qr/style'
import { shortLinkUrl } from '@/lib/qr/links'
import type { PartnerOption } from './qr-studio'
import { Button } from '@/components/ui/button'

export interface StudioLink {
  id: string
  slug: string
  title: string
  destination_type: 'url' | 'node' | 'circle' | 'event'
  target_url: string | null
  node_id: string | null
  node_label: string | null
  circle_id: string | null
  event_id: string | null
  switch_at: string | null
  alt_target_url: string | null
  dest_label: string | null
  partner_id: string | null
  active: boolean
  valid_until: string | null
  source_tag: string | null
  /** The page route this code is filed under (its Studio folder), or null = unfiled. */
  page_path: string | null
  scans: number
  unique: number
  style: QrStyle
  /** Absolute /q/<slug> short link this code encodes. */
  url: string
  /** Pre-rendered inline QR SVG (server-side, styled). */
  svg: string
}

export interface NodeOption {
  id: string
  label: string
}

export interface PickOption {
  id: string
  label: string
}

const DEST_BADGE: Record<StudioLink['destination_type'], string> = {
  url: 'Redirect',
  node: 'Earns',
  circle: 'Join',
  event: 'Check-in',
}

const BLANK: LinkInput = {
  title: '',
  destination_type: 'url',
  target_url: '',
  node_id: null,
  circle_id: null,
  event_id: null,
  switch_at: null,
  alt_target_url: '',
  slug: null,
  partner_id: null,
  valid_until: null,
  source_tag: null,
  style: DEFAULT_STYLE,
}

export function DynamicLinks({
  initialLinks,
  nodes,
  circles,
  events,
  partners,
  hideCreate = false,
}: {
  initialLinks: StudioLink[]
  nodes: NodeOption[]
  circles: PickOption[]
  events: PickOption[]
  partners: PartnerOption[]
  /** When the create form lives elsewhere (the dashboard generator), show list only. */
  hideCreate?: boolean
}) {
  const [creating, setCreating] = useState(false)
  const partnerName = useMemo(() => new Map(partners.map((p) => [p.id, p.name])), [partners])
  const folders = useMemo(() => groupIntoFolders(initialLinks), [initialLinks])

  return (
    <div className="space-y-6">
      {!hideCreate && (
        <div className="rounded-2xl border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div>
              <h2 className="text-sm font-bold text-text">New dynamic link</h2>
              <p className="text-xs text-muted mt-0.5">
                A short <code className="text-text">/q/…</code> code you can retarget anytime. Point it at any
                URL or an existing check-in code.
              </p>
            </div>
            {!creating && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="w-3.5 h-3.5" /> New link
              </Button>
            )}
          </div>
          {creating && (
            <div className="p-4">
              <LinkForm
                nodes={nodes}
                circles={circles}
                events={events}
                partners={partners}
                onDone={() => setCreating(false)}
                onCancel={() => setCreating(false)}
              />
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {initialLinks.length === 0 && (
          <p className="text-sm text-muted py-6 text-center">
            No dynamic links yet. Create one above. Its destination stays editable after you print it.
          </p>
        )}
        {folders.map((folder) => (
          <Folder
            key={folder.key}
            label={folder.label}
            count={folder.links.length}
            unfiled={folder.unfiled}
          >
            {folder.links.map((link) => (
              <LinkCard
                key={link.id}
                link={link}
                nodes={nodes}
                circles={circles}
                events={events}
                partners={partners}
                partnerName={link.partner_id ? partnerName.get(link.partner_id) ?? null : null}
              />
            ))}
          </Folder>
        ))}
      </div>
    </div>
  )
}

interface LinkFolder {
  key: string
  label: string
  unfiled: boolean
  links: StudioLink[]
}

// Group codes into per-page folders (ADR-179): one folder per distinct page_path,
// plus an "Unfiled / general" group for free-standing Studio codes (no page_path).
// Page folders sort alphabetically by route; the unfiled group sits last.
function groupIntoFolders(links: StudioLink[]): LinkFolder[] {
  const byPath = new Map<string, StudioLink[]>()
  const unfiled: StudioLink[] = []
  for (const link of links) {
    if (link.page_path) {
      const arr = byPath.get(link.page_path) ?? []
      arr.push(link)
      byPath.set(link.page_path, arr)
    } else {
      unfiled.push(link)
    }
  }
  const folders: LinkFolder[] = [...byPath.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, ls]) => ({ key: path, label: path, unfiled: false, links: ls }))
  if (unfiled.length) {
    folders.push({ key: '__unfiled__', label: 'Unfiled / general', unfiled: true, links: unfiled })
  }
  return folders
}

function Folder({
  label,
  count,
  unfiled,
  children,
}: {
  label: string
  count: number
  unfiled: boolean
  children: React.ReactNode
}) {
  // Page folders open by default (you came here to see them); the catch-all unfiled
  // group starts collapsed to keep the page-owned folders front-and-centre.
  const [open, setOpen] = useState(!unfiled)
  return (
    <div className="rounded-2xl border border-border bg-surface-elevated/30 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-subtle transition-transform ${open ? 'rotate-90' : ''}`}
        />
        {open ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-primary-strong" />
        ) : (
          <FolderIcon className="h-4 w-4 shrink-0 text-subtle" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text" title={label}>
          {label}
        </span>
        <span className="shrink-0 text-xs text-muted">
          {count} code{count === 1 ? '' : 's'}
        </span>
      </button>
      {open && <div className="space-y-3 px-3 pb-3">{children}</div>}
    </div>
  )
}

function LinkCard({
  link,
  nodes,
  circles,
  events,
  partners,
  partnerName,
}: {
  link: StudioLink
  nodes: NodeOption[]
  circles: PickOption[]
  events: PickOption[]
  partners: PartnerOption[]
  partnerName: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()
  const downloadName = link.slug
  const apiBase = `/api/qr?code=${encodeURIComponent(link.id)}`

  function toggleActive() {
    start(async () => {
      await setLinkActive(link.id, !link.active)
      router.refresh()
    })
  }

  function remove() {
    if (!confirm('Delete this dynamic link? Its scan history goes too. This can’t be undone.')) return
    start(async () => {
      await deletePageQr(link.id)
      router.refresh()
    })
  }

  function copyLink() {
    navigator.clipboard?.writeText(link.url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const destination =
    link.destination_type === 'node'
      ? `Check-in: ${link.node_label ?? 'node'}`
      : link.destination_type === 'circle'
        ? `Join circle: ${link.dest_label ?? 'circle'}`
        : link.destination_type === 'event'
          ? `Check in: ${link.dest_label ?? 'event'}`
          : link.target_url ?? '–'

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row gap-4 p-4">
        <div className="shrink-0 mx-auto sm:mx-0">
          <div
            className="w-28 h-28 rounded-lg border border-border bg-white p-1.5 [&>svg]:w-full [&>svg]:h-full"
            dangerouslySetInnerHTML={{ __html: link.svg }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-text truncate">{link.title}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge tone="primary">/q/{link.slug}</Badge>
                <Badge>{DEST_BADGE[link.destination_type]}</Badge>
                {partnerName && <Badge tone="signal">{partnerName}</Badge>}
                {!link.active && <Badge tone="danger">Retired</Badge>}
                {link.valid_until && (
                  <Badge tone="warning">until {new Date(link.valid_until).toLocaleDateString()}</Badge>
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

          <p className="mt-2 text-xs text-muted truncate">→ {destination}</p>

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="font-semibold text-text">{link.scans}</span>
            <span>scan{link.scans === 1 ? '' : 's'}</span>
            <span>· {link.unique} unique member{link.unique === 1 ? '' : 's'}</span>
          </div>

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
            <NfcWriter url={link.url} />
            <a
              href={`/print/qr?code=${encodeURIComponent(link.id)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface-elevated transition-colors"
            >
              <Printer className="w-3 h-3" /> Print
            </a>
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface-elevated transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> Open
            </a>
            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={toggleActive}
                disabled={pending}
                className="text-xs font-semibold text-muted hover:text-text transition-colors disabled:opacity-60"
              >
                {link.active ? 'Retire' : 'Re-activate'}
              </button>
              <button
                onClick={remove}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:text-danger disabled:opacity-60"
              >
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <div className="border-t border-border bg-surface-elevated/40 p-4">
          <LinkForm
            link={link}
            nodes={nodes}
            circles={circles}
            events={events}
            partners={partners}
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  )
}

export function LinkForm({
  link,
  nodes,
  circles,
  events,
  partners,
  onDone,
  onCancel,
  externalStyle,
  hideEditor = false,
}: {
  link?: StudioLink
  nodes: NodeOption[]
  circles: PickOption[]
  events: PickOption[]
  partners: PartnerOption[]
  onDone: () => void
  onCancel: () => void
  /** When the design editor lives outside the form (Studio rail), the parent owns
   *  the style and passes it in; the form then hides its own editor. */
  externalStyle?: QrStyle
  hideEditor?: boolean
}) {
  const [form, setForm] = useState<LinkInput>(
    link
      ? {
          title: link.title,
          destination_type: link.destination_type,
          target_url: link.target_url ?? '',
          node_id: link.node_id,
          circle_id: link.circle_id,
          event_id: link.event_id,
          switch_at: link.switch_at,
          alt_target_url: link.alt_target_url ?? '',
          slug: link.slug,
          partner_id: link.partner_id,
          valid_until: link.valid_until,
          source_tag: link.source_tag,
          style: link.style,
        }
      : BLANK,
  )
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [urlMode, setUrlMode] = useState<'preset' | 'custom'>(
    link && link.destination_type === 'url' && link.target_url && !isKnownDestination(link.target_url)
      ? 'custom'
      : 'preset',
  )
  const router = useRouter()

  const destValue =
    form.destination_type === 'url' && form.target_url && isKnownDestination(form.target_url)
      ? SITE_DESTINATIONS.find((d) => d.path === form.target_url)?.value ?? null
      : null

  function set<K extends keyof LinkInput>(key: K, value: LinkInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setError(null)
  }

  function submit() {
    start(async () => {
      const payload = externalStyle ? { ...form, style: externalStyle } : form
      const result = link ? await updateLink(link.id, payload) : await createLink(payload)
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
        <Field label="Title">
          <input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Spring flyer → signup"
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
          />
        </Field>
        <Field label="Custom link (optional)">
          <div className="flex items-center rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm">
            <span className="text-subtle">/q/</span>
            <input
              value={form.slug ?? ''}
              onChange={(e) => set('slug', e.target.value || null)}
              placeholder="auto"
              className="flex-1 min-w-0 bg-transparent text-text outline-none"
            />
          </div>
        </Field>
        <Field label="Destination type">
          <select
            value={form.destination_type}
            onChange={(e) => set('destination_type', e.target.value as LinkInput['destination_type'])}
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
          >
            <option value="url">Redirect to a URL</option>
            <option value="node">Run a check-in code (earns)</option>
            <option value="circle">Join a circle on scan</option>
            <option value="event">RSVP + check in to an event</option>
          </select>
        </Field>
        {form.destination_type === 'url' && (
          <Field label="Destination">
            <select
              value={urlMode === 'custom' ? '__custom__' : isKnownDestination(form.target_url ?? '') ? form.target_url ?? '' : ''}
              onChange={(e) => {
                const v = e.target.value
                if (v === '__custom__') {
                  setUrlMode('custom')
                  return
                }
                setUrlMode('preset')
                set('target_url', v)
              }}
              className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
            >
              <option value="">Choose a destination…</option>
              {groupedDestinations().map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((d) => (
                    <option key={d.path} value={d.path}>
                      {d.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value="__custom__">Custom URL…</option>
            </select>
          </Field>
        )}
        {form.destination_type === 'node' && (
          <Field label="Check-in code">
            <select
              value={form.node_id ?? ''}
              onChange={(e) => set('node_id', e.target.value || null)}
              className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
            >
              <option value="">Choose a code…</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {form.destination_type === 'circle' && (
          <Field label="Circle">
            <select
              value={form.circle_id ?? ''}
              onChange={(e) => set('circle_id', e.target.value || null)}
              className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
            >
              <option value="">Choose a circle…</option>
              {circles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {form.destination_type === 'event' && (
          <Field label="Event">
            <select
              value={form.event_id ?? ''}
              onChange={(e) => set('event_id', e.target.value || null)}
              className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
            >
              <option value="">Choose an event…</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.label}
                </option>
              ))}
            </select>
          </Field>
        )}
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
            <option value="">No partner</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source tag (optional)">
          <input
            value={form.source_tag ?? ''}
            onChange={(e) => set('source_tag', e.target.value || null)}
            placeholder="e.g. downtown-poster-a"
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
          />
        </Field>
      </div>

      {form.destination_type === 'url' && urlMode === 'custom' && (
        <Field label="Custom URL">
          <input
            value={form.target_url ?? ''}
            onChange={(e) => set('target_url', e.target.value)}
            placeholder="https://… or /path"
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
          />
        </Field>
      )}

      {form.destination_type === 'url' && (
        <div className="rounded-lg border border-border bg-canvas/50 p-3">
          <p className="text-xs font-medium text-subtle">Time-aware (optional)</p>
          <p className="mt-0.5 text-xs text-muted">Switch the same printed code to a new destination at a set time.</p>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Switch at">
              <input
                type="datetime-local"
                value={toLocalInput(form.switch_at)}
                onChange={(e) => set('switch_at', fromLocalInput(e.target.value))}
                className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
              />
            </Field>
            <Field label="…then point to">
              <input
                value={form.alt_target_url ?? ''}
                onChange={(e) => set('alt_target_url', e.target.value)}
                placeholder="https://… or /path"
                className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
              />
            </Field>
          </div>
        </div>
      )}

      {destValue && (
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-strong" aria-hidden /> {destValue}
        </p>
      )}

      {!hideEditor && (
        <StyleEditor
          value={form.style}
          onChange={(style) => set('style', style)}
          previewUrl={link?.url ?? shortLinkUrl('preview')}
        />
      )}

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={pending} className="disabled:opacity-60">
          <Link2 className="w-3.5 h-3.5" />
          {pending ? 'Saving…' : link ? 'Save changes' : 'Create link'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
