'use client'

import { useCallback, useState, useTransition, createElement } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  Sparkles, Waves, Footprints, Snowflake, Brain, Flame, Heart, Leaf, Sun, Moon, Eye, Trash2,
  type LucideIcon,
} from 'lucide-react'
import { StudioWindow } from '../studio-window'
import { useStudioDraft } from '../kit/use-studio-draft'
import { StudioField } from '../kit/studio-field'
import { SaveStatus, StudioFooter } from '../kit/studio-footer'
import { ImageUpload } from '@/components/ui/image-upload'
import { DangerModal } from '@/components/admin/danger-modal'
import { isError } from '@/lib/action-result'
import { updatePracticeAction, setPracticeTagsAction, setPracticeRewardAction, deleteOwnPracticeAction } from '@/app/(main)/practices/actions'
import type { PracticeEdit, WeightClass, FocusDetail } from '@/lib/practices'

// Practice on the Studio shell — entity #2 (ADR-143). Composes the kit (autosave,
// fields, footer) against the existing practice actions; mirrors the old
// PracticeEditor field-for-field but in the familiar window, autosaving. Practices
// have their own icon system (no emoji/accent), so the identity "face" is a lucide
// icon — the kit is composed-from, not a rigid template.

const CADENCES = ['Daily', 'A few times a week', 'Weekly', 'As needed']
const CATEGORIES = ['movement', 'holistic-health', 'spirituality', 'creative', 'business-support', 'human-relating']
const ICONS: { key: string; Icon: LucideIcon }[] = [
  { key: 'sparkles', Icon: Sparkles }, { key: 'waves', Icon: Waves }, { key: 'footprints', Icon: Footprints },
  { key: 'snowflake', Icon: Snowflake }, { key: 'brain', Icon: Brain }, { key: 'flame', Icon: Flame },
  { key: 'heart', Icon: Heart }, { key: 'leaf', Icon: Leaf }, { key: 'sun', Icon: Sun }, { key: 'moon', Icon: Moon },
]
const ICON_BY_KEY = new Map(ICONS.map((i) => [i.key, i.Icon]))

// Weight class → its per-log Zap payout. These mirror ZAP_AMOUNTS (lib/zaps.ts:
// practice_logged_light 8 / practice_logged 12 / practice_logged_heavy 15); kept as
// literals here because lib/zaps pulls in the server-only admin client. The live
// payout is tunable in zap_config, so this is a "starts at" hint, not a promise.
const WEIGHT_OPTIONS: { value: WeightClass; label: string; zaps: number }[] = [
  { value: 'light', label: 'Light', zaps: 8 },
  { value: 'standard', label: 'Standard', zaps: 12 },
  { value: 'heavy', label: 'Heavy', zaps: 15 },
]

const FIELD = 'rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none'

export interface PracticeBuilderProps {
  id: string
  title: string
  summary: string | null
  description: string | null
  body: string | null
  cadence: string | null
  /** Typical session length in minutes (null = unset). */
  durationMin: number | null
  category: string | null
  icon: string | null
  domainId: string | null
  /** Per-Focus instructions + timing, keyed by pillar id. The keys are the selected
   *  Focuses (a practice can have multiple). Empty on legacy rows. */
  focusDetails: Record<string, { instructions: string; timing: string }>
  subcategoryId: string | null
  headerImage: string | null
  /** Payout tier (null on legacy rows → defaults to Standard in the form). */
  weightClass: string | null
  pillars: { id: string; name: string }[]
  subcategories: { id: string; domain_id: string; name: string }[]
  initialTags: string[]
  /** Admin-only reward override. When `isAdmin`, the builder shows a Reward section that
   *  sets reward_zaps / reward_note (gated apart from the author-editable fields). */
  isAdmin?: boolean
  rewardZaps?: number | null
  rewardNote?: string | null
}

export function PracticeBuilder(props: PracticeBuilderProps) {
  const router = useRouter()
  const close = useCallback(() => router.push('/practices'), [router])

  const save = useCallback(
    (patch: PracticeEdit) => updatePracticeAction(props.id, patch),
    [props.id],
  )
  const onError = useCallback(() => router.refresh(), [router])
  const { saveState, error, run, queueSave } = useStudioDraft<PracticeEdit>({ save, onError })

  const [title, setTitle] = useState(props.title ?? '')
  const [summary, setSummary] = useState(props.summary ?? '')
  const [description, setDescription] = useState(props.description ?? '')
  const [body, setBody] = useState(props.body ?? '')
  const [cadence, setCadence] = useState(props.cadence ?? '')
  const [durationMin, setDurationMin] = useState(props.durationMin != null ? String(props.durationMin) : '')
  const [category, setCategory] = useState(props.category ?? '')
  const [icon, setIcon] = useState(props.icon ?? '')
  // Multi-Focus: focus_details is keyed by pillar id; the KEYS are the selected Focuses.
  // A legacy row may have a domain_id but no focus_details yet — seed that primary Pillar
  // as a selected Focus so the editor shows it (and re-saving fills focus_details).
  const [focusDetails, setFocusDetails] = useState<Record<string, FocusDetail>>(() => {
    const seed: Record<string, FocusDetail> = { ...props.focusDetails }
    if (props.domainId && !seed[props.domainId]) seed[props.domainId] = { instructions: '', timing: '' }
    return seed
  })
  const [subcategoryId, setSubcategoryId] = useState(props.subcategoryId ?? '')
  const [headerImage, setHeaderImage] = useState(props.headerImage ?? '')
  // Smart default: an existing practice without a tier reads as Standard (the 12⚡ middle).
  const [weightClass, setWeightClass] = useState<WeightClass>(
    WEIGHT_OPTIONS.some((w) => w.value === props.weightClass) ? (props.weightClass as WeightClass) : 'standard',
  )
  const [tagsInput, setTagsInput] = useState(props.initialTags.join(', '))
  const [iconOpen, setIconOpen] = useState(false)
  const [rewardZaps, setRewardZaps] = useState(props.rewardZaps != null ? String(props.rewardZaps) : '')
  const [rewardNote, setRewardNote] = useState(props.rewardNote ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, startDelete] = useTransition()

  const remove = () =>
    startDelete(async () => {
      const r = await deleteOwnPracticeAction(props.id)
      if (!isError(r)) router.push('/practices')
    })

  const saveReward = () =>
    void run(() =>
      setPracticeRewardAction(props.id, {
        rewardZaps: rewardZaps.trim() === '' ? null : Number(rewardZaps),
        rewardNote,
      }),
    )

  // The selected Focuses are the keys of focus_details (presence = selected). The
  // PRIMARY Focus (first key) drives domain_id + scopes the Sub Focus list (back-compat).
  const focusIds = Object.keys(focusDetails)
  const domainId = focusIds[0] ?? ''

  // Persist the new Focus set: write focus_details (the server mirrors domain_id to the
  // first key). Single source of truth — the toggle + per-Focus edits both route here.
  const saveFocus = (next: Record<string, FocusDetail>) => {
    setFocusDetails(next)
    queueSave({ focus_details: next })
  }

  // Toggle a Focus on/off: adding seeds an empty instructions/timing block; removing
  // drops it (and its details). domain_id follows the first remaining key, server-side.
  const toggleFocus = (pillarId: string) => {
    const next = { ...focusDetails }
    if (next[pillarId]) delete next[pillarId]
    else next[pillarId] = { instructions: '', timing: '' }
    saveFocus(next)
  }

  // Edit one field of a selected Focus's block (instructions or timing).
  const setFocusField = (pillarId: string, field: keyof FocusDetail, value: string) => {
    const current = focusDetails[pillarId] ?? { instructions: '', timing: '' }
    saveFocus({ ...focusDetails, [pillarId]: { ...current, [field]: value } })
  }

  // Sub-categories are scoped to the primary Focus (Pillar).
  const subOptions = props.subcategories.filter((s) => !domainId || s.domain_id === domainId)
  const effectiveSubId = subOptions.some((s) => s.id === subcategoryId) ? subcategoryId : ''

  const saveTags = () => {
    const labels = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
    void run(() => setPracticeTagsAction(props.id, labels))
  }

  const footer = (
    <StudioFooter left={<SaveStatus state={saveState} error={error} />}>
      <a
        href={`/practices/${props.id}`}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
      >
        <Eye className="h-4 w-4" /> View
      </a>
      <button
        type="button"
        onClick={close}
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
      >
        Done
      </button>
    </StudioFooter>
  )

  return (
    <StudioWindow open onClose={close} eyebrow="Studio · Practice" footer={footer}>
      {/* Identity: icon (or photo) face + name + one-liner */}
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setIconOpen((v) => !v)}
            aria-label="Choose an icon or photo"
            className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-primary-bg text-primary-strong transition-transform hover:scale-105"
          >
            {headerImage ? (
              // Unoptimized: user-controlled host + Supabase Storage, not a configured next/image domain.
              <Image src={headerImage} alt="" width={64} height={64} unoptimized className="h-full w-full object-cover" />
            ) : (
              createElement(ICON_BY_KEY.get(icon) ?? Sparkles, { className: 'h-7 w-7' })
            )}
          </button>
          {iconOpen && (
            <div className="absolute left-0 top-[4.5rem] z-10 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface p-3 shadow-xl">
              <div className="grid grid-cols-5 gap-1">
                {ICONS.map(({ key, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setIcon(key); setIconOpen(false); queueSave({ icon: key }) }}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${icon === key && !headerImage ? 'bg-primary-bg text-primary-strong ring-2 ring-primary' : 'text-muted hover:bg-surface-elevated'}`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
              <div className="mt-3 border-t border-border pt-3">
                <ImageUpload
                  label="Upload a photo"
                  value={headerImage || null}
                  onChange={(url) => { setHeaderImage(url ?? ''); queueSave({ header_image: url }) }}
                  folder="practice-icons"
                  hint="Shown as the practice's face on cards and the header."
                />
              </div>
              <button type="button" onClick={() => { setIcon(''); setHeaderImage(''); setIconOpen(false); queueSave({ icon: '', header_image: null }) }} className="mt-2 text-xs text-subtle hover:text-text">Use default</button>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); queueSave({ title: e.target.value }) }}
            maxLength={80}
            placeholder="Name your practice"
            className="w-full bg-transparent text-2xl font-bold text-text outline-none placeholder:text-subtle"
          />
          <input
            value={summary}
            onChange={(e) => { setSummary(e.target.value); queueSave({ summary: e.target.value }) }}
            maxLength={140}
            placeholder="A short hook shown on the card"
            className="mt-1 w-full bg-transparent text-sm text-muted outline-none placeholder:text-subtle"
          />
          <p className="mt-1 text-2xs text-subtle">Click the icon, name, and hook to edit.</p>
        </div>
      </div>

      {/* Focus — a practice can belong to MULTIPLE Focuses (Pillars). Toggle each on/off;
          the first selected is the primary (drives the card + Pillar filtering). */}
      <fieldset className="mt-6">
        <legend className="text-2xs font-semibold uppercase tracking-wide text-subtle">Focus</legend>
        <div role="group" aria-label="Focus" className="mt-1 flex flex-wrap gap-2">
          {props.pillars.map((p) => {
            const active = !!focusDetails[p.id]
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleFocus(p.id)}
                className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-primary/50 bg-primary-bg text-primary-strong'
                    : 'border-border bg-surface text-muted hover:bg-surface-elevated'
                }`}
              >
                {p.name}
              </button>
            )
          })}
        </div>
        <p className="mt-1 text-xs text-subtle">Pick one or more. Each gets its own instructions and timing below.</p>
      </fieldset>

      {/* Per-Focus instructions + timing. Appears/disappears as Focuses are toggled. */}
      {focusIds.length > 0 && (
        <div className="mt-4 space-y-4">
          {focusIds.map((pillarId) => {
            const detail = focusDetails[pillarId] ?? { instructions: '', timing: '' }
            const name = props.pillars.find((p) => p.id === pillarId)?.name ?? 'Focus'
            return (
              <fieldset key={pillarId} className="rounded-lg border border-border bg-surface p-3">
                <legend className="px-1 text-2xs font-semibold uppercase tracking-wide text-subtle">{name}</legend>
                <div className="space-y-3">
                  <StudioField label="Instructions">
                    <textarea
                      value={detail.instructions}
                      onChange={(e) => setFocusField(pillarId, 'instructions', e.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder={`How to do this practice for ${name}`}
                      className={FIELD}
                    />
                  </StudioField>
                  <StudioField label="Timing">
                    <input
                      value={detail.timing}
                      onChange={(e) => setFocusField(pillarId, 'timing', e.target.value)}
                      maxLength={80}
                      placeholder="e.g. 10 min, Morning"
                      className={FIELD}
                    />
                  </StudioField>
                </div>
              </fieldset>
            )
          })}
        </div>
      )}

      {/* Taxonomy + cadence */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <StudioField label="Cadence">
          <select value={cadence} onChange={(e) => { setCadence(e.target.value); queueSave({ cadence: e.target.value }) }} className={FIELD}>
            <option value="">No set cadence</option>
            {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </StudioField>
        <StudioField label="Time (minutes)">
          <input
            type="number"
            min={0}
            max={1440}
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
            onBlur={() => queueSave({ duration_min: durationMin.trim() === '' ? null : Number(durationMin) })}
            placeholder="e.g. 10"
            className={FIELD}
          />
        </StudioField>
        <StudioField label="Category">
          <select value={category} onChange={(e) => { setCategory(e.target.value); queueSave({ category: e.target.value || null }) }} className={FIELD}>
            <option value="">None</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/-/g, ' ')}</option>)}
          </select>
        </StudioField>
        <StudioField label="Sub Focus">
          <select
            value={effectiveSubId}
            onChange={(e) => { setSubcategoryId(e.target.value); queueSave({ subcategory_id: e.target.value || null }) }}
            disabled={!domainId}
            className={`${FIELD} disabled:opacity-50`}
          >
            <option value="">{domainId ? 'None' : 'Pick a Focus first'}</option>
            {subOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </StudioField>
      </div>

      {/* Effort (weight class) — the per-log Zap payout tier */}
      <fieldset className="mt-4">
        <legend className="text-2xs font-semibold uppercase tracking-wide text-subtle">Effort</legend>
        <div role="radiogroup" aria-label="Effort" className="mt-1 grid grid-cols-3 gap-2">
          {WEIGHT_OPTIONS.map((w) => {
            const active = weightClass === w.value
            return (
              <button
                key={w.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => { setWeightClass(w.value); queueSave({ weight_class: w.value }) }}
                className={`flex min-h-11 flex-col items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-primary/50 bg-primary-bg text-primary-strong'
                    : 'border-border bg-surface text-muted hover:bg-surface-elevated'
                }`}
              >
                <span>{w.label}</span>
                <span className={`text-2xs font-semibold ${active ? 'text-primary-strong' : 'text-subtle'}`}>{w.zaps} Zaps</span>
              </button>
            )
          })}
        </div>
        <p className="mt-1 text-xs text-subtle">The fallback per-log payout when no Zap override is set. Light 8 · Standard 12 · Heavy 15 Zaps.</p>
      </fieldset>

      {/* Reward override — admin only. Overrides the weight-class payout + sets the card note. */}
      {props.isAdmin && (
        <fieldset className="mt-4 rounded-lg border border-warning/30 bg-warning-bg/20 p-3">
          <legend className="px-1 text-2xs font-semibold uppercase tracking-wide text-warning">Reward override · admin</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <StudioField label="Zap reward override">
              <input
                type="number"
                min={0}
                max={1000}
                value={rewardZaps}
                onChange={(e) => setRewardZaps(e.target.value)}
                onBlur={saveReward}
                placeholder="(weight-class default)"
                className={FIELD}
              />
            </StudioField>
            <StudioField label="Reward note (on the card)">
              <input
                value={rewardNote}
                onChange={(e) => setRewardNote(e.target.value)}
                onBlur={saveReward}
                maxLength={120}
                placeholder="e.g. +20 Zaps · streak +1"
                className={FIELD}
              />
            </StudioField>
          </div>
          <p className="mt-1 text-xs text-subtle">Overrides the weight-class payout. Leave the Zap field blank to use the default.</p>
        </fieldset>
      )}

      {/* Tags */}
      <div className="mt-4">
        <StudioField label="Tags">
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            onBlur={saveTags}
            maxLength={240}
            placeholder="morning, quick, outdoor"
            className={FIELD}
          />
        </StudioField>
        <p className="mt-1 text-xs text-subtle">Comma-separated. Helps people find this practice; new tags join the library.</p>
      </div>

      {/* Description + full guide */}
      <div className="mt-4 space-y-4">
        <StudioField label="Short description">
          <textarea value={description} onChange={(e) => { setDescription(e.target.value); queueSave({ description: e.target.value }) }} rows={2} maxLength={280} className={FIELD} />
        </StudioField>
        <StudioField label="Full guide (markdown)">
          <textarea value={body} onChange={(e) => { setBody(e.target.value); queueSave({ body: e.target.value }) }} rows={10} maxLength={8000} placeholder="How to do it, why it matters, tips…" className={`font-mono ${FIELD}`} />
        </StudioField>
      </div>

      <p className="mt-4 text-xs text-subtle">Changes apply everywhere this practice appears.</p>

      {/* Danger zone — delete your own practice (owner-or-admin, re-checked server-side). */}
      <div className="mt-6 border-t border-border pt-4">
        <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Danger zone</p>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={deleting}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-bg/40 disabled:opacity-60"
        >
          <Trash2 className="h-4 w-4" /> Delete this practice
        </button>
        <p className="mt-1.5 text-2xs text-muted">Removes it from the library, with its logs and adoptions. This cannot be undone.</p>
      </div>

      <DangerModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete practice"
        body={
          <>
            This removes <span className="font-semibold text-text">{title || 'this practice'}</span> from the
            library for everyone, with its logs and adoptions. This cannot be undone.
          </>
        }
        confirmLabel="Delete practice"
        requireTyping={title || 'this practice'}
        onConfirm={remove}
      />
    </StudioWindow>
  )
}
