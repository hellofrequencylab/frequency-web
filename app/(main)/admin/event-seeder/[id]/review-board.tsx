'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE EVENT SEEDER — the REVIEW BOARD client (ADR-989).
//
// Renders the FIELD MODEL the Studio kernel built from the EVENT MANIFEST. Every row's label,
// grouping, order, and signal comes from that model: this file knows how a field LOOKS, never
// which fields exist. Add a field to lib/studio/entities/event.ts (and to the seeder's carried
// set) and it appears here with no edit to this component.
//
// Each row shows the confidence signal (✅ verified by a person / ⚠️ read by AI, needs a look /
// 🔴 contradicted), the value, whether it is AI-written copy, the source snippet it was read
// from, and the controls: EDIT inline, CONFIRM, DROP. Seed writes an unlisted event draft.
//
// All mutations go through the gated server actions; this holds only the optimistic model and
// transient UI state.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageSquareQuote,
  Pencil,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'
import { Banner, StatusChip } from '@/components/admin/status'
import { SIGNAL_GLYPH, type ReviewSignal } from '@/lib/studio/kernel/ledger'
import type { FieldModel, FieldState } from '@/lib/studio/kernel/review-kernel'
import type { IntakeStatus } from '@/lib/events/seed/intake'
import {
  approveStagedEvent,
  restoreStagedEvent,
  setAsideStagedEvent,
  updateStagedEventField,
  type FieldAction,
} from '../actions'

const SIGNAL_TONE: Record<ReviewSignal, 'success' | 'warning' | 'danger'> = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
}
const SIGNAL_LABEL: Record<ReviewSignal, string> = {
  green: 'You confirmed this',
  amber: 'Needs a look',
  red: 'Contradicted',
}

export function ReviewBoard({
  intakeId,
  status,
  initialModel,
  note,
  sourceText,
  imageNames,
  targetEventId,
  error: rowError,
}: {
  intakeId: string
  status: IntakeStatus
  initialModel: FieldModel
  note: string
  sourceText: string
  imageNames: string[]
  targetEventId: string | null
  error: string | null
}) {
  const router = useRouter()
  const [model, setModel] = useState<FieldModel>(initialModel)
  const [eventId, setEventId] = useState<string | null>(targetEventId)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const seeded = status === 'applied' || !!eventId
  const setAside = status === 'failed'
  const editable = status === 'review'
  const s = model.summary

  function seed() {
    setError(null)
    startTransition(async () => {
      const res = await approveStagedEvent(intakeId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setEventId(res.eventId)
      router.refresh()
    })
  }

  function aside() {
    setError(null)
    startTransition(async () => {
      const res = await setAsideStagedEvent(intakeId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function restore() {
    setError(null)
    startTransition(async () => {
      const res = await restoreStagedEvent(intakeId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Roll-up + the one decision on this page */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2 text-body-sm">
          <StatusChip tone="success" size="sm">✅ {s.green} confirmed</StatusChip>
          <StatusChip tone="warning" size="sm">⚠️ {s.amber} to check</StatusChip>
          {s.red > 0 && <StatusChip tone="danger" size="sm">🔴 {s.red} contradicted</StatusChip>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="neutral" size="sm">Unlisted until you publish</StatusChip>
          {editable && (
            <>
              <Button variant="ghost" size="sm" onClick={aside} disabled={pending}>
                <X className="h-4 w-4" /> Set aside
              </Button>
              <Button onClick={seed} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {pending ? 'Seeding…' : 'Seed as a draft'}
              </Button>
            </>
          )}
          {setAside && (
            <Button variant="secondary" size="sm" onClick={restore} disabled={pending}>
              <Undo2 className="h-4 w-4" /> Put it back
            </Button>
          )}
        </div>
      </div>

      {error && <Banner tone="critical" title="Could not seed this event">{error}</Banner>}

      {setAside && rowError && (
        <Banner tone="warning" title="Set aside">
          {rowError} Put it back to review and seed it whenever you want.
        </Banner>
      )}

      {seeded && eventId && (
        <div className="rounded-2xl border border-success/30 bg-success-bg p-4" role="status">
          <p className="flex items-center gap-1.5 text-body-sm font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Seeded as an unlisted draft
          </p>
          <p className="mt-1 text-body-sm text-muted">
            It is in no catalog, no feed, and no search yet. Open the draft to add the photos, check the
            date, and publish it when you are ready. Publishing on the organizer&apos;s behalf sends them a
            claim link so they can take it over.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-body-sm font-semibold">
            <a
              href={`/events/drafts/${eventId}`}
              className="inline-flex items-center gap-1 text-info hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Open the draft <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          {imageNames.length > 0 && (
            <p className="mt-2 text-2xs text-muted">
              {imageNames.length} photo{imageNames.length === 1 ? ' was' : 's were'} posted with this in the
              chat ({imageNames.slice(0, 4).join(', ')}
              {imageNames.length > 4 ? ', and more' : ''}). Add them on the draft.
            </p>
          )}
        </div>
      )}

      {/* The receipt: what the read was made from. */}
      {(sourceText || note) && (
        <details className="rounded-2xl border border-border bg-surface p-4">
          <summary className="cursor-pointer text-body-sm font-semibold text-text">
            <span className="inline-flex items-center gap-1.5">
              <MessageSquareQuote className="h-4 w-4 text-primary-strong" aria-hidden />
              The message this was read from
            </span>
          </summary>
          {note && <p className="mt-2 text-body-sm text-muted">{note}</p>}
          {sourceText && (
            <p className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-elevated p-3 text-body-sm text-muted">
              {sourceText}
            </p>
          )}
        </details>
      )}

      {model.sections.map((section) => (
        <section key={section.key} className="space-y-2">
          <div>
            <h3 className="text-body font-bold text-text">{section.title}</h3>
            <p className="mt-0.5 text-body-sm text-muted">{section.desc}</p>
          </div>
          <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {section.fields.map((f) => (
              <FieldRow
                key={f.path}
                intakeId={intakeId}
                field={f}
                readOnly={!editable}
                onUpdate={setModel}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function FieldRow({
  intakeId,
  field,
  readOnly,
  onUpdate,
}: {
  intakeId: string
  field: FieldState
  readOnly: boolean
  onUpdate: (m: FieldModel) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(field.value)
  const [showSource, setShowSource] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(action: FieldAction) {
    setRowError(null)
    startTransition(async () => {
      const res = await updateStagedEventField(intakeId, field.path, action)
      if (!res.ok) {
        setRowError(res.error)
        return
      }
      setEditing(false)
      onUpdate(res.model)
    })
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={SIGNAL_TONE[field.signal]} size="sm">
              {SIGNAL_GLYPH[field.signal]} {SIGNAL_LABEL[field.signal]}
            </StatusChip>
            <span className="text-meta font-semibold text-text">{field.label}</span>
            {field.generated && (
              <span className="inline-flex items-center gap-1 text-2xs text-muted">
                <Sparkles className="h-3 w-3" aria-hidden /> AI copy
              </span>
            )}
          </div>

          {editing ? (
            <Textarea
              aria-label={`Edit ${field.label}`}
              className="mt-2 resize-y"
              rows={field.value.length > 60 ? 3 : 1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
          ) : (
            <p
              className={`mt-1 whitespace-pre-wrap break-words text-body-sm ${
                field.value ? 'text-text' : 'italic text-subtle'
              }`}
            >
              {field.value || 'Not set'}
            </p>
          )}

          {field.provenance && (
            <div className="mt-1.5">
              <button
                type="button"
                onClick={() => setShowSource((v) => !v)}
                className="text-2xs font-medium text-info hover:underline"
              >
                {showSource ? 'Hide where this came from' : 'Where this came from'}
              </button>
              {showSource && (
                <div className="mt-1 rounded-lg border border-border bg-surface-elevated p-2 text-2xs text-muted">
                  {field.provenance.snippet ? (
                    <p className="whitespace-pre-wrap break-words">“{field.provenance.snippet}”</p>
                  ) : (
                    <p className="italic">No source text recorded.</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span>
                      {field.provenance.kind === 'generated'
                        ? 'Written by AI'
                        : field.provenance.kind === 'inferred'
                          ? 'Read out of the message by AI'
                          : 'Recorded as a fact'}
                    </span>
                    <span>· {Math.round((field.provenance.confidence ?? 0) * 100)}% sure</span>
                    {field.provenance.verifiedBy === 'human' && (
                      <span className="inline-flex items-center gap-0.5 text-success">
                        <CheckCircle2 className="h-3 w-3" /> you confirmed it
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {rowError && <p className="mt-1 text-2xs text-danger">{rowError}</p>}
        </div>

        {!readOnly && (
          <div className="flex shrink-0 items-center gap-1">
            {editing ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => run({ kind: 'edit', value: draft })}
                  disabled={pending}
                >
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false)
                    setDraft(field.value)
                  }}
                  disabled={pending}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(field.value)
                    setEditing(true)
                  }}
                  disabled={pending}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                {field.signal !== 'green' && field.value && (
                  <Button size="sm" variant="successOutline" onClick={() => run({ kind: 'confirm' })} disabled={pending}>
                    <Check className="h-3.5 w-3.5" /> Confirm
                  </Button>
                )}
                {field.value && (
                  <Button size="sm" variant="ghost" onClick={() => run({ kind: 'drop' })} disabled={pending}>
                    <X className="h-3.5 w-3.5" /> Drop
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
