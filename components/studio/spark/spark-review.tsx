'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE REVIEW BOARD (docs/STUDIO.md, ADR-597).
//
// The shared "here is your draft, is it good enough?" screen, driven entirely by the kernel's
// field model. Generalized from the Business Seeder's review board, which was the only surface on
// the platform that did this properly.
//
// Every row shows what an author needs to decide with: the confidence SIGNAL (✅ / ⚠️ / 🔴), the
// value (editable in place), whether the copy was AI-WRITTEN, whether it is WITHHELD pending a
// source or a confirm, and its PROVENANCE (the snippet and a link to where the claim came from).
//
// WHY A DRAFT-THEN-REVIEW SCREEN AT ALL: presenting a formed draft changes the author's job from
// "create this thing" to "is this right?", which is a far faster judgement. That only holds if the
// screen is HONEST about what it is unsure of, which is what the signals are for. A review board
// that paints everything green is worse than no review board, because it teaches people to skim.
//
// The board never decides what may publish. It MIRRORS the kernel's clearance rule, and the server
// re-checks independently before anything reaches a live surface.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Check, ExternalLink, ImageIcon, Pencil, ShieldQuestion, Sparkles, X } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/field'
import { SIGNAL_GLYPH, type ReviewSignal } from '@/lib/studio/kernel/ledger'
import type { FieldModel, FieldState } from '@/lib/studio/kernel/review-kernel'

const SIGNAL_STYLE: Record<ReviewSignal, string> = {
  green: 'border-success/30 bg-success-bg text-success',
  amber: 'border-warning/30 bg-warning-bg text-warning',
  red: 'border-danger/30 bg-danger-bg text-danger',
}

const SIGNAL_LABEL: Record<ReviewSignal, string> = {
  green: 'Verified',
  amber: 'Needs a look',
  red: 'Contradicted',
}

/** The "Vera can draw one" offer, when the entity declares a cover field and the draft has none.
 *  Omit it and no offer renders. It is an OFFER: publishing with no image stays a real outcome. */
export interface SparkCoverOffer {
  label: string
  busy?: boolean
  /** Runs the generation. The surface owns applying the returned URL to the draft. */
  onGenerate: () => void
}

/** The optional pre-publish read. A verdict is advice, never a gate: the entity that knows what a
 *  verdict COSTS decides that, not this board. */
export interface SparkQualityCheck {
  busy?: boolean
  onCheck: () => void
  verdict?: { status: string; score: number; notes: readonly string[] } | null
}

export interface SparkReviewProps {
  model: FieldModel
  cover?: SparkCoverOffer | null
  quality?: SparkQualityCheck | null
  /** Commit an edited value. The surface owns persistence. */
  onEdit: (path: string, value: string) => Promise<void> | void
  /**
   * Mark a withheld value as human-verified, without retyping it. This is the affordance that
   * makes a strict gate usable: most withheld facts are RIGHT, they just lack a citation.
   * Omit on entities with no ledger, and no confirm control renders.
   */
  onConfirm?: (path: string) => Promise<void> | void
  disabled?: boolean
}

export function SparkReview({ model, cover, quality, onEdit, onConfirm, disabled }: SparkReviewProps) {
  const s = model.summary

  return (
    <div>
      {/* The roll-up. Leads with what needs attention, not with the total, because the total is
          not a decision and "3 need a look" is. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3">
        <Tally signal="green" n={s.green} />
        <Tally signal="amber" n={s.amber} />
        {s.red > 0 && <Tally signal="red" n={s.red} />}
        {s.withheld > 0 && (
          <span className="ml-auto text-2xs text-muted">
            {s.withheld} held back until confirmed
          </span>
        )}
      </div>

      {cover && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3">
          <ImageIcon className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
          <span className="min-w-0 flex-1 text-xs text-muted">
            No {cover.label.toLowerCase()} yet. Vera can draw one, or you can add your own later.
          </span>
          <button
            type="button"
            onClick={cover.onGenerate}
            disabled={disabled || cover.busy}
            className="shrink-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
          >
            {cover.busy ? 'Drawing…' : 'Vera can draw one'}
          </button>
        </div>
      )}

      {quality && (
        <div className="mt-3 rounded-xl border border-border bg-surface px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldQuestion className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
            <span className="min-w-0 flex-1 text-xs text-muted">
              Want a second read before this goes out?
            </span>
            <button
              type="button"
              onClick={quality.onCheck}
              disabled={disabled || quality.busy}
              className="shrink-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
            >
              {quality.busy ? 'Reading…' : 'Check it over'}
            </button>
          </div>
          {quality.verdict && (
            <div className="mt-2 border-t border-border pt-2">
              <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">
                {quality.verdict.status} · {quality.verdict.score}
              </p>
              {quality.verdict.notes.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {quality.verdict.notes.map((n, i) => (
                    <li key={i} className="text-xs leading-snug text-muted">{n}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {s.blocked && (
        <p className="mt-3 rounded-xl border border-danger/30 bg-danger-bg px-4 py-3 text-xs text-danger">
          A contradicted fact is blocking this. Fix or drop the red rows below before it can go live.
        </p>
      )}

      <div className="mt-4 space-y-5">
        {model.sections.map((section) => (
          <section key={section.key}>
            <h3 className="text-sm font-bold text-text">{section.title}</h3>
            <p className="mt-0.5 text-2xs leading-snug text-muted">{section.desc}</p>
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface">
              {section.fields.map((field) => (
                <li key={field.path}>
                  <Row field={field} onEdit={onEdit} onConfirm={onConfirm} disabled={disabled} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function Tally({ signal, n }: { signal: ReviewSignal; n: number }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-2xs font-semibold ${SIGNAL_STYLE[signal]}`}>
      <span aria-hidden>{SIGNAL_GLYPH[signal]}</span>
      {n} {SIGNAL_LABEL[signal].toLowerCase()}
    </span>
  )
}

function Row({
  field,
  onEdit,
  onConfirm,
  disabled,
}: {
  field: FieldState
  onEdit: SparkReviewProps['onEdit']
  onConfirm?: SparkReviewProps['onConfirm']
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(field.value)
  const [busy, setBusy] = useState(false)
  const long = field.kind === 'longtext'

  const commit = async () => {
    setBusy(true)
    try {
      await onEdit(field.path, draft)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 shrink-0 rounded-full border px-1.5 py-0.5 text-3xs font-semibold ${SIGNAL_STYLE[field.signal]}`}
          title={SIGNAL_LABEL[field.signal]}
        >
          <span aria-hidden>{SIGNAL_GLYPH[field.signal]}</span>
          <span className="sr-only">{SIGNAL_LABEL[field.signal]}</span>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-2xs font-semibold uppercase tracking-wide text-subtle">{field.label}</span>
            {field.generated && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-elevated px-1.5 py-0.5 text-3xs text-muted">
                <Sparkles className="h-2.5 w-2.5" aria-hidden />{' '}
                {field.kind === 'image' || field.kind === 'images' ? 'Made by Vera' : 'Written by Vera'}
              </span>
            )}
            {field.withheld && (
              <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning-bg px-1.5 py-0.5 text-3xs text-warning">
                <ShieldQuestion className="h-2.5 w-2.5" aria-hidden /> Held back
              </span>
            )}
          </div>

          {editing ? (
            <div className="mt-1.5">
              {long ? (
                <Textarea rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={busy} />
              ) : (
                <Input value={draft} onChange={(e) => setDraft(e.target.value)} disabled={busy} />
              )}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={commit}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-2xs font-semibold text-on-primary disabled:opacity-60"
                >
                  <Check className="h-3 w-3" aria-hidden /> Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(field.value)
                    setEditing(false)
                  }}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-2xs font-semibold text-muted disabled:opacity-60"
                >
                  <X className="h-3 w-3" aria-hidden /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className={`mt-0.5 break-words text-sm ${field.value ? 'text-text' : 'text-subtle italic'}`}>
              {field.value || 'Not set'}
            </p>
          )}

          {/* Provenance: where the claim came from. A citation an author cannot SEE is a citation
              they cannot trust, so the snippet is shown inline rather than hidden behind the link. */}
          {field.provenance?.snippet && (
            <p className="mt-1.5 border-l-2 border-border pl-2 text-2xs leading-snug text-muted">
              &ldquo;{field.provenance.snippet}&rdquo;
              {field.provenance.sourceUrl && (
                <a
                  href={field.provenance.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 inline-flex items-center gap-0.5 text-primary-strong underline-offset-2 hover:underline"
                >
                  source <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                </a>
              )}
            </p>
          )}
        </div>

        {!editing && (
          <div className="flex shrink-0 gap-1">
            {field.withheld && onConfirm && (
              <button
                type="button"
                onClick={() => onConfirm(field.path)}
                disabled={disabled}
                title="Confirm this is right"
                className="rounded-lg border border-border p-1.5 text-muted transition-colors hover:text-success disabled:opacity-60"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">Confirm {field.label}</span>
              </button>
            )}
            {field.editable && (
              <button
                type="button"
                onClick={() => {
                  setDraft(field.value)
                  setEditing(true)
                }}
                disabled={disabled}
                className="rounded-lg border border-border p-1.5 text-muted transition-colors hover:text-text disabled:opacity-60"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">Edit {field.label}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
