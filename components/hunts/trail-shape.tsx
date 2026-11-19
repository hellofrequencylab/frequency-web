'use client'

// The Shape step of the Trail editor (FH-030S): a Trail in order, or a Passport where players visit stops
// in any order and finish after a number of them, with optional regions the organiser can turn off. The
// fields come from the HUNT manifest (`finishCount` and the `regions` repeat); the draft holds them and
// the ordinary draft save stores them. The publish checklist runs validateGraph on the result.
import { Check, Lock, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldControl, StudioField, StudioNote } from '@/components/studio/spark'
import { MAX_REGIONS, type DraftRegion, type TrailDraft } from '@/lib/hunts/draft'
import { HUNT_MANIFEST } from '@/lib/studio/entities/hunt'
import type { FieldDef } from '@/lib/studio/kernel/manifest'

const FINISH_FIELD = HUNT_MANIFEST.fields.find((f) => f.path === 'finishCount')
const REGIONS = HUNT_MANIFEST.repeats?.find((r) => r.arrayPath === 'regions')
const REGION_FIELDS: FieldDef[] = (REGIONS?.fields ?? []).map((f) => ({ ...f, section: REGIONS?.section ?? 'shape' }))
const scalar = (v: string | string[]): string => (Array.isArray(v) ? (v[0] ?? '') : v)

/** The threshold a Passport starts with: three, or every stop when there are fewer. */
const defaultCount = (stops: number) => Math.max(1, Math.min(3, stops))

function withRegions(d: TrailDraft, regions: DraftRegion[]): TrailDraft {
  const { regions: _old, ...rest } = d
  void _old
  return regions.length > 0 ? { ...rest, regions } : rest
}

function regionValue(r: DraftRegion, path: string): string | string[] {
  if (path === 'enabled') return String(r.enabled)
  if (path === 'stops') return r.stops.map(String)
  return r.name
}

function regionWith(r: DraftRegion, path: string, value: string | string[]): DraftRegion {
  if (path === 'enabled') return { ...r, enabled: scalar(value) === 'true' }
  if (path === 'stops') return { ...r, stops: (Array.isArray(value) ? value : [value]).map(Number).filter((n) => Number.isInteger(n)).sort((a, b) => a - b) }
  return { ...r, name: scalar(value) }
}

export function TrailShape({ draft, onEdit, disabled }: { draft: TrailDraft; onEdit: (next: (d: TrailDraft) => TrailDraft) => void; disabled: boolean }) {
  const passport = draft.finishCount !== undefined
  const regions = draft.regions ?? []
  const stopOptions = { 'trail-stops': draft.stops.map((s, i) => ({ value: String(i), label: `Stop ${i + 1}${s.place.trim() ? `: ${s.place.trim()}` : ''}` })) }

  const choose = (next: boolean) =>
    onEdit((d) => {
      if (!next) {
        const { finishCount: _count, ...rest } = d
        void _count
        return rest
      }
      return { ...d, finishCount: d.finishCount ?? defaultCount(d.stops.length) }
    })
  const setCount = (raw: string) => {
    const n = Number.parseInt(raw, 10)
    if (!Number.isInteger(n) || n < 1) return
    onEdit((d) => ({ ...d, finishCount: Math.min(n, Math.max(1, d.stops.length)) }))
  }
  // A stop sits in one region: picking it here takes it out of any other.
  const setRegion = (i: number, path: string, value: string | string[]) =>
    onEdit((d) => {
      const list = d.regions ?? []
      const changed = regionWith(list[i], path, value)
      const next = list.map((r, j) => (j === i ? changed : path === 'stops' ? { ...r, stops: r.stops.filter((s) => !changed.stops.includes(s)) } : r))
      return withRegions(d, next)
    })
  const addRegion = () => onEdit((d) => withRegions(d, [...(d.regions ?? []), { name: '', enabled: true, stops: [] }].slice(0, MAX_REGIONS)))
  const removeRegion = (i: number) => onEdit((d) => withRegions(d, (d.regions ?? []).filter((_, j) => j !== i)))

  const card = (on: boolean) => `w-full rounded-card border p-4 text-left ${on ? 'border-primary bg-surface' : 'border-border bg-surface-elevated/60'}`
  return (
    <section aria-labelledby="trail-shape" className="space-y-3">
      <h2 id="trail-shape" className="sr-only">Shape</h2>
      <button type="button" className={card(!passport)} aria-pressed={!passport} onClick={() => choose(false)} disabled={disabled}>
        <span className="flex items-center gap-2 text-body font-semibold text-text">
          {!passport && <Check className="h-4 w-4 text-primary" aria-hidden />}
          Trail
        </span>
        <span className="mt-1 block text-body-sm text-muted">Stops in order, finish at the last. Each stop opens when the one before it is found.</span>
      </button>
      <button type="button" className={card(passport)} aria-pressed={passport} onClick={() => choose(true)} disabled={disabled}>
        <span className="flex items-center gap-2 text-body font-semibold text-text">
          {passport && <Check className="h-4 w-4 text-primary" aria-hidden />}
          Passport
        </span>
        <span className="mt-1 block text-body-sm text-muted">Any order. Players finish once they have visited enough stops, like 3 of 5.</span>
      </button>
      <div className="rounded-card border border-border bg-surface-elevated/60 p-4 opacity-70">
        <p className="flex items-center gap-2 text-body font-semibold text-text">
          <Lock className="h-4 w-4" aria-hidden />
          Rally
        </p>
        <p className="mt-1 text-body-sm text-muted">A race. Coming later.</p>
      </div>

      {passport && FINISH_FIELD && (
        <div className="space-y-3 rounded-card border border-border bg-surface p-4">
          <StudioField label={`${FINISH_FIELD.label} (of ${draft.stops.length})`}>
            <FieldControl id="trail-finish-count" def={FINISH_FIELD} value={String(draft.finishCount ?? '')} onChange={(v) => setCount(scalar(v))} disabled={disabled} />
          </StudioField>
          <StudioNote>Two stops at the same venue count once, so one visit never counts twice.</StudioNote>
        </div>
      )}

      {passport && REGIONS && (
        <div className="space-y-3">
          <h3 className="text-body font-semibold text-text">{REGIONS.label}</h3>
          <p className="text-body-sm text-muted">
            Optional. Group stops into regions you can close for a day, like a street closed for a fair. A stop in no region belongs to every region.
            Players who stay in one open region still need a way to finish, and publishing checks that.
          </p>
          {regions.map((r, i) => (
            <div key={i} className="space-y-3 rounded-card border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-body font-semibold text-text">{r.name.trim() || `Region ${i + 1}`}</p>
                <Button variant="ghost" size="xs" onClick={() => removeRegion(i)} disabled={disabled} aria-label={`Remove region ${i + 1}`}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              {REGION_FIELDS.map((def) =>
                def.kind === 'toggle' ? (
                  <FieldControl key={def.path} id={`region-${i}-${def.path}`} def={def} value={regionValue(r, def.path)} onChange={(v) => setRegion(i, def.path, v)} disabled={disabled} />
                ) : (
                  <StudioField key={def.path} label={def.label}>
                    <FieldControl id={`region-${i}-${def.path}`} def={def} loaded={stopOptions} value={regionValue(r, def.path)} onChange={(v) => setRegion(i, def.path, v)} disabled={disabled} />
                  </StudioField>
                ),
              )}
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={addRegion} disabled={disabled || regions.length >= MAX_REGIONS}>
            <Plus className="h-4 w-4" aria-hidden />
            {regions.length >= MAX_REGIONS ? `That is the most, ${MAX_REGIONS} regions` : 'Add a region'}
          </Button>
        </div>
      )}
    </section>
  )
}
