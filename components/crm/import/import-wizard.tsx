'use client'

// The CSV import wizard (CRM Master Build Plan Phase 2): parse -> map -> preview ->
// commit, with on-screen guidance at every step. The client parses the file (Papa
// Parse) for instant headers + a sample; everything else (AI assist, dedupe preview,
// commit) is a server action. Composes the page-framework kit primitives + semantic
// tokens (no hex). Copy passes NAMING + CONTENT-VOICE (no em dashes).

import { useState, useRef } from 'react'
import { UploadCloud, Sparkles, Loader2, Check, ArrowRight, ArrowLeft, FileSpreadsheet, AlertTriangle } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { parseCsvFile } from '@/lib/crm/import/parse'
import {
  stageImport,
  saveMapping,
  suggestMapping,
  previewImport,
  commitAction,
} from '@/lib/crm/import/actions'
import { isError } from '@/lib/action-result'
import { TARGET_FIELDS, type ColumnMapping, type MappingChoice, type MergeStrategy, type ParsedSource, type ValidationResult, type CommitResult } from '@/lib/crm/import/types'
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

export function ImportWizard({
  targetKind,
  spaces = [],
  lockedSpace,
}: {
  targetKind: 'member' | 'space'
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
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<Banner>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const bannerClass = banner
    ? banner.kind === 'ok'
      ? 'border-success/40 bg-success-bg text-success'
      : banner.kind === 'warn'
        ? 'border-primary/40 bg-primary-bg text-primary-strong'
        : 'border-danger/40 bg-danger-bg text-danger'
    : ''

  async function handleFile(file: File) {
    setBusy(true)
    setBanner(null)
    try {
      const parsed = await parseCsvFile(file)
      if (!parsed.headers.length || !parsed.rows.length) {
        setBanner({ kind: 'warn', text: 'That file has no rows we can read. Check it has a header row, then try again.' })
        return
      }
      setFilename(file.name)
      const res = await stageImport({
        targetKind,
        spaceId: targetKind === 'space' ? spaceId : null,
        filename: file.name,
        source: parsed,
      })
      if (isError(res)) {
        setBanner({ kind: 'err', text: res.error })
        return
      }
      setSource(parsed)
      setImportId(res.data.id)
      setMapping(res.data.mapping)
      setStep('map')
      if (res.data.remembered) setBanner({ kind: 'ok', text: 'We matched your columns the way you did last time. Review and adjust below.' })
    } catch {
      setBanner({ kind: 'err', text: 'We could not read that file. A plain .csv works best.' })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function setColumnTarget(header: string, target: MappingChoice) {
    setMapping((prev) =>
      prev.map((m) =>
        m.header === header
          ? { ...m, target, reason: 'manual', confidence: 1, ...(target === 'custom' && !m.customKey ? { customKey: header.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') } : {}) }
          : m,
      ),
    )
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
    setStep('done')
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

          <EmptyState
            variant="first-use"
            icon={FileSpreadsheet}
            title="Bring in a contacts CSV"
            description="Export from your phone, another CRM, or a spreadsheet. Keep a header row (Name, Email, Phone). We match the columns for you on the next step, so any layout works."
            action={
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy || (targetKind === 'space' && !spaceId)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                {busy ? 'Reading…' : 'Choose a CSV file'}
              </button>
            }
          />
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }} />
        </div>
      )}

      {step === 'map' && source && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-elevated/40 p-4">
            <p className="text-sm font-semibold text-text">Match your columns to contact fields</p>
            <p className="mt-1 text-xs text-muted">
              We guessed a match for each column. A confident match is applied for you; check the rest. Anything left as a
              custom field is kept on the contact, nothing is thrown away. Or let Vera take a pass.
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

          {validation.errors.length > 0 && (
            <div className="rounded-xl border border-warning/40 bg-warning-bg p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
                <AlertTriangle className="h-4 w-4" /> {validation.errors.length} row{validation.errors.length === 1 ? '' : 's'} need a look
              </p>
              <p className="mt-1 text-xs text-muted">These rows still import where they can. We just could not use one field.</p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted">
                {validation.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>Row {e.rowIndex + 2}: {e.message}</li>
                ))}
              </ul>
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
          title="Your contacts are in"
          description={`Created ${result.created}, merged ${result.merged}, skipped ${result.skipped}${result.failed ? `, ${result.failed} could not be saved` : ''}. You can import another file any time.`}
          action={
            <button
              type="button"
              onClick={() => { setStep('upload'); setSource(null); setImportId(null); setMapping([]); setValidation(null); setResult(null); setBanner(null); setFilename('') }}
              className="inline-flex items-center gap-2 rounded-xl border border-border-strong px-4 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
            >
              <UploadCloud className="h-4 w-4" /> Import another file
            </button>
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

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-center">
      <p className={`text-2xl font-semibold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  )
}
