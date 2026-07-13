'use client'

// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the REVIEW BOARD client (P3, docs/BUSINESS-IMPORTER.md §4).
//
// Renders the review model field by field. Each row shows: the confidence SIGNAL
// (✅ green / ⚠️ amber / 🔴 red from the ledger), the value, whether it is AI-GENERATED
// copy (marked), whether it is a WITHHELD commercial fact ("needs a source or your confirm"),
// its PROVENANCE (citation snippet + source link, one click), and the per-field controls:
// EDIT inline, CONFIRM (clears a withheld fact without retyping), DROP. Approve -> Apply seeds
// an unlisted demo Space and links to its profile + site.
//
// All mutations go through the gated server actions (updateImportField / approveBusinessImport);
// this component holds only the optimistic model + transient UI state. The board NEVER offers a
// path that publishes an uncleared commercial fact — confirm sets a human-verified ledger fact,
// which the materializer's Gate B independently re-checks (docs §4.3).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, X, Pencil, ExternalLink, Sparkles, ShieldQuestion, CheckCircle2, Palette, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Banner, StatusChip } from '@/components/admin/status'
import { cn } from '@/lib/utils'
import { updateImportField, approveBusinessImport, reseedBusinessImport, reresearchWithInfo, setBusinessListed, type FieldAction } from '../actions'
import { SEED_MOODS, type SeedMood } from '@/lib/importer/moods'
import { SIGNAL_GLYPH, type ReviewField, type ReviewModel, type ReviewSignal } from '../review-model'
import { SeederImages } from './seeder-images'

const SIGNAL_TONE: Record<ReviewSignal, 'success' | 'warning' | 'danger'> = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
}
const SIGNAL_LABEL: Record<ReviewSignal, string> = {
  green: 'Verified',
  amber: 'Needs a look',
  red: 'Contradicted',
}

type ApplyLinks = { profileHref: string; siteHref: string } | null

export function ReviewBoard({
  intakeId,
  initialModel,
  status,
  isDemo,
  appliedSpaceId,
  initialMood,
  initialImages,
  initialImagePlan,
  initialLockHero,
  initialListed,
  initialDirections,
}: {
  intakeId: string
  initialModel: ReviewModel
  status: 'review' | 'applied'
  isDemo: boolean
  appliedSpaceId: string | null
  initialMood: SeedMood
  initialImages: string[]
  initialImagePlan: { url: string; category: string; alt: string }[]
  initialLockHero: boolean
  initialListed: boolean
  /** The operator DIRECTIONS currently stored on the intake (Importer v2.1) — prefills the re-seed box. */
  initialDirections: string
}) {
  const router = useRouter()
  const [model, setModel] = useState<ReviewModel>(initialModel)
  const [mood, setMood] = useState<SeedMood>(initialMood)
  const [lockHero, setLockHero] = useState(initialLockHero)
  const [listed, setListed] = useState(initialListed)
  const [listing, startListing] = useTransition()
  const [reseedMsg, setReseedMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [reseeding, startReseed] = useTransition()
  const [directions, setDirections] = useState(initialDirections)
  // "Add more info" boxes (Importer v2.1): extra source content folded into the master profile at re-seed.
  const [showAddInfo, setShowAddInfo] = useState(false)
  const [info, setInfo] = useState({ overview: '', webContent: '', bookingSchedule: '', differentiators: '', pastedContent: '' })
  const [infoMsg, setInfoMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [addingInfo, startAddInfo] = useTransition()
  const setInfoField = (key: keyof typeof info, value: string) => setInfo((prev) => ({ ...prev, [key]: value }))
  const hasInfo = Object.values(info).some((v) => v.trim().length > 0)
  const [applied, setApplied] = useState<boolean>(status === 'applied')
  const [links, setLinks] = useState<ApplyLinks>(
    appliedSpaceId ? { profileHref: `/spaces/${appliedSpaceId}`, siteHref: `/spaces/${appliedSpaceId}` } : null,
  )
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<string[]>([])
  const [applying, startApply] = useTransition()

  const s = model.summary
  // The master profile stays editable AFTER apply too, so an operator can review / confirm / clear a
  // "needs a look" field on a seeded Space, then Re-apply to push it live (updateImportField allows applied).
  const readOnly = false

  function toggleListed(next: boolean) {
    setListed(next)
    startListing(async () => {
      const res = await setBusinessListed(intakeId, next)
      if (!res.ok) {
        setListed(!next) // revert on failure
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function onFieldUpdate(next: ReviewModel) {
    setModel(next)
  }

  function approve() {
    setError(null)
    setBlocked([])
    startApply(async () => {
      const res = await approveBusinessImport(intakeId)
      if (!res.ok) {
        setError(res.error)
        setBlocked(res.blockedFields ?? [])
        return
      }
      setApplied(true)
      setLinks({ profileHref: res.profileHref, siteHref: res.siteHref })
      router.refresh()
    })
  }

  // Re-Seed (Importer v2): regenerate the whole page in the chosen mood — copy, layout, images — and
  // re-apply it to the live Space, EXCEPT what is locked. `lockHero` freezes the hero headline + image;
  // edit-wins protects any hand-edited prose. Verified facts are never touched.
  function reseed(next: SeedMood) {
    setMood(next)
    setReseedMsg(null)
    startReseed(async () => {
      // Pass the operator's directions only when non-blank, so an empty box never CLEARS stored directions.
      const res = await reseedBusinessImport(intakeId, next, lockHero, directions.trim() || undefined)
      if (!res.ok) {
        setReseedMsg({ tone: 'err', text: res.error })
        return
      }
      const label = SEED_MOODS.find((m) => m.key === next)?.label ?? next
      const heroNote = lockHero ? ' The hero stayed locked.' : ''
      setReseedMsg({
        tone: 'ok',
        text: res.revoiced
          ? res.reapplied
            ? `Re-seeded the page in the ${label} mood and pushed it live.${heroNote}`
            : `Re-seeded the draft in the ${label} mood.${heroNote}`
          : res.reapplied
            ? `Re-applied the page in the ${label} mood.${heroNote} Turn AI on to also re-voice the copy.`
            : 'Mood saved. Turn AI on to re-voice the copy.',
      })
      router.refresh()
    })
  }

  // Add more info to the master profile + re-research (Importer v2.1). Folds the new boxes, appends them to
  // the source, and (when new source is added) re-runs research so new facts extract. Directions here also
  // stick for the re-voice.
  function addInfo() {
    setInfoMsg(null)
    startAddInfo(async () => {
      const res = await reresearchWithInfo(intakeId, { ...info, directions: directions.trim() || undefined })
      if (!res.ok) {
        setInfoMsg({ tone: 'err', text: res.error })
        return
      }
      setInfo({ overview: '', webContent: '', bookingSchedule: '', differentiators: '', pastedContent: '' })
      setInfoMsg({
        tone: 'ok',
        text: res.researching
          ? 'Added. Re-reading the sources now. When it lands back in review, check the new facts and Re-apply to push it live.'
          : 'Directions saved. Pick a mood to re-seed with them.',
      })
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Roll-up legend + approve */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusChip tone="success" size="sm">✅ {s.green} verified</StatusChip>
          <StatusChip tone="warning" size="sm">⚠️ {s.amber} to review</StatusChip>
          {s.red > 0 && <StatusChip tone="danger" size="sm">🔴 {s.red} contradicted</StatusChip>}
          {s.withheld > 0 && (
            <span className="text-xs text-muted">
              {s.withheld} commercial fact{s.withheld === 1 ? '' : 's'} withheld until cleared
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusChip tone="neutral" size="sm">{isDemo ? 'Unlisted demo' : 'Owner Space'}</StatusChip>
          {!applied && (
            <Button onClick={approve} disabled={applying || s.blocked}>
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {applying ? 'Applying…' : 'Approve and seed'}
            </Button>
          )}
        </div>
      </div>

      {/* Mood + Re-Seed (Importer v2): pick a mood to re-voice the copy. Facts stay put; only the tone
          changes. Available on a reviewed or applied draft (there is verified copy to re-voice). */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-text">
          <Palette className="h-4 w-4 text-primary-strong" aria-hidden />
          Mood and re-seed
        </div>
        <p className="mt-0.5 text-xs text-muted">
          Pick a mood to re-seed the whole page: the copy, the layout, and the images regenerate and push
          to the live Space. Verified facts stay put, and anything you edited by hand is kept. Lock the hero
          below to freeze the headline and hero image while everything else refreshes.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SEED_MOODS.map((m) => {
            const active = m.key === mood
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => reseed(m.key)}
                disabled={reseeding}
                title={m.description}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50',
                  active
                    ? 'border-primary bg-primary-bg text-primary-strong'
                    : 'border-border bg-surface text-muted hover:border-border-strong hover:text-text',
                )}
              >
                {reseeding && active ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : active ? (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                )}
                {m.label}
              </button>
            )
          })}
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={lockHero}
            onChange={(e) => setLockHero(e.target.checked)}
            disabled={reseeding}
            className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
          />
          Lock the hero (freeze the headline and hero image; re-seed everything else)
        </label>

        {/* Directions (Importer v2.1): a freeform steer folded into the re-voice. Persists on re-seed, so it
            keeps driving future runs. Blank leaves any stored directions untouched. */}
        <div className="mt-3">
          <label htmlFor="reseed-directions" className="block text-2xs font-semibold uppercase tracking-wide text-subtle">
            Directions for the re-seed
          </label>
          <textarea
            id="reseed-directions"
            rows={2}
            value={directions}
            onChange={(e) => setDirections(e.target.value)}
            disabled={reseeding}
            placeholder="e.g. Lead with the retreat space, keep it calm and grounded, mention the sky deck."
            className="mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text placeholder:text-subtle outline-none focus:border-primary"
          />
          <p className="mt-1 text-2xs text-subtle">Steers the wording and tone. Pick a mood above to re-seed with these directions.</p>
        </div>

        {reseedMsg && (
          <p
            className={cn('mt-2 text-xs', reseedMsg.tone === 'ok' ? 'text-success' : 'text-danger')}
            role="status"
          >
            {reseedMsg.text}
          </p>
        )}

        {/* Add more info (Importer v2.1): paste extra source content into the master profile, then re-read the
            sources so genuinely new facts (a new service, updated hours) get pulled in. Your hand edits are
            kept; the fresh draft lands back in review for you to check, then Re-apply to push it live. */}
        <div className="mt-3 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowAddInfo((v) => !v)}
            aria-expanded={showAddInfo}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-strong hover:underline"
          >
            <Plus className={cn('h-3.5 w-3.5 transition-transform', showAddInfo && 'rotate-45')} aria-hidden />
            Add more info to the master profile
          </button>
          {showAddInfo && (
            <div className="mt-2 space-y-2">
              <p className="text-2xs text-muted">
                Paste anything new about the business. Re-reading the sources pulls new facts into the master
                profile. It can take a minute; the page will show the progress.
              </p>
              {(
                [
                  { key: 'overview', label: 'Overview', ph: 'What the business is, in a few plain sentences.' },
                  { key: 'webContent', label: 'Website content', ph: 'Paste copy from their site or elsewhere.' },
                  { key: 'bookingSchedule', label: 'Booking and schedule', ph: 'Hours, how to book, session lengths.' },
                  { key: 'differentiators', label: 'What makes them different', ph: 'What sets them apart.' },
                  { key: 'pastedContent', label: 'Anything else', ph: 'Any other notes or details.' },
                ] as const
              ).map((box) => (
                <label key={box.key} className="block">
                  <span className="block text-2xs font-semibold uppercase tracking-wide text-subtle">{box.label}</span>
                  <textarea
                    rows={2}
                    value={info[box.key]}
                    onChange={(e) => setInfoField(box.key, e.target.value)}
                    disabled={addingInfo}
                    placeholder={box.ph}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text placeholder:text-subtle outline-none focus:border-primary"
                  />
                </label>
              ))}
              <Button size="sm" variant="secondary" onClick={addInfo} disabled={addingInfo || (!hasInfo && !directions.trim())}>
                {addingInfo ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {addingInfo ? 'Adding…' : 'Add info and re-research'}
              </Button>
              {infoMsg && (
                <p className={cn('text-xs', infoMsg.tone === 'ok' ? 'text-success' : 'text-danger')} role="status">
                  {infoMsg.text}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Images (Importer v2): stage photos for the Space. Available before AND after Apply — a
          post-apply upload files straight into the live Space's Loom. */}
      <SeederImages intakeId={intakeId} initialImages={initialImages} initialPlan={initialImagePlan} />

      {/* Re-apply the master profile to the live Space (applied only): pushes re-voiced copy / edits. */}
      {applied && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs text-muted">
            Changed the mood or the copy above? Re-apply to push it to the live Space. Verified facts and
            the commercial-fact gate are re-checked; withheld facts stay withheld.
          </p>
          <Button variant="secondary" onClick={approve} disabled={applying}>
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {applying ? 'Re-applying…' : 'Re-apply to Space'}
          </Button>
        </div>
      )}

      {s.blocked && !applied && (
        <Banner tone="warning" title="Resolve the contradicted facts first">
          A source contradicts one or more commercial facts. Edit them to match a source, confirm them by hand, or drop
          them. Then approve.
        </Banner>
      )}

      {error && (
        <Banner tone="critical" title="Could not seed the Space">
          {error}
          {blocked.length > 0 && <span className="mt-1 block text-xs">Blocked: {blocked.join(', ')}</span>}
        </Banner>
      )}

      {applied && links && (
        <div className="rounded-2xl border border-success/30 bg-success-bg p-4" role="status">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Seeded {listed ? 'a listed Space' : 'an unlisted Space'}
          </p>
          <p className="mt-1 text-sm text-muted">
            {listed
              ? 'It shows in the Business Spaces directory. Any unverified commercial fact stays withheld.'
              : 'It is not in the directory yet. Flip it to Listed below when you are ready to show it.'}
          </p>
          {/* The easy LISTED toggle: list = show in the Business Spaces directory (visibility network),
              unlist = owner/members only (private). No more digging in settings. */}
          <label className="mt-3 flex items-center gap-2 text-sm font-medium text-text">
            <input
              type="checkbox"
              checked={listed}
              onChange={(e) => toggleListed(e.target.checked)}
              disabled={listing}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            {listing ? 'Saving…' : 'Listed in the Business Spaces directory'}
          </label>
          <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
            <a href={links.profileHref} className="inline-flex items-center gap-1 text-info hover:underline" target="_blank" rel="noreferrer">
              Space profile <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <a href={links.siteHref} className="inline-flex items-center gap-1 text-info hover:underline" target="_blank" rel="noreferrer">
              Public site <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      )}

      {/* Sections */}
      {model.sections.map((section) => (
        <section key={section.key} className="space-y-2">
          <div>
            <h3 className="text-base font-bold text-text">{section.title}</h3>
            <p className="mt-0.5 text-sm text-muted">{section.desc}</p>
          </div>
          <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {section.fields.map((f) => (
              <FieldRow key={f.path} intakeId={intakeId} field={f} readOnly={readOnly} onUpdate={onFieldUpdate} />
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
  field: ReviewField
  readOnly: boolean
  onUpdate: (m: ReviewModel) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(field.value)
  const [showSource, setShowSource] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(action: FieldAction) {
    setRowError(null)
    startTransition(async () => {
      const res = await updateImportField(intakeId, field.path, action)
      if (!res.ok) {
        setRowError(res.error)
        return
      }
      setEditing(false)
      onUpdate(res.model)
    })
  }

  const tone = SIGNAL_TONE[field.signal]

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={tone} size="sm">
              {SIGNAL_GLYPH[field.signal]} {SIGNAL_LABEL[field.signal]}
            </StatusChip>
            <span className="text-xs font-semibold text-text">{field.label}</span>
            {field.generated && (
              <span className="inline-flex items-center gap-1 text-2xs text-muted">
                <Sparkles className="h-3 w-3" aria-hidden /> AI copy
              </span>
            )}
            {field.commercial && <span className="text-2xs text-subtle">commercial fact</span>}
          </div>

          {/* Value / edit field */}
          {editing ? (
            <textarea
              className="mt-2 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-border-strong focus:outline-none"
              rows={field.value.length > 60 ? 3 : 1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
          ) : (
            <p className={`mt-1 whitespace-pre-wrap break-words text-sm ${field.value ? 'text-text' : 'italic text-subtle'}`}>
              {field.value || 'Not set'}
            </p>
          )}

          {/* Withheld flag */}
          {field.withheld && !editing && (
            <p className="mt-1 inline-flex items-center gap-1 text-2xs text-warning">
              <ShieldQuestion className="h-3 w-3" aria-hidden /> Withheld from the live Space, needs a source or your confirm.
            </p>
          )}

          {/* Provenance */}
          {field.provenance && (
            <div className="mt-1.5">
              <button
                type="button"
                onClick={() => setShowSource((v) => !v)}
                className="text-2xs font-medium text-info hover:underline"
              >
                {showSource ? 'Hide source' : 'Show source'}
              </button>
              {showSource && (
                <div className="mt-1 rounded-lg border border-border bg-surface-elevated p-2 text-2xs text-muted">
                  {field.provenance.snippet ? (
                    <p className="whitespace-pre-wrap break-words">“{field.provenance.snippet}”</p>
                  ) : (
                    <p className="italic">No snippet recorded.</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {field.provenance.sourceUrl ? (
                      <a
                        href={field.provenance.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-info hover:underline"
                      >
                        {sourceHost(field.provenance.sourceUrl)} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="italic">
                        {field.provenance.kind === 'generated' ? 'Written by AI (no source)' : 'No source link'}
                      </span>
                    )}
                    <span>· {Math.round((field.provenance.confidence ?? 0) * 100)}% confidence</span>
                    {field.provenance.verifiedBy && (
                      <span className="inline-flex items-center gap-0.5 text-success">
                        <CheckCircle2 className="h-3 w-3" /> {field.provenance.verifiedBy}-verified
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {rowError && <p className="mt-1 text-2xs text-danger">{rowError}</p>}
        </div>

        {/* Controls */}
        {!readOnly && (
          <div className="flex shrink-0 items-center gap-1">
            {editing ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => run({ kind: 'edit', value: draft })} disabled={pending}>
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(field.value) }} disabled={pending}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => { setDraft(field.value); setEditing(true) }} disabled={pending}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                {(field.withheld || field.signal !== 'green') && field.value && (
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

function sourceHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
