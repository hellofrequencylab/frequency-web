'use client'

import type { ReactNode } from 'react'
import {
  GripVertical, ChevronUp, ChevronDown, Gem, ShieldCheck, Award, Lock,
  Zap, Waves, Mountain, AlertCircle, Clock4,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useSortable } from '../kit/use-sortable'
import { StudioField } from '../kit/studio-field'
import { INTENSITY_TIERS, type IntensityTier } from '@/lib/journey-tiers'
import { TIER_META } from '@/components/journey/tier-meta'
import type { PlanStatus, PageWidgetConfig } from '@/lib/journey-plans'
import { WIDGET_META, WIDGET_IDS, type WidgetId } from '@/lib/journey-page-config'

// The net-new Studio editor sections for a Journey (docs/JOURNEYS.md §11): the
// per-step intensity tier control, completion rules, rewards, page layout,
// visibility/publishing, and the Guide/Mentor-only official program. Pure
// presentational pieces — each takes its value + an onChange that the builder
// wires to an autosaved server action (the useStudioDraft pattern).

// ── Shared section grammar ───────────────────────────────────────────────────

/** A labeled editor section: a heading + optional hint over its controls. */
export function StudioSection({
  title,
  hint,
  icon: Icon,
  children,
}: {
  title: string
  hint?: ReactNode
  icon?: LucideIcon
  children: ReactNode
}) {
  return (
    <section className="mt-6 border-t border-border pt-5">
      <div className="mb-3">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-text">
          {Icon && <Icon className="h-4 w-4 text-subtle" />} {title}
        </h2>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

/** A pill toggle switch (matches the header demo-toggle idiom). */
export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: ReactNode
  description?: ReactNode
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3 text-left transition-colors hover:border-border-strong"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-text">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-border-strong'}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  )
}

/** A segmented single-choice control (the radio-pill row). */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (next: T) => void
  size?: 'sm' | 'md'
}) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-surface-elevated p-1">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            title={o.title}
            aria-pressed={active}
            className={`rounded-lg font-semibold transition-colors ${pad} ${
              active ? 'bg-surface text-text shadow-sm' : 'text-subtle hover:text-text'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Per-step intensity tier ──────────────────────────────────────────────────

// Lucide stand-ins for the tier glyphs (⚡🌊🏔️) — keeps the Studio idiom (lucide,
// not emoji) while labels + tooltips come from the shared TIER_META so they never drift.
const TIER_ICON: Record<IntensityTier, LucideIcon> = { initiate: Zap, adept: Waves, master: Mountain }

/** The Initiate/Adept/Master default-tier picker shown inside an expanded step. */
export function TierPicker({
  value,
  onChange,
}: {
  value: IntensityTier
  onChange: (tier: IntensityTier) => void
}) {
  return (
    <StudioField label="Default intensity">
      <div className="inline-flex gap-1 rounded-xl bg-surface-elevated p-1">
        {INTENSITY_TIERS.map((t) => {
          const Icon = TIER_ICON[t]
          const meta = TIER_META[t]
          const active = t === value
          return (
            <button
              key={t}
              type="button"
              onClick={() => onChange(t)}
              title={meta.blurb}
              aria-pressed={active}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                active ? 'bg-surface text-text shadow-sm' : 'text-subtle hover:text-text'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {meta.label}
            </button>
          )
        })}
      </div>
    </StudioField>
  )
}

// ── Completion rules ─────────────────────────────────────────────────────────

export function CompletionRulesSection({
  minPracticesPerDay,
  targetWeeks,
  seasonLocked,
  onChange,
}: {
  minPracticesPerDay: number
  targetWeeks: number
  seasonLocked: boolean
  onChange: (patch: { minPracticesPerDay?: number; targetWeeks?: number; seasonLocked?: boolean }) => void
}) {
  return (
    <StudioSection
      title="Completion rules"
      icon={Clock4}
      hint="How a member finishes this Journey across the 13-week season."
    >
      <div className="space-y-4">
        <StudioField label="Practices per day to count">
          <div className="flex items-center gap-3">
            <Segmented
              value={minPracticesPerDay}
              onChange={(v) => onChange({ minPracticesPerDay: v })}
              options={[
                { value: 1, label: '1' },
                { value: 2, label: '2' },
                { value: 3, label: '3' },
              ]}
            />
            <span className="text-xs normal-case text-muted">A day counts when ≥ this many of the path’s practices are logged.</span>
          </div>
        </StudioField>

        <StudioField label="Weeks to complete">
          <div className="flex items-center gap-3">
            <Segmented
              value={targetWeeks}
              onChange={(v) => onChange({ targetWeeks: v })}
              options={[
                { value: 6, label: '6' },
                { value: 8, label: '8' },
                { value: 10, label: '10' },
                { value: 13, label: '13' },
              ]}
            />
            <span className="text-xs normal-case text-muted">Qualifying weeks out of 13 (8 is the forgiving default).</span>
          </div>
        </StudioField>

        <Toggle
          checked={seasonLocked}
          onChange={(v) => onChange({ seasonLocked: v })}
          label="Season-locked"
          description="On: anchors to the season (official path). Off: evergreen — a rolling 13-week window from each member’s adoption."
        />
      </div>
    </StudioSection>
  )
}

// ── Rewards ──────────────────────────────────────────────────────────────────

export function RewardsSection({
  completionGems,
  onChange,
  canOverrideZap = false,
}: {
  completionGems: number
  onChange: (gems: number) => void
  canOverrideZap?: boolean
}) {
  return (
    <StudioSection
      title="Rewards"
      icon={Gem}
      hint="What completing the whole Journey pays out."
    >
      <StudioField label="Completion Gems">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={Math.min(100, Math.max(10, completionGems))}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-1.5 w-48 cursor-pointer accent-primary"
            aria-label="Completion Gems"
          />
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-bg px-2.5 py-1 text-sm font-bold text-primary-strong">
            <Gem className="h-3.5 w-3.5" /> {completionGems}
          </span>
        </div>
      </StudioField>
      <p className="mt-1 text-xs text-subtle">Granted once when a member completes the Journey. Default 30.</p>

      {canOverrideZap && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted">
          <Zap className="h-3.5 w-3.5 text-warning" />
          Per-practice Zap overrides are set on each practice (Mentor/Admin) — coming to this editor.
        </p>
      )}
    </StudioSection>
  )
}

// ── Page layout (widget toggle + reorder) ────────────────────────────────────

export function PageLayoutSection({
  config,
  onChange,
}: {
  config: PageWidgetConfig[]
  onChange: (next: PageWidgetConfig[]) => void
}) {
  const { itemProps, move, isDragging, isOver } = useSortable(config, (w) => w.id, onChange)
  const toggle = (id: string) =>
    onChange(config.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)))

  return (
    <StudioSection
      title="Page layout"
      icon={Award}
      hint="Choose which blocks appear on the Journey page, and drag to order them."
    >
      <ol className="space-y-1.5">
        {config.map((w, i) => {
          const meta = WIDGET_META[w.id as WidgetId]
          return (
            <li
              key={w.id}
              {...itemProps(w.id)}
              className={`group flex items-center gap-2 rounded-xl border bg-surface px-2.5 py-2 transition-all ${
                isDragging(w.id) ? 'opacity-40' : ''
              } ${isOver(w.id) ? 'border-primary ring-2 ring-primary/30' : 'border-border'} ${
                w.enabled ? '' : 'opacity-60'
              }`}
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-subtle opacity-40 transition-opacity group-hover:opacity-100" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-text">{meta?.label ?? w.id}</span>
                  {meta && (
                    <span className="shrink-0 rounded-full bg-surface-elevated px-1.5 text-xs font-medium uppercase text-subtle">
                      {meta.mode}
                    </span>
                  )}
                </span>
                {meta?.hint && <span className="block truncate text-xs text-muted">{meta.hint}</span>}
              </span>
              <div className="flex shrink-0 items-center">
                <button type="button" onClick={() => move(w.id, -1)} disabled={i === 0} aria-label="Move up" className="rounded-lg p-1.5 text-subtle hover:bg-surface-elevated hover:text-text disabled:opacity-30 sm:hidden"><ChevronUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(w.id, 1)} disabled={i === config.length - 1} aria-label="Move down" className="rounded-lg p-1.5 text-subtle hover:bg-surface-elevated hover:text-text disabled:opacity-30 sm:hidden"><ChevronDown className="h-4 w-4" /></button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={w.enabled}
                  aria-label={`Show ${meta?.label ?? w.id}`}
                  onClick={() => toggle(w.id)}
                  className={`relative ml-1 inline-flex h-5 w-9 items-center rounded-full transition-colors ${w.enabled ? 'bg-primary' : 'bg-border-strong'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${w.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </li>
          )
        })}
      </ol>
      {config.length === 0 && (
        <p className="text-sm text-muted">No widgets available.</p>
      )}
      {/* Keep the catalog count honest even if config drifted. */}
      {config.length > 0 && config.length !== WIDGET_IDS.length && (
        <p className="mt-2 text-xs text-subtle">{WIDGET_IDS.length} blocks available.</p>
      )}
    </StudioSection>
  )
}

// ── Official (Guide/Mentor only) ─────────────────────────────────────────────

export function OfficialSection({
  official,
  questId,
  quests,
  onChange,
}: {
  official: boolean
  questId: string | null
  quests: { id: string; name: string; emoji: string | null }[]
  onChange: (opts: { official: boolean; questId?: string | null }) => void
}) {
  return (
    <StudioSection
      title="Official program"
      icon={ShieldCheck}
      hint="Guides & Mentors only — promote this into a season’s official Quest."
    >
      <div className="space-y-3">
        <Toggle
          checked={official}
          onChange={(v) => onChange({ official: v, questId: v ? questId : null })}
          label="Official season Journey"
          description="Marks this as part of the canonical, free seasonal program."
        />
        {official && (
          <StudioField label="Seasonal Quest">
            <select
              value={questId ?? ''}
              onChange={(e) => onChange({ official: true, questId: e.target.value || null })}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-border-strong focus:outline-none"
            >
              <option value="">Not assigned to a Quest</option>
              {quests.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.emoji ? `${q.emoji} ` : ''}{q.name}
                </option>
              ))}
            </select>
          </StudioField>
        )}
        {official && quests.length === 0 && (
          <p className="inline-flex items-center gap-1.5 text-xs text-muted">
            <AlertCircle className="h-3.5 w-3.5" /> No active Seasonal Quests to assign yet.
          </p>
        )}
      </div>
    </StudioSection>
  )
}

// ── Visibility & publishing status ───────────────────────────────────────────

const STATUS_META: Record<PlanStatus, { label: string; tone: string; icon: LucideIcon }> = {
  draft: { label: 'Draft', tone: 'text-subtle', icon: Lock },
  pending: { label: 'In review', tone: 'text-warning', icon: Clock4 },
  approved: { label: 'Approved', tone: 'text-success', icon: ShieldCheck },
  rejected: { label: 'Needs changes', tone: 'text-danger', icon: AlertCircle },
}

/** The review-state chip shown beside the visibility radios for a public plan. */
export function StatusChip({ status }: { status: PlanStatus }) {
  const m = STATUS_META[status]
  const Icon = m.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2.5 py-1 text-xs font-medium ${m.tone}`}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  )
}
