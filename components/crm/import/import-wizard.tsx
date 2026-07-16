'use client'

// The CSV import wizard (CRM Master Build Plan Phase 2): parse -> map -> preview ->
// commit, with on-screen guidance at every step. The client parses the file (Papa
// Parse) for instant headers + a sample; everything else (AI assist, dedupe preview,
// commit) is a server action. Composes the page-framework kit primitives + semantic
// tokens (no hex). Copy passes NAMING + CONTENT-VOICE (no em dashes).

import { useState, useRef, useEffect } from 'react'
import { UploadCloud, Sparkles, Loader2, Check, ArrowRight, ArrowLeft, FileSpreadsheet, FileText, AlertTriangle, ClipboardType, Undo2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { sourceFromContacts, mergeSources, parseFileLocally } from '@/lib/crm/import/parse'
import { customFieldKey } from '@/lib/crm/import/map'
import {
  stageImport,
  saveMapping,
  suggestMapping,
  previewImport,
  commitAction,
  extractContactsAction,
  extractZipSources,
  extractSpreadsheetSource,
  rollbackAction,
  listKnownCustomFields,
} from '@/lib/crm/import/actions'
import { isError } from '@/lib/action-result'
import { TARGET_FIELDS, type ColumnMapping, type MappingChoice, type MergeStrategy, type ParsedSource, type ValidationResult, type PreviewRow, type CommitResult, type ImportTargetKind } from '@/lib/crm/import/types'
import type { ManagedSpace } from '@/lib/spaces/managed'

const input =
  'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong/30 disabled:opacity-50'

/** Human labels for the target fields (the dropdown + review copy). */
const FIELD_LABEL: Record<MappingChoice, string> = {
  displayName: 'Name',
  email: 'Email',
  phone: 'Phone',
  title: 'Title',
  company: 'Company',
  city: 'City',
  website: 'Website',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  x: 'X',
  tags: 'Tags',
  notes: 'Notes',
  custom: 'Custom field',
  ignore: 'Skip this column',
}

const MERGE_LABEL: Record<MergeStrategy, { label: string; help: string }> = {
  fill_empty: { label: 'Fill blanks only', help: 'Keep what a matching contact already has. Only fill in gaps.' },
  overwrite: { label: 'Overwrite', help: 'Replace a matching contact’s fields with the file’s values.' },
  skip: { label: 'Skip matches', help: 'Leave any contact you already have untouched.' },
}

type Step = 'upload' | 'map' | 'preview' | 'done'

type Banner = { kind: 'ok' | 'warn' | 'err'; text: string } | null

/** One row in the per-file upload queue: what we are reading and how it went. */
type QueueItem = {
  id: string
  name: string
  size: number
  status: 'parsing' | 'done' | 'skipped'
  /** Contacts pulled from this file (status 'done'). */
  count?: number
  /** Why it was skipped, or a note on a partial read (status 'skipped', or 'done' with a caveat). */
  reason?: string
}

/** A short, plain file size ("18 KB", "2.4 MB"). */
function formatBytes(n: number): string {
  if (!n) return '0 KB'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function ImportWizard({
  targetKind,
  spaces = [],
  lockedSpace,
}: {
  /** member = personal book · space = a tenant Space's sealed list · platform = Frequency's
   *  own ROOT contact hub (staff only, no Space picker). */
  targetKind: ImportTargetKind
  spaces?: ManagedSpace[]
  /** When set (with targetKind='space'), the target is SEALED to this one Space: no picker,
   *  a static line naming it. Used by a per-Space CRM importer where the membrane fixes the
   *  destination. When omitted, the `spaces` picker is shown (the platform operator path). */
  lockedSpace?: { id: string; name: string }
}) {
  const [step, setStep] = useState<Step>('upload')
  const [source, setSource] = useState<ParsedSource | null>(null)
  const [filename, setFilename] = useState<string>('')
  const [importId, setImportId] = useState<string | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping[]>([])
  const [spaceId, setSpaceId] = useState<string>(lockedSpace?.id ?? spaces[0]?.id ?? '')
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>('fill_empty')
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [result, setResult] = useState<CommitResult | null>(null)
  const [undone, setUndone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<Banner>(null)
  const [showPaste, setShowPaste] = useState(false)
  const [pasted, setPasted] = useState('')
  const [knownFields, setKnownFields] = useState<{ key: string; label: string }[]>([])
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const scopeSpaceId = targetKind === 'space' ? spaceId : null

  // Load the custom fields this operator already has (per target scope) so the mapping step can
  // suggest reusing an existing field instead of minting a near-duplicate.
  useEffect(() => {
    let live = true
    listKnownCustomFields(scopeSpaceId)
      .then((fields) => {
        if (live) setKnownFields(fields)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [scopeSpaceId])

  const bannerClass = banner
    ? banner.kind === 'ok'
      ? 'border-success/40 bg-success-bg text-success'
      : banner.kind === 'warn'
        ? 'border-primary/40 bg-primary-bg text-primary-strong'
        : 'border-danger/40 bg-danger-bg text-danger'
    : ''

  /**
   * Ingest ANY mix of files plus pasted text into ONE staged set. A delimited file
   * (CSV/TSV) is parsed in the browser; anything the parser cannot read as a table, plus
   * any pasted text, is handed to Vera to lift contacts out of (a server action; only a
   * capped sample reaches the model). Every source is merged into one column set. A file
   * that cannot be read is skipped with a noted reason, never fatal (fail-safe).
   */
  async function ingest(files: File[], text: string) {
    setBusy(true)
    setBanner(null)
    const sources: ParsedSource[] = []
    let firstLabel = ''
    let skipCount = 0

    // Seed the queue: one row per file (plus pasted text), all "parsing" until each resolves.
    const stamp = Date.now()
    const items: QueueItem[] = files.map((f, i) => ({ id: `f${stamp}-${i}`, name: f.name, size: f.size, status: 'parsing' }))
    if (text.trim()) items.push({ id: `t${stamp}`, name: 'Pasted text', size: text.length, status: 'parsing' })
    setQueue(items)

    const update = (id: string, patch: Partial<QueueItem>) =>
      setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)))
    const markDone = (id: string, count: number, reason?: string) => update(id, { status: 'done', count, reason })
    const markSkipped = (id: string, reason: string) => {
      skipCount++
      update(id, { status: 'skipped', reason })
    }

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const item = items[i]
        try {
          // A ZIP (e.g. a Notion / CRM export) is unzipped server-side; each CSV inside becomes a
          // source, merged with the rest. Detect by extension or MIME so a renamed archive still works.
          const isZip = /\.zip$/i.test(file.name) || /zip/i.test(file.type)
          if (isZip) {
            const fd = new FormData()
            fd.append('file', file)
            const res = await extractZipSources(fd)
            if (isError(res)) {
              markSkipped(item.id, res.error)
              continue
            }
            let count = 0
            for (const src of res.data.sources) {
              sources.push(src)
              count += src.rows.length
            }
            const inner = res.data.skipped.map((s) => `${s.name || 'an entry'} (${s.reason})`)
            if (res.data.files.length && !firstLabel) firstLabel = file.name
            markDone(item.id, count, inner.length ? `some entries skipped: ${inner.join(', ')}` : undefined)
            continue
          }
          // A spreadsheet (.xlsx / .xls) is read server-side (a workbook is a ZIP of XML), first
          // sheet only. Detect by extension or MIME so a renamed workbook still works.
          const isXlsx = /\.xls[xm]?$/i.test(file.name) || /spreadsheet|excel|ms-excel/i.test(file.type)
          if (isXlsx) {
            const fd = new FormData()
            fd.append('file', file)
            const res = await extractSpreadsheetSource(fd)
            if (isError(res)) {
              markSkipped(item.id, res.error)
              continue
            }
            sources.push(res.data.source)
            if (!firstLabel) firstLabel = file.name
            markDone(item.id, res.data.source.rows.length)
            continue
          }
          // A CSV / TSV, a vCard, a JSON export, or plain-text notes parse in the browser.
          const local = await parseFileLocally(file)
          if (local) {
            sources.push(local.source)
            if (!firstLabel) firstLabel = file.name
            markDone(item.id, local.source.rows.length)
            continue
          }
          // Nothing deterministic could read it -> AI extraction from its text.
          const raw = await file.text()
          const res = await extractContactsAction(raw, { spaceId: scopeSpaceId })
          if (isError(res)) {
            markSkipped(item.id, res.error)
            continue
          }
          const src = sourceFromContacts(res.data.contacts)
          if (!src.rows.length) {
            markSkipped(item.id, 'we could not find any contacts in it')
            continue
          }
          sources.push(src)
          if (!firstLabel) firstLabel = file.name
          markDone(item.id, src.rows.length, res.data.truncated ? 'it is long, so we read the first part' : undefined)
        } catch {
          markSkipped(item.id, 'we could not read it')
        }
      }

      if (text.trim()) {
        const item = items[items.length - 1]
        const res = await extractContactsAction(text, { spaceId: scopeSpaceId })
        if (isError(res)) {
          markSkipped(item.id, res.error)
        } else {
          const src = sourceFromContacts(res.data.contacts)
          if (src.rows.length) {
            sources.push(src)
            if (!firstLabel) firstLabel = 'pasted text'
            markDone(item.id, src.rows.length)
          } else {
            markSkipped(item.id, 'we could not find any contacts in it')
          }
        }
      }

      if (!sources.length) {
        setBanner({
          kind: 'warn',
          text: 'We could not find any contacts to bring in. A file with a header row (Name, Email, Phone) works best, or paste a list.',
        })
        return
      }

      const merged = mergeSources(sources)
      if (!merged.rows.length) {
        setBanner({ kind: 'warn', text: 'We read your files but found no contacts in them.' })
        return
      }

      const label = files.length + (text.trim() ? 1 : 0) > 1 ? `${firstLabel} and more` : firstLabel
      setFilename(label)
      const res = await stageImport({
        targetKind,
        spaceId: scopeSpaceId,
        filename: label,
        source: merged,
      })
      if (isError(res)) {
        setBanner({ kind: 'err', text: res.error })
        return
      }
      setSource(merged)
      setImportId(res.data.id)
      setMapping(res.data.mapping)
      setPasted('')
      setShowPaste(false)

      // When every file read cleanly, go straight to matching. If some were skipped, stay here so
      // the queue below shows what happened; the "Continue to matching" button carries on.
      if (skipCount === 0) {
        setStep('map')
        if (res.data.remembered) {
          setBanner({ kind: 'ok', text: 'We matched your columns the way you did last time. Review and adjust below.' })
        }
      } else {
        setBanner({ kind: 'warn', text: 'Your contacts are staged. Some files needed a second look. Check the list, then continue to matching.' })
      }
    } catch {
      setBanner({ kind: 'err', text: 'We could not read that. A plain .csv, or a pasted list, works best.' })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const canIngest = !busy && !(targetKind === 'space' && !spaceId)

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    if (!canIngest) return
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length) void ingest(files, '')
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (canIngest) setDragging(true)
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
  }

  function setColumnTarget(header: string, target: MappingChoice) {
    setMapping((prev) =>
      prev.map((m) => {
        if (m.header !== header) return m
        const next = { ...m, target, reason: 'manual' as const, confidence: 1 }
        if (target === 'custom') {
          // Default the label to the source header, and derive the stable key from the label.
          const label = m.customLabel?.trim() || m.header
          next.customLabel = label
          next.customKey = m.customKey || customFieldKey(label)
        }
        return next
      }),
    )
  }

  /** Rename a custom field's label. The stable key is re-derived from the label, UNLESS the label
   *  matches a field the operator already has (case-insensitive), in which case we snap to that
   *  field's key so a re-import lands in the same field instead of forking a near-duplicate. */
  function setColumnCustomLabel(header: string, label: string) {
    const match = knownFields.find((f) => f.label.trim().toLowerCase() === label.trim().toLowerCase())
    const key = match ? match.key : customFieldKey(label) || customFieldKey(header)
    setMapping((prev) => prev.map((m) => (m.header === header ? { ...m, customLabel: label, customKey: key } : m)))
  }

  async function askVera() {
    if (!importId) return
    setBusy(true)
    setBanner(null)
    const res = await suggestMapping(importId)
    setBusy(false)
    if (isError(res)) {
      setBanner({ kind: 'warn', text: res.error })
      return
    }
    if (!res.data.length) {
      setBanner({ kind: 'warn', text: 'Vera did not have a better guess. Your picks stand.' })
      return
    }
    const byHeader = new Map(res.data.map((s) => [s.header, s]))
    setMapping((prev) => prev.map((m) => {
      const s = byHeader.get(m.header)
      return s ? { ...m, target: s.target, reason: 'ai', confidence: s.confidence } : m
    }))
    setBanner({ kind: 'ok', text: 'Vera suggested matches for your columns. Review each one, then continue.' })
  }

  async function goPreview() {
    if (!importId) return
    setBusy(true)
    setBanner(null)
    await saveMapping(importId, mapping)
    const res = await previewImport(importId, mapping, mergeStrategy)
    setBusy(false)
    if (isError(res)) {
      setBanner({ kind: 'err', text: res.error })
      return
    }
    setValidation(res.data)
    setStep('preview')
  }

  async function commit() {
    if (!importId) return
    setBusy(true)
    setBanner(null)
    const res = await commitAction(importId)
    setBusy(false)
    if (isError(res)) {
      setBanner({ kind: 'err', text: res.error })
      return
    }
    setResult(res.data)
    setUndone(false)
    setStep('done')
  }

  async function undo() {
    if (!importId) return
    setBusy(true)
    setBanner(null)
    const res = await rollbackAction(importId)
    setBusy(false)
    if (isError(res)) {
      setBanner({ kind: 'err', text: res.error })
      return
    }
    setUndone(true)
    setBanner({ kind: 'ok', text: `Undone. We removed ${res.data.deleted} contact${res.data.deleted === 1 ? '' : 's'} this import added.` })
  }

  const steps: { key: Step; label: string }[] = [
    { key: 'upload', label: 'Upload' },
    { key: 'map', label: 'Match columns' },
    { key: 'preview', label: 'Review' },
    { key: 'done', label: 'Done' },
  ]
  const stepIndex = steps.findIndex((s) => s.key === step)

  return (
    <div className="space-y-6">
      {/* Progress rail */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-2xs ${i <= stepIndex ? 'bg-primary text-on-primary' : 'bg-surface-elevated text-subtle'}`}>{i + 1}</span>
            <span className={i <= stepIndex ? 'text-text' : 'text-subtle'}>{s.label}</span>
            {i < steps.length - 1 && <span className="text-subtle">/</span>}
          </li>
        ))}
      </ol>

      {banner && <p className={`rounded-lg border px-3 py-2 text-sm ${bannerClass}`}>{banner.text}</p>}

      {step === 'upload' && (
        <div className="space-y-4">
          {targetKind === 'space' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Import into</label>
              {lockedSpace ? (
                <p className="rounded-lg border border-border bg-surface-elevated/40 px-3 py-2 text-sm font-medium text-text">{lockedSpace.name}</p>
              ) : spaces.length ? (
                <select className={input} value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-muted">You do not manage a Space with a contact list yet.</p>
              )}
              <p className="mt-1 text-xs text-subtle">Contacts land in this Space’s own list, sealed to the Space. They are never shared to the wider community.</p>
            </div>
          )}

          {targetKind === 'platform' && (
            <p className="rounded-lg border border-border bg-surface-elevated/40 px-3 py-2 text-xs text-subtle">
              These contacts land in Frequency’s own list. Everyone comes in as a lead, never auto-subscribed. No Space is involved.
            </p>
          )}

          {/* Real drop target. The hidden input + button stay as the keyboard/click fallback. */}
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`rounded-2xl border-2 border-dashed transition-colors ${dragging ? 'border-primary bg-primary-bg' : 'border-border'}`}
          >
            <EmptyState
              variant="first-use"
              icon={FileSpreadsheet}
              title="Bring in your contacts"
              description="Drop files here, or choose them. A spreadsheet, an export from another CRM, your phone contacts, or even a plain note all work. CSV, Excel, vCard, JSON, text, and a .zip export are all fine, and you can bring in more than one at once. Vera reads whatever you give it and matches the columns on the next step."
              action={
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={!canIngest}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                  {busy ? 'Reading…' : 'Choose files'}
                </button>
              }
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".csv,.tsv,.tab,.txt,.vcf,.json,.xlsx,.xls,.zip,text/csv,text/tab-separated-values,text/plain,text/vcard,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/zip,application/x-zip-compressed"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) void ingest(files, '')
            }}
          />

          {queue.length > 0 && (
            <ul className="space-y-2">
              {queue.map((q) => (
                <li key={q.id} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{q.name}</p>
                    <p className="text-2xs text-subtle">{formatBytes(q.size)}</p>
                    {q.reason && <p className="mt-0.5 text-2xs text-muted">{q.reason}</p>}
                  </div>
                  <div className="shrink-0 text-xs font-medium">
                    {q.status === 'parsing' && (
                      <span className="inline-flex items-center gap-1 text-subtle">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading…
                      </span>
                    )}
                    {q.status === 'done' && (
                      <span className="inline-flex items-center gap-1 text-success">
                        <Check className="h-3.5 w-3.5" /> {q.count ?? 0} contact{q.count === 1 ? '' : 's'}
                      </span>
                    )}
                    {q.status === 'skipped' && (
                      <span className="inline-flex items-center gap-1 text-warning">
                        <AlertTriangle className="h-3.5 w-3.5" /> Skipped
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {importId && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setStep('map')}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                Continue to matching <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="rounded-xl border border-border bg-surface-elevated/40 p-4">
            <button
              type="button"
              onClick={() => setShowPaste((v) => !v)}
              disabled={busy || (targetKind === 'space' && !spaceId)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-text hover:text-primary-strong disabled:opacity-40"
            >
              <ClipboardType className="h-3.5 w-3.5 text-primary-strong" />
              {showPaste ? 'Hide paste box' : 'Or paste a list of people'}
            </button>
            {showPaste && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  rows={5}
                  placeholder={'Paste names, emails, phone numbers, or a few signature blocks. Vera pulls the contacts out.'}
                  className={`${input} resize-y`}
                />
                <button
                  type="button"
                  onClick={() => void ingest([], pasted)}
                  disabled={busy || !pasted.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {busy ? 'Reading…' : 'Pull out the contacts'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {step === 'map' && source && (
        <div className="space-y-4">
          {/* Known custom fields for this scope: typing a matching name in a custom field reuses it. */}
          <datalist id="known-custom-fields">
            {knownFields.map((f) => (
              <option key={f.key} value={f.label} />
            ))}
          </datalist>
          <div className="rounded-xl border border-border bg-surface-elevated/40 p-4">
            <p className="text-sm font-semibold text-text">Match your columns to contact fields</p>
            <p className="mt-1 text-xs text-muted">
              We guessed a match for each column. A confident match is applied for you; check the rest. Anything left as a
              custom field is kept on the contact, and you can rename it or reuse one you already have. Nothing is thrown away.
              Or let Vera take a pass.
            </p>
            <button
              type="button"
              onClick={askVera}
              disabled={busy}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary-strong" />}
              Ask Vera to match them
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated/40 text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Your column</th>
                  <th className="px-3 py-2 font-medium">Sample</th>
                  <th className="px-3 py-2 font-medium">Maps to</th>
                  <th className="px-3 py-2 font-medium">Match</th>
                </tr>
              </thead>
              <tbody>
                {mapping.map((m) => {
                  const sample = source.rows.find((r) => r[m.header])?.[m.header] ?? ''
                  return (
                    <tr key={m.header} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 font-medium text-text">{m.header}</td>
                      <td className="max-w-[10rem] truncate px-3 py-2 text-subtle" title={sample}>{sample || '—'}</td>
                      <td className="px-3 py-2">
                        <select
                          className={`${input} py-1`}
                          value={m.target}
                          onChange={(e) => setColumnTarget(m.header, e.target.value as MappingChoice)}
                        >
                          {TARGET_FIELDS.map((f) => (
                            <option key={f} value={f}>{FIELD_LABEL[f]}</option>
                          ))}
                          <option value="custom">{FIELD_LABEL.custom}</option>
                          <option value="ignore">{FIELD_LABEL.ignore}</option>
                        </select>
                        {m.target === 'custom' && (
                          <div className="mt-1.5">
                            <input
                              type="text"
                              list="known-custom-fields"
                              className={`${input} py-1 text-xs`}
                              value={m.customLabel ?? m.header}
                              onChange={(e) => setColumnCustomLabel(m.header, e.target.value)}
                              placeholder="Custom field name"
                              aria-label={`Custom field name for ${m.header}`}
                            />
                            <p className="mt-0.5 text-2xs text-subtle">
                              Saved as <code className="text-muted">{m.customKey || customFieldKey(m.customLabel ?? m.header)}</code>
                              {knownFields.some((f) => f.key === m.customKey) ? ' · reuses an existing field' : ''}
                            </p>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2"><MatchBadge m={m} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setStep('upload')} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-text">
              <ArrowLeft className="h-3.5 w-3.5" /> Choose a different file
            </button>
            <button
              type="button"
              onClick={goPreview}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Review before import
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && validation && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-elevated/40 p-4">
            <p className="text-sm font-semibold text-text">Here is what will happen</p>
            <p className="mt-1 text-xs text-muted">Nothing is saved yet. This is a dry run of your file against the contacts you already have.</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="New" value={validation.diff.created} tone="text-success" />
            <Stat label="Merged" value={validation.diff.merged} tone="text-primary-strong" />
            <Stat label="Skipped" value={validation.diff.skipped} tone="text-muted" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">When a contact already exists</label>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(MERGE_LABEL) as MergeStrategy[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMergeStrategy(k)}
                  className={`rounded-xl border p-3 text-left text-xs transition-colors ${mergeStrategy === k ? 'border-primary bg-primary-bg' : 'border-border hover:bg-surface-elevated'}`}
                >
                  <span className="block font-semibold text-text">{MERGE_LABEL[k].label}</span>
                  <span className="mt-0.5 block text-subtle">{MERGE_LABEL[k].help}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={goPreview} disabled={busy} className="mt-2 text-xs font-medium text-primary-strong hover:underline disabled:opacity-40">
              Recount with this choice
            </button>
          </div>

          {validation.rows && validation.rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-text">Row by row</p>
                <span className="inline-flex flex-wrap items-center gap-2 text-xs font-medium">
                  {(validation.diff.flagged ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 text-danger">
                      <AlertTriangle className="h-3.5 w-3.5" /> {validation.diff.flagged} flagged
                    </span>
                  )}
                  {(validation.diff.warned ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 text-warning">
                      <AlertTriangle className="h-3.5 w-3.5" /> {validation.diff.warned} to double-check
                    </span>
                  )}
                </span>
              </div>
              <p className="text-xs text-muted">Flagged rows still import where they can. We just could not use one field. Rows to double-check import as is.</p>
              <div className="max-h-96 overflow-auto rounded-xl border border-border">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="sticky top-0">
                    <tr className="border-b border-border bg-surface-elevated text-left text-xs text-muted">
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Action</th>
                      <th className="px-3 py-2 font-medium">Contact</th>
                      <th className="px-3 py-2 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validation.rows.map((r) => (
                      <tr key={r.rowIndex} className="border-b border-border/60 align-top last:border-0">
                        <td className="px-3 py-2 text-subtle">{r.rowIndex + 2}</td>
                        <td className="px-3 py-2"><ActionBadge action={r.action} severity={r.error ? (r.severity ?? 'error') : null} /></td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-text">{r.name || '—'}</p>
                          {r.email && <p className="text-2xs text-subtle">{r.email}</p>}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted">{rowDetail(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validation.rowTotal !== undefined && validation.rowTotal > validation.rows.length && (
                <p className="text-xs text-subtle">
                  + {validation.rowTotal - validation.rows.length} more row{validation.rowTotal - validation.rows.length === 1 ? '' : 's'}, handled the same way. Import to bring them all in.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setStep('map')} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-text">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to columns
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={busy || (validation.diff.created === 0 && validation.diff.merged === 0)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {busy ? 'Importing…' : `Import ${validation.diff.created + validation.diff.merged} contacts`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <EmptyState
          variant="cleared"
          title={undone ? 'Import undone' : 'Your contacts are in'}
          description={
            undone
              ? 'We removed the contacts this import added. You can import another file any time.'
              : `Created ${result.created}, merged ${result.merged}, skipped ${result.skipped}${result.failed ? `, ${result.failed} could not be saved` : ''}. You can import another file any time.`
          }
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              {!undone && result.created > 0 && (
                <button
                  type="button"
                  onClick={undo}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl border border-border-strong px-4 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-40"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Undo this import
                </button>
              )}
              <button
                type="button"
                onClick={() => { setStep('upload'); setSource(null); setImportId(null); setMapping([]); setValidation(null); setResult(null); setUndone(false); setBanner(null); setFilename(''); setPasted(''); setShowPaste(false); setQueue([]); }}
                className="inline-flex items-center gap-2 rounded-xl border border-border-strong px-4 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
              >
                <UploadCloud className="h-4 w-4" /> Import another file
              </button>
            </div>
          }
        />
      )}

      {filename && step !== 'upload' && step !== 'done' && (
        <p className="text-xs text-subtle">From {filename} · {source?.rowCount ?? 0} rows</p>
      )}
    </div>
  )
}

function MatchBadge({ m }: { m: ColumnMapping }) {
  if (m.target === 'ignore') return <span className="text-xs text-subtle">Skipped</span>
  if (m.target === 'custom') return <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-2xs font-medium text-muted">Custom field</span>
  if (m.reason === 'manual') return <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-2xs font-medium text-muted">You set this</span>
  const pct = Math.round(m.confidence * 100)
  const strong = m.confidence >= 0.8
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-2xs font-medium ${strong ? 'bg-success-bg text-success' : 'bg-primary-bg text-primary-strong'}`}>
      {m.reason === 'ai' ? 'Vera' : strong ? 'Auto' : 'Review'} · {pct}%
    </span>
  )
}

const ACTION_BADGE: Record<PreviewRow['action'], { label: string; cls: string }> = {
  create: { label: 'New', cls: 'bg-success-bg text-success' },
  merge: { label: 'Merge', cls: 'bg-primary-bg text-primary-strong' },
  skip: { label: 'Skip', cls: 'bg-surface-elevated text-muted' },
}

function ActionBadge({ action, severity }: { action: PreviewRow['action']; severity: 'error' | 'warning' | null }) {
  const a = ACTION_BADGE[action]
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`rounded-md px-1.5 py-0.5 text-2xs font-medium ${a.cls}`}>{a.label}</span>
      {severity === 'error' && <span className="rounded-md bg-danger-bg px-1.5 py-0.5 text-2xs font-medium text-danger">Needs a look</span>}
      {severity === 'warning' && <span className="rounded-md bg-warning-bg px-1.5 py-0.5 text-2xs font-medium text-warning">Double-check</span>}
    </span>
  )
}

/** The plain "why" line for a preview row: the field problem, the contact it matches, or nothing. */
function rowDetail(r: PreviewRow): string {
  if (r.error) return r.error
  if (r.action === 'merge') return r.matchedKey ? `Matches ${r.matchedKey}` : 'Matches a contact you already have'
  if (r.action === 'skip') return r.matchedKey ? `Duplicate of ${r.matchedKey}` : 'Nothing to import from this row'
  return 'New contact'
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-center">
      <p className={`text-2xl font-semibold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  )
}
