'use client'

// MEMBER BENEFITS EDITOR (client) — ADR-1372, backlog LIVE-093. The operator defines what a
// membership is WORTH at a checkout: a priced modifier (percent off, amount off, a set member
// price, or included) with a scope, assigned to any number of tiers. It sits as a sub-section of
// the memberships surface, beside the tier form, so a tier and what it is worth are edited in one
// place rather than in a parallel console.
//
// SECURITY POSTURE: THIS FORM IS A CONVENIENCE, NEVER A GATE. Every save goes through the
// 'use server' setSpaceBenefits, which re-checks canEditProfile plus the per-space memberships
// function gate, re-normalizes each row through the pure normalizeBenefit, and intersects every
// tier assignment with the tiers that really belong to this Space. A row this form would accept can
// still be refused there, and that is the correct direction for the two to disagree. Read-only
// staff preview is the disabled fieldset the section wraps this in, which natively disables every
// nested control.
//
// WHY THE RULES ARE NEXT DOOR. Numbers are held as STRINGS so an input can carry a half-typed value,
// so every save runs a parse that can fail. That parsing, the preview sentence and the wire
// conversion all live in lib/spaces/benefits-form.ts with their test. This file holds state and
// markup, which is the house split.
//
// THE PREVIEW LINE IS THE REAL ARITHMETIC. Each row shows what a member would pay on a sample price,
// computed through benefitDiscountCents, the same function a checkout calls. It is deliberately not
// a second implementation: a preview that rounds differently from the charge is worse than none.
//
// Voice: plain, sentence case, contractions, no em dashes (CONTENT-VOICE §5e, §10).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Label, labelClasses } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { isError } from '@/lib/action-result'
import { setSpaceBenefits } from '@/lib/spaces/benefits-actions'
import type { BenefitKind, BenefitPeriod, BenefitScope, MemberBenefit } from '@/lib/spaces/benefits'
import {
  BENEFIT_KIND_OPTIONS,
  BENEFIT_PERIOD_OPTIONS,
  BENEFIT_SCOPE_OPTIONS,
  BENEFIT_VALUE_LABEL,
  draftEffectLine,
  draftsToBenefits,
  emptyDraft,
  toDrafts,
  type BenefitDraft,
} from '@/lib/spaces/benefits-form'

/** The placeholder each kind's value input shows, so the units are never a guess. */
const VALUE_PLACEHOLDER: Record<BenefitKind, string> = {
  included: '',
  percent: '15',
  amount_off: '5',
  fixed_price: '18.50',
}

export function MembershipBenefitsForm({
  spaceId,
  tiers,
  initialBenefits,
}: {
  spaceId: string
  tiers: { id: string; name: string }[]
  initialBenefits: MemberBenefit[]
}) {
  const router = useRouter()
  const tierIds = tiers.map((t) => t.id)
  const [rows, setRows] = useState<BenefitDraft[]>(() =>
    initialBenefits.length > 0 ? toDrafts(initialBenefits, tierIds) : [emptyDraft()],
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startSave] = useTransition()

  function update(index: number, patch: Partial<BenefitDraft>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    setSaved(false)
  }

  function toggleTier(index: number, tierId: string, on: boolean) {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r
        const next = on ? [...r.tierIds, tierId] : r.tierIds.filter((t) => t !== tierId)
        return { ...r, tierIds: [...new Set(next)] }
      }),
    )
    setSaved(false)
  }

  function addRow() {
    setRows((prev) => [...prev, emptyDraft()])
    setSaved(false)
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
    setSaved(false)
  }

  function move(index: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })
    setSaved(false)
  }

  function save() {
    setError(null)
    setSaved(false)

    const converted = draftsToBenefits(rows, spaceId)
    if (!converted.ok) {
      setError(converted.error)
      return
    }

    startSave(async () => {
      const result = await setSpaceBenefits(spaceId, converted.benefits)
      if (isError(result)) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  // A benefit is an assignment to a tier, so with no tiers there is nothing to assign to. Say that
  // plainly rather than rendering an editor whose every save would be refused.
  if (tiers.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border px-3 py-4 text-center text-body-sm text-muted">
        Add a membership tier first. A benefit has to belong to at least one tier.
      </p>
    )
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pending) save()
      }}
    >
      <div className="space-y-4">
        {rows.length === 0 && (
          <p className="rounded-card border border-dashed border-border px-3 py-4 text-center text-body-sm text-muted">
            No benefits yet. Add one to give a tier something it&apos;s worth.
          </p>
        )}

        {rows.map((r, i) => {
          const names = tiers.filter((t) => r.tierIds.includes(t.id)).map((t) => t.name)
          return (
            <div key={i} className="space-y-4 rounded-card border border-border bg-surface p-5 lift-1">
              <div className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span className="text-meta font-semibold text-subtle">Benefit {i + 1}</span>
                  {!r.isActive && <Badge tone="neutral">Off</Badge>}
                </span>
                <div className="flex items-center gap-1">
                  <IconButton
                    variant="bordered"
                    label="Move benefit up"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </IconButton>
                  <IconButton
                    variant="bordered"
                    label="Move benefit down"
                    onClick={() => move(i, 1)}
                    disabled={i === rows.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </IconButton>
                  <IconButton
                    variant="bordered"
                    tone="danger"
                    label="Remove this benefit"
                    onClick={() => removeRow(i)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </IconButton>
                </div>
              </div>

              <div>
                <Label htmlFor={`benefit-label-${i}`} className="font-semibold">
                  What members see
                </Label>
                <Input
                  id={`benefit-label-${i}`}
                  value={r.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder="Temple Member, 15% off"
                  maxLength={80}
                  className="mt-1"
                />
                <p className="mt-1 text-meta text-subtle">
                  This is the line a member reads at checkout, so write it their way.
                </p>
              </div>

              <div className="flex flex-wrap items-start gap-3">
                <div className="w-48">
                  <Label htmlFor={`benefit-kind-${i}`} className="font-semibold">
                    How it prices
                  </Label>
                  <Select
                    id={`benefit-kind-${i}`}
                    value={r.kind}
                    onChange={(e) => update(i, { kind: e.target.value as BenefitKind })}
                    wrapperClassName="mt-1"
                    options={BENEFIT_KIND_OPTIONS}
                  />
                </div>

                {r.kind !== 'included' && (
                  <div className="w-40">
                    <Label htmlFor={`benefit-value-${i}`} className="font-semibold">
                      {BENEFIT_VALUE_LABEL[r.kind]}
                    </Label>
                    <Input
                      id={`benefit-value-${i}`}
                      inputMode="decimal"
                      value={r.value}
                      onChange={(e) => update(i, { value: e.target.value })}
                      placeholder={VALUE_PLACEHOLDER[r.kind]}
                      className="mt-1"
                    />
                  </div>
                )}

                <div className="w-48">
                  <Label htmlFor={`benefit-scope-${i}`} className="font-semibold">
                    Applies to
                  </Label>
                  <Select
                    id={`benefit-scope-${i}`}
                    value={r.scope}
                    onChange={(e) => update(i, { scope: e.target.value as BenefitScope })}
                    wrapperClassName="mt-1"
                    options={BENEFIT_SCOPE_OPTIONS}
                  />
                </div>
              </div>

              {/* A caption over many checkboxes names a GROUP, not one control, so it is a <p> with
                  an id and the container carries role="group" plus aria-labelledby. A label here
                  would point at nothing (components/ui/field.tsx, check:labels). */}
              <div>
                <p className={labelClasses} id={`benefit-tiers-label-${i}`}>
                  Tiers that get it
                </p>
                <div
                  className="mt-1 flex flex-wrap gap-x-4 gap-y-2"
                  role="group"
                  aria-labelledby={`benefit-tiers-label-${i}`}
                >
                  {tiers.map((t) => (
                    <Checkbox
                      key={t.id}
                      checked={r.tierIds.includes(t.id)}
                      onChange={(e) => toggleTier(i, t.id, e.target.checked)}
                      label={t.name}
                    />
                  ))}
                </div>
                <p className="mt-2 text-body-sm text-muted">{draftEffectLine(r, names)}</p>
              </div>

              <div className="flex flex-wrap items-start gap-3">
                <div className="w-32">
                  <Label htmlFor={`benefit-uses-${i}`} className="font-semibold">
                    Uses
                  </Label>
                  <Input
                    id={`benefit-uses-${i}`}
                    inputMode="numeric"
                    value={r.maxUses}
                    onChange={(e) => update(i, { maxUses: e.target.value })}
                    placeholder="No limit"
                    className="mt-1"
                  />
                </div>
                <div className="w-44">
                  <Label htmlFor={`benefit-period-${i}`} className="font-semibold">
                    Resets
                  </Label>
                  <Select
                    id={`benefit-period-${i}`}
                    value={r.period ?? ''}
                    disabled={!r.maxUses.trim()}
                    onChange={(e) =>
                      update(i, { period: (e.target.value || null) as BenefitPeriod })
                    }
                    wrapperClassName="mt-1"
                    options={BENEFIT_PERIOD_OPTIONS}
                  />
                </div>
                <div className="w-40">
                  <Label htmlFor={`benefit-starts-${i}`} className="font-semibold">
                    Starts
                  </Label>
                  <Input
                    id={`benefit-starts-${i}`}
                    type="date"
                    value={r.startsAt}
                    onChange={(e) => update(i, { startsAt: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div className="w-40">
                  <Label htmlFor={`benefit-ends-${i}`} className="font-semibold">
                    Ends
                  </Label>
                  <Input
                    id={`benefit-ends-${i}`}
                    type="date"
                    value={r.endsAt}
                    onChange={(e) => update(i, { endsAt: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>

              <p className="text-meta text-subtle">
                Uses caps how often one member can take this. Leave the dates blank to keep it
                running.
              </p>

              <Checkbox
                checked={r.isActive}
                onChange={(e) => update(i, { isActive: e.target.checked })}
                label="Live for members"
              />
            </div>
          )
        })}

        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-primary-strong transition-colors hover:text-primary"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add a benefit
        </button>
      </div>

      <p className="text-meta text-subtle">
        Benefits don&apos;t stack. When two of them fit the same price, a member gets the bigger one.
      </p>

      {error && (
        <p className="rounded-card bg-danger-bg px-3 py-2 text-body-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving
            </>
          ) : (
            <>
              <Check className="h-4 w-4" aria-hidden /> Save benefits
            </>
          )}
        </Button>
        {saved && !pending && (
          <span className="inline-flex items-center gap-1 text-body-sm font-medium text-success" role="status">
            <Check className="h-4 w-4" aria-hidden /> Saved
          </span>
        )}
      </div>
    </form>
  )
}
