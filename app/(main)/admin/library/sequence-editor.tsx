'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { z } from 'zod'
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
  History,
  Loader2,
  Route,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { STEP_REGISTRY, STEP_TYPES } from '@/lib/onboarding/step-registry'
import type { StepType } from '@/lib/onboarding/step-types'
import { listPersonas } from '@/lib/onboarding/personas'
import type { SequenceDef } from '@/lib/onboarding/sequence-schema'
import type { LibraryVersion } from '@/lib/library/versions'
import { isError } from '@/lib/action-result'
import { createSequence, updateSequenceConfig, setSequenceStatus } from './sequence-actions'
import { rollbackAssetVersion } from './recraft-actions'

// The Loom Studio editor for a managed onboarding flow (Loom kind='sequence'; docs/LOOM-PLATFORM.md
// §3). It edits ONLY the SequenceDef config — Layer-2 data: order, copy, targeting, gating. This is
// NOT a Puck editor (🔴 §10 module-surface boundary): it never offers Puck blocks or App tiles. Each
// step's `type` is chosen from the code step-registry's known types; the copy field set is driven by
// that type's contentSchema. Save runs the janitor-gated write action (which parses + validates and
// snapshots a version first); Publish moves the flow onto the resolver's live rungs, and can never
// publish an invalid flow.

// ── Editor working model (a flat, string-only view of the SequenceDef, easiest to edit) ────────────

type EditStep = {
  id: string
  type: StepType
  label: string
  content: Record<string, string>
}

const inputBase =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong/20'

/** The operator-editable copy field keys for a step type, read from its Zod contentSchema shape. */
function contentFieldsFor(type: StepType): string[] {
  const schema = STEP_REGISTRY[type]?.contentSchema as unknown as
    | { shape?: z.ZodRawShape }
    | undefined
  const shape = schema && 'shape' in schema ? schema.shape : undefined
  return shape ? Object.keys(shape) : []
}

const MULTILINE = /description|placeholder|body|text|line|subhead/i

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
}

function makeUniqueId(type: StepType, taken: Set<string>): string {
  if (!taken.has(type)) return type
  let n = 2
  while (taken.has(`${type}-${n}`)) n += 1
  return `${type}-${n}`
}

function toEditSteps(def: SequenceDef): EditStep[] {
  return def.steps.map((s) => {
    const content: Record<string, string> = {}
    for (const [k, v] of Object.entries(s.content ?? {})) {
      if (typeof v === 'string') content[k] = v
    }
    return {
      id: s.id,
      type: (STEP_TYPES as readonly string[]).includes(s.type) ? (s.type as StepType) : STEP_TYPES[0],
      label: s.label ?? '',
      content,
    }
  })
}

/** Build the SequenceDef to persist. Normalizes the terminal action onto the LAST step (the only key
 *  in SEQUENCE_ACTION_KEYS today) and clears it elsewhere, so a well-formed edit satisfies the rules. */
function toDef(base: SequenceDef, label: string, eyebrow: string, steps: EditStep[], personas: string[], regionIds: string[]): SequenceDef {
  const lastIndex = steps.length - 1
  return {
    key: base.key,
    label: label.trim() || base.label,
    ...(eyebrow.trim() ? { eyebrow: eyebrow.trim() } : {}),
    steps: steps.map((s, i) => {
      const content: Record<string, string> = {}
      for (const [k, v] of Object.entries(s.content)) {
        if (v.trim()) content[k] = v
      }
      return {
        id: s.id,
        type: s.type,
        ...(s.label.trim() ? { label: s.label.trim() } : {}),
        ...(Object.keys(content).length ? { content } : {}),
        ...(i === lastIndex ? { action: 'completeOnboarding' } : {}),
      }
    }),
    ...(personas.length || regionIds.length
      ? { target: { ...(personas.length ? { personas } : {}), ...(regionIds.length ? { regionIds } : {}) } }
      : {}),
  }
}

const LIVE = new Set(['approved', 'final'])

function StatusBadge({ status }: { status: string }) {
  const live = LIVE.has(status)
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        live ? 'bg-primary text-on-primary' : 'border border-border text-muted'
      }`}
    >
      {live && <CheckCircle2 className="h-3 w-3" aria-hidden />}
      {status}
    </span>
  )
}

// ── The editor ─────────────────────────────────────────────────────────────────────────────────────

export function SequenceEditor({
  id,
  status,
  def,
  versions,
}: {
  id: string
  status: string
  def: SequenceDef
  versions: LibraryVersion[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const [label, setLabel] = useState(def.label)
  const [eyebrow, setEyebrow] = useState(def.eyebrow ?? '')
  const [steps, setSteps] = useState<EditStep[]>(() => toEditSteps(def))
  const [personas, setPersonas] = useState<string[]>(def.target?.personas ?? [])
  const [regionInput, setRegionInput] = useState((def.target?.regionIds ?? []).join(', '))
  const [errors, setErrors] = useState<string[]>([])
  const [saved, setSaved] = useState(false)

  const allPersonas = listPersonas()
  const live = LIVE.has(status)

  function patchStep(index: number, patch: Partial<EditStep>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
    setSaved(false)
  }

  function patchContent(index: number, key: string, value: string) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, content: { ...s.content, [key]: value } } : s)),
    )
    setSaved(false)
  }

  function changeType(index: number, type: StepType) {
    // A type swap resets the copy fields to that type's set (old keys no longer apply).
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, type, content: {} } : s)))
    setSaved(false)
  }

  function addStep() {
    setSteps((prev) => {
      const taken = new Set(prev.map((s) => s.id))
      const type = STEP_TYPES[0] as StepType
      return [...prev, { id: makeUniqueId(type, taken), type, label: '', content: {} }]
    })
    setSaved(false)
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index))
    setSaved(false)
  }

  function move(index: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setSaved(false)
  }

  function save() {
    setErrors([])
    setSaved(false)
    const regionIds = regionInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const next = toDef(def, label, eyebrow, steps, personas, regionIds)
    start(async () => {
      const res = await updateSequenceConfig(id, next)
      if (isError(res)) {
        setErrors(res.error.split('. ').map((s) => s.trim()).filter(Boolean))
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  function togglePublish() {
    setErrors([])
    start(async () => {
      const res = await setSequenceStatus(id, live ? 'draft' : 'approved')
      if (isError(res)) {
        setErrors([res.error])
        return
      }
      router.refresh()
    })
  }

  function rollback(versionId: string) {
    if (!window.confirm('Restore this version? The current flow is snapshotted first, so this is reversible.')) return
    start(async () => {
      const res = await rollbackAssetVersion(id, versionId)
      if ('error' in res) {
        setErrors([res.error])
        return
      }
      router.refresh()
    })
  }

  return (
    <AdminTemplate
      title={label || 'Onboarding flow'}
      icon={Route}
      eyebrow="Onboarding flow"
      description="Edit the flow's steps, copy, and who sees it. Publish to serve it to matching members; the resolver falls back to the code default whenever nothing is published."
      width="default"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          <Link
            href="/onboarding/sequence-preview"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-2xl border border-border px-3 py-2 text-sm font-medium text-text hover:bg-surface-elevated"
          >
            <Eye className="h-4 w-4" aria-hidden />
            Preview
          </Link>
          <button
            type="button"
            onClick={togglePublish}
            disabled={pending}
            className={`inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
              live
                ? 'border border-border-strong text-text hover:bg-surface-elevated'
                : 'bg-primary text-on-primary hover:opacity-90'
            }`}
          >
            {live ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      }
      actionsAlign="end"
    >
      <div className="mb-4">
        <Link href="/admin/library?lane=sequence" className="text-sm font-medium text-primary-strong hover:underline">
          ← All onboarding flows
        </Link>
      </div>

      {errors.length > 0 && (
        <div role="alert" className="mb-4 rounded-2xl border border-danger/40 bg-danger/5 p-4">
          <p className="text-sm font-semibold text-danger">This flow could not be saved.</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-danger">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {saved && !pending && errors.length === 0 && (
        <div className="mb-4 rounded-2xl border border-border bg-surface-elevated/50 p-3 text-sm text-muted">
          Saved. A version was snapshotted before the change.
        </div>
      )}

      <AdminSection title="Flow details" description="The label and the quiet kicker shown above every step's heading.">
        <div className="grid gap-4 @xl:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-text">Label</span>
            <input value={label} onChange={(e) => { setLabel(e.target.value); setSaved(false) }} className={inputBase} placeholder="Every new member" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-text">Eyebrow</span>
            <input value={eyebrow} onChange={(e) => { setEyebrow(e.target.value); setSaved(false) }} className={inputBase} placeholder="Welcome home" />
          </label>
        </div>
      </AdminSection>

      <AdminSection
        title="Steps"
        description="The ordered steps a member walks. Each step's type binds to a coded step in the registry; the last step completes onboarding."
      >
        <div className="space-y-4">
          {steps.map((step, index) => {
            const fields = contentFieldsFor(step.type)
            const isLast = index === steps.length - 1
            return (
              <div key={step.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium text-muted">
                    Step {index + 1}
                  </span>
                  {isLast && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-bg px-2 py-0.5 text-xs font-medium text-primary-strong">
                      Completes onboarding
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0 || pending} className="rounded-lg p-1.5 text-subtle hover:bg-surface-elevated hover:text-text disabled:opacity-30" aria-label="Move up">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => move(index, 1)} disabled={isLast || pending} className="rounded-lg p-1.5 text-subtle hover:bg-surface-elevated hover:text-text disabled:opacity-30" aria-label="Move down">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => removeStep(index)} disabled={steps.length === 1 || pending} className="rounded-lg p-1.5 text-subtle hover:bg-danger/10 hover:text-danger disabled:opacity-30" aria-label="Remove step">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </div>

                <div className="grid gap-3 @xl:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-text">Type</span>
                    <select
                      value={step.type}
                      onChange={(e) => changeType(index, e.target.value as StepType)}
                      className={inputBase}
                    >
                      {STEP_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-text">Progress label</span>
                    <input
                      value={step.label}
                      onChange={(e) => patchStep(index, { label: e.target.value })}
                      placeholder={STEP_REGISTRY[step.type]?.label ?? ''}
                      className={inputBase}
                    />
                  </label>
                </div>

                {fields.length > 0 && (
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    {fields.map((key) => (
                      <label key={key} className="block">
                        <span className="mb-1.5 block text-sm font-medium text-text">{humanizeKey(key)}</span>
                        {MULTILINE.test(key) ? (
                          <textarea
                            value={step.content[key] ?? ''}
                            onChange={(e) => patchContent(index, key, e.target.value)}
                            rows={2}
                            className={`${inputBase} resize-none`}
                          />
                        ) : (
                          <input
                            value={step.content[key] ?? ''}
                            onChange={(e) => patchContent(index, key, e.target.value)}
                            className={inputBase}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <button
            type="button"
            onClick={addStep}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-dashed border-border-strong px-4 py-2 text-sm font-medium text-text hover:bg-surface-elevated disabled:opacity-60"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add step
          </button>
        </div>
      </AdminSection>

      <AdminSection
        title="Who sees it"
        description="Leave every axis empty to serve this flow to everyone. Adding a persona or region narrows it; the resolver keeps the most specific match."
      >
        <div className="space-y-4">
          <div>
            <span className="mb-2 block text-sm font-medium text-text">Personas</span>
            <div className="flex flex-wrap gap-2">
              {allPersonas.map((p) => {
                const on = personas.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPersonas((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))
                      setSaved(false)
                    }}
                    aria-pressed={on}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                      on ? 'bg-primary text-on-primary' : 'border border-border text-muted hover:bg-surface-elevated'
                    }`}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-text">Region ids</span>
            <input
              value={regionInput}
              onChange={(e) => { setRegionInput(e.target.value); setSaved(false) }}
              placeholder="Optional. Comma-separated nexus_region_id values."
              className={inputBase}
            />
            <span className="mt-1 block text-xs text-subtle">Advanced. Leave empty to serve every region.</span>
          </label>
        </div>
      </AdminSection>

      <div className="sticky bottom-0 z-10 -mx-1 mt-2 flex items-center gap-3 border-t border-border bg-surface/95 px-1 py-3 backdrop-blur">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Save changes
        </button>
        {live && (
          <span className="text-xs text-subtle">This flow is live. Saving updates what matching members see.</span>
        )}
      </div>

      {versions.length > 0 && (
        <AdminSection title="History" description="Every save snapshots the prior flow. Restore any point; the current flow is snapshotted first, so a rollback is itself reversible.">
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-4 py-3">
                <History className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text">
                    Version {v.version}
                    {v.isCurrent && <span className="ml-2 text-xs font-normal text-primary-strong">current</span>}
                  </p>
                  <p className="truncate text-xs text-subtle">
                    {v.note ?? 'Edit'} · {v.createdAt ? new Date(v.createdAt).toLocaleString() : ''}
                  </p>
                </div>
                {!v.isCurrent && (
                  <button
                    type="button"
                    onClick={() => rollback(v.id)}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-elevated disabled:opacity-60"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        </AdminSection>
      )}
    </AdminTemplate>
  )
}

// ── The "New onboarding flow" button for the lane list ───────────────────────────────────────────────

export function NewSequenceButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function create() {
    const title = window.prompt('Name the onboarding flow')
    if (!title || !title.trim()) return
    setError(null)
    start(async () => {
      const res = await createSequence({ title: title.trim() })
      if (isError(res)) {
        setError(res.error)
        return
      }
      router.push(`/admin/library?lane=sequence&edit=${res.data.id}`)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={create}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
        New onboarding flow
      </button>
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  )
}
