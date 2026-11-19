'use client'

import type { ReactNode } from 'react'
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
import { Input, Textarea } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { IconButton } from '@/components/ui/icon-button'
import { ImageUpload } from '@/components/ui/image-upload'
import { DangerModal } from '@/components/admin/danger-modal'
import { isError } from '@/lib/action-result'
import { updatePracticeAction, setPracticeTagsAction, setPracticeRewardAction, deleteOwnPracticeAction } from '@/app/(main)/practices/actions'
import { submitPracticeForReviewAction } from '@/app/(main)/practices/create-actions'
import type { PracticeEdit, WeightClass, FocusDetail, TimerKind, MindlessMode } from '@/lib/practices'
import { isTierAllowed, clampTierToDuration, TIER_FLOOR_MIN } from '@/lib/practices/tiers'
// Practices share the Channel subject vocabulary (they are browsed under the same doors), so the
// category select reads THE one source (lib/channels/categories.ts, the ADR-887 view onto
// lib/taxonomy/subjects.ts) — never a hand-copied list. The old six-item copy here was missing
// `activism` and rendered lowercase key-derived labels; a stored `activism` displayed as "None".
import { CHANNEL_CATEGORIES, isChannelCategory } from '@/lib/channels/categories'
import type { MovementConfig } from '@/lib/movement'
import { Button } from '@/components/ui/button'
import { capsLabel } from '@/components/ui/caps-label'
import { choiceTileClasses } from '@/components/ui/choice-tile'
import { PRACTICE_SUPPORT_COPY } from '@/lib/practices/support-language'
import { PracticeTimerSetup } from './practice-timer-setup'
import type { SuggestTimer } from './timer-suggestions'

// Practice on the Studio shell — entity #2 (ADR-143). Composes the kit (autosave,
// fields, footer) against the existing practice actions; mirrors the old
// PracticeEditor field-for-field but in the familiar window, autosaving. Practices
// have their own icon system (no emoji/accent), so the identity "face" is a lucide
// icon — the kit is composed-from, not a rigid template.

const CADENCES = ['Daily', 'A few times a week', 'Weekly', 'As needed']
// `label` is the accessible name for the icon picker below. It is not decoration: the picker
// shipped as ten icon-only buttons with no name at all, which reads as ten identical "button"s.
const ICONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'sparkles', label: 'Sparkles', Icon: Sparkles }, { key: 'waves', label: 'Waves', Icon: Waves },
  { key: 'footprints', label: 'Footprints', Icon: Footprints }, { key: 'snowflake', label: 'Snowflake', Icon: Snowflake },
  { key: 'brain', label: 'Brain', Icon: Brain }, { key: 'flame', label: 'Flame', Icon: Flame },
  { key: 'heart', label: 'Heart', Icon: Heart }, { key: 'leaf', label: 'Leaf', Icon: Leaf },
  { key: 'sun', label: 'Sun', Icon: Sun }, { key: 'moon', label: 'Moon', Icon: Moon },
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
  /** Which timer the practice routes to: 'none' (Log it), 'mindless' (the On Air sit), or
   *  'movement' (the Movement timer). Drives the single action a follower sees on a Journey
   *  step. Sits/breathing -> mindless; a walk/flow/workout -> movement; an action/reflection -> none. */
  timerKind: TimerKind
  /** Movement config when timerKind = 'movement' (mode + tuning). */
  movementConfig: MovementConfig | null
  /** The Be Still flavour when timerKind = 'mindless' (null = derive from the Pillar). */
  mindlessMode: MindlessMode | null
  /** Author pinned a fixed length the member cannot adjust. */
  durationLocked: boolean
  /** Creator-authored warm-up message shown during the pre-roll (null = a silent pre-roll). */
  warmupMessage: string | null
  /** Creator's warm-up (pre-roll) length in seconds; null = the member's personal pre-roll. */
  warmupSec: number | null
  /** Creator-authored breath pattern slug for a Breathe practice (P4); null = the member's own. */
  breathPattern?: string | null
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
  /** Vera's composer (ADR-358), rendered full-width above the fields — the atom-level twin of the
   *  Journey builder's Vera composer. Build the whole Practice from a line, or edit it in plain
   *  words. Optional so the builder still composes standalone (e.g. the Studio popup). */
  veraComposer?: ReactNode
  /** The review status + library flag (ADR-920 Phase 5): drives the builder's Publish section
   *  (status line + "Submit to the library" for the author's own private draft). Omitted =
   *  the section is hidden (legacy mounts). */
  status?: string | null
  isPublic?: boolean
  /** Vera's read-only timer recommendation (LIVE-2396), passed by the page so the builder still
   *  composes standalone. Omitted = the offline suggested setups only. */
  suggestTimer?: SuggestTimer
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
  //
  // The stored primary goes FIRST. focus_details is jsonb, which keeps no key order (Postgres sorts
  // object keys), so the map arrives in id order and its first key need not be the primary. This
  // editor shows its first key as the primary; the server keeps the stored domain_id while it is
  // still a Focus and takes the first key of the map sent only once the primary is removed
  // (LIVE-650, ADR-1618), so seeding it first keeps what the editor shows and what is saved one.
  const [focusDetails, setFocusDetails] = useState<Record<string, FocusDetail>>(() =>
    props.domainId
      ? { [props.domainId]: { instructions: '', timing: '' }, ...props.focusDetails }
      : { ...props.focusDetails },
  )
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
  // The Publish section's submit state (ADR-920 Phase 5).
  const [submitting, setSubmitting] = useState(false)
  const [submittedNow, setSubmittedNow] = useState(false)
  const [deleting, startDelete] = useTransition()
  // Time-vs-points (ADR-442): the current length gates which Effort tiers are earnable.
  const durNum = durationMin.trim() === '' ? null : Number(durationMin)

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
  // PRIMARY Focus is the first key of THIS in-memory map (seeded with the stored primary above,
  // never a map straight from the row) and scopes the Sub Focus list.
  const focusIds = Object.keys(focusDetails)
  const domainId = focusIds[0] ?? ''

  // Persist the new Focus set: write focus_details (the server keeps domain_id while it is still a
  // Focus). Single source of truth — the toggle + per-Focus edits both route here.
  const saveFocus = (next: Record<string, FocusDetail>) => {
    setFocusDetails(next)
    queueSave({ focus_details: next })
  }

  // Toggle a Focus on/off: adding seeds an empty instructions/timing block; removing
  // drops it (and its details). Removing the primary moves domain_id to the first remaining key
  // of the map sent, server-side, which is the Focus this editor then shows as primary.
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

  // Save a session length, with anything riding along, in ONE patch. If the length no longer earns
  // the current Effort tier, the tier drops to what it does earn (time-vs-points, ADR-442).
  const commitDuration = (minutes: number | null, extra: PracticeEdit = {}) => {
    const d = minutes != null && Number.isFinite(minutes) && minutes > 0 ? minutes : null
    setDurationMin(d != null ? String(d) : '')
    const clamped = clampTierToDuration(weightClass, d)
    if (clamped !== weightClass) {
      setWeightClass(clamped)
      queueSave({ ...extra, duration_min: d, weight_class: clamped })
    } else {
      queueSave({ ...extra, duration_min: d })
    }
  }

  const footer = (
    <StudioFooter left={<SaveStatus state={saveState} error={error} />}>
      <a
        href={`/practices/${props.id}`}
        className="inline-flex items-center gap-1.5 rounded-control border border-border px-3 py-2 text-body-sm font-medium text-text transition-colors hover:bg-surface-elevated"
      >
        <Eye className="h-4 w-4" /> View
      </a>
      <Button
        type="button"
        onClick={close}
      >
        Done
      </Button>
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
            className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-card bg-primary-bg text-primary-strong transition-transform hover:scale-105"
          >
            {headerImage ? (
              // Unoptimized: user-controlled host + Supabase Storage, not a configured next/image domain.
              <Image src={headerImage} alt="" width={64} height={64} unoptimized className="h-full w-full object-cover" />
            ) : (
              createElement(ICON_BY_KEY.get(icon) ?? Sparkles, { className: 'h-7 w-7' })
            )}
          </button>
          {iconOpen && (
            <div className="absolute left-0 top-[4.5rem] z-10 w-64 max-w-[calc(100vw-2rem)] rounded-card border border-border bg-surface p-3 lift-3">
              <div className="grid grid-cols-5 gap-1">
                {/* Every one of these shipped with NO accessible name: icon-only, the glyph
                    marked nothing, so a screen reader read ten buttons called "button" and the
                    picker was unusable without sight. `label` names each one, and it is also the
                    tooltip. `tinted` is the variant this grid asked for in prose and now has: the
                    chosen icon keeps its tinted fill and primary ring, and the cells pick up the
                    press affordance and the focus ring they never had. */}
                {ICONS.map(({ key, label, Icon }) => {
                  const chosen = icon === key && !headerImage
                  return (
                    <IconButton
                      key={key}
                      label={label}
                      variant={chosen ? 'tinted' : 'plain'}
                      aria-pressed={chosen}
                      onClick={() => { setIcon(key); setIconOpen(false); queueSave({ icon: key }) }}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </IconButton>
                  )
                })}
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
              <button type="button" onClick={() => { setIcon(''); setHeaderImage(''); setIconOpen(false); queueSave({ icon: '', header_image: null }) }} className="mt-2 text-meta text-subtle hover:text-text">Use default</button>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <Input
            variant="seamless"
            aria-label="Practice name"
            value={title}
            onChange={(e) => { setTitle(e.target.value); queueSave({ title: e.target.value }) }}
            maxLength={80}
            placeholder="Name your practice"
            className="w-full text-page-title font-bold text-text"
          />
          <Input
            variant="seamless"
            aria-label="Short hook"
            value={summary}
            onChange={(e) => { setSummary(e.target.value); queueSave({ summary: e.target.value }) }}
            maxLength={140}
            placeholder="A short hook shown on the card"
            className="mt-1 w-full text-body-sm text-muted"
          />
          <p className="mt-1 text-2xs text-muted">Click the icon, name, and hook to edit.</p>
        </div>
      </div>

      {/* Vera composer (ADR-358) — full-width, under the identity row, like the Journey builder.
          Build the whole Practice from a line, or tell Vera what to change. */}
      {props.veraComposer && <div className="mt-6">{props.veraComposer}</div>}

      {/* The practice itself: the words a member reads. Written first, because the timer
          suggestions below are matched to them. */}
      <h2 className="mt-8 text-body font-bold text-text">The practice</h2>
      <p className="mt-0.5 text-body-sm text-muted">What it is and how to do it, in your own words.</p>
      {/* Description + full guide */}
      <div className="mt-4 space-y-4">
        <StudioField label="Short description">
          <Textarea value={description} onChange={(e) => { setDescription(e.target.value); queueSave({ description: e.target.value }) }} rows={2} maxLength={280} />
        </StudioField>
        <StudioField label="Full guide (markdown)">
          <Textarea value={body} onChange={(e) => { setBody(e.target.value); queueSave({ body: e.target.value }) }} rows={10} maxLength={8000} placeholder="How to do it, why it matters, tips…" className="font-mono" />
        </StudioField>
      </div>

      {/* The Timer: everything about how the practice is timed, in one place (LIVE-2396). */}
      <PracticeTimerSetup
        timerKind={props.timerKind}
        movementConfig={props.movementConfig}
        mindlessMode={props.mindlessMode}
        breathPattern={props.breathPattern ?? null}
        durationLocked={props.durationLocked}
        warmupMessage={props.warmupMessage}
        warmupSec={props.warmupSec}
        durationMin={durationMin}
        onDurationInput={setDurationMin}
        commitDuration={commitDuration}
        queueSave={queueSave}
        signals={{ title, summary, description, body }}
        suggestTimer={props.suggestTimer}
      />

      <h2 className="mt-8 text-body font-bold text-text">What it supports</h2>
      <p className="mt-0.5 text-body-sm text-muted">The areas of life this practice can help with.</p>
      {/* Focus — a practice can belong to MULTIPLE Focuses (Pillars). Toggle each on/off;
          the first selected is the primary (drives the card + Pillar filtering). */}
      <fieldset className="mt-6">
        <legend className={capsLabel('text-2xs font-semibold text-muted')}>{PRACTICE_SUPPORT_COPY.heading}</legend>
        <div role="group" aria-label={PRACTICE_SUPPORT_COPY.heading} className="mt-1 flex flex-wrap gap-2">
          {props.pillars.map((p) => {
            const active = !!focusDetails[p.id]
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleFocus(p.id)}
                className={choiceTileClasses(
                  active,
                  `min-h-11 rounded-control px-3 py-2 text-body-sm font-medium ${active ? 'text-primary-strong' : 'text-muted'}`,
                )}
              >
                {p.name}
              </button>
            )
          })}
        </div>
        <p className="mt-1 text-meta text-subtle">{PRACTICE_SUPPORT_COPY.hint}</p>
      </fieldset>

      <p className="mt-2 text-meta text-subtle">{PRACTICE_SUPPORT_COPY.detailHint}</p>

      {/* Per-Focus instructions + timing. Appears/disappears as Focuses are toggled. */}
      {focusIds.length > 0 && (
        <div className="mt-4 space-y-4">
          {focusIds.map((pillarId) => {
            const detail = focusDetails[pillarId] ?? { instructions: '', timing: '' }
            const name = props.pillars.find((p) => p.id === pillarId)?.name ?? 'Focus'
            return (
              <fieldset key={pillarId} className="rounded-control border border-border bg-surface p-3">
                <legend className={capsLabel('px-1 text-2xs font-semibold text-muted')}>{name}</legend>
                <div className="space-y-3">
                  <StudioField label="Instructions">
                    <Textarea
                      value={detail.instructions}
                      onChange={(e) => setFocusField(pillarId, 'instructions', e.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder={`How to do this practice for ${name}`}
                    />
                  </StudioField>
                  <StudioField label="Timing">
                    <Input
                      value={detail.timing}
                      onChange={(e) => setFocusField(pillarId, 'timing', e.target.value)}
                      maxLength={80}
                      placeholder="e.g. 10 min, Morning"
                    />
                  </StudioField>
                </div>
              </fieldset>
            )
          })}
        </div>
      )}

      <h2 className="mt-8 text-body font-bold text-text">Details</h2>
      <p className="mt-0.5 text-body-sm text-muted">How often it is done, and where people find it.</p>
      {/* Taxonomy + cadence */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <StudioField label="Cadence">
          <Select value={cadence} onChange={(e) => { setCadence(e.target.value); queueSave({ cadence: e.target.value }) }} emptyLabel="No set cadence">
            {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </StudioField>
        <StudioField label="Category">
          <Select value={category} onChange={(e) => { setCategory(e.target.value); queueSave({ category: e.target.value || null }) }} emptyLabel="None">
            {/* An off-list stored value (e.g. the retired `human-relating`) stays selectable and
                MARKED, never silently rewritten or shown as "None" (the ADR-879 rule). */}
            {category !== '' && !isChannelCategory(category) && (
              <option value={category}>{category} (not a standard category)</option>
            )}
            {CHANNEL_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </Select>
        </StudioField>
        <StudioField label="Sub Focus">
          <Select
            value={effectiveSubId}
            onChange={(e) => { setSubcategoryId(e.target.value); queueSave({ subcategory_id: e.target.value || null }) }}
            disabled={!domainId}
            emptyLabel={domainId ? 'None' : 'Pick a Focus first'}
          >
            {subOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </StudioField>
      </div>

      {/* Tags */}
      <div className="mt-4">
        <StudioField label="Tags">
          <Input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            onBlur={saveTags}
            maxLength={240}
            placeholder="morning, quick, outdoor"
          />
        </StudioField>
        <p className="mt-1 text-meta text-subtle">Comma-separated. Helps people find this practice; new tags join the library.</p>
      </div>

      <h2 className="mt-8 text-body font-bold text-text">Rewards</h2>
      <p className="mt-0.5 text-body-sm text-muted">What one log is worth.</p>
      {/* Effort (weight class) — the per-log Zap payout tier, GATED by required time
          (ADR-442): a tier is only earnable once the length meets its floor, so a short
          practice can never bank Heavy. Lower tiers stay open (under-claim is fine). */}
      <fieldset className="mt-4">
        <legend className={capsLabel('text-2xs font-semibold text-muted')}>Effort</legend>
        <div role="radiogroup" aria-label="Effort" className="mt-1 grid grid-cols-3 gap-2">
          {WEIGHT_OPTIONS.map((w) => {
            const active = weightClass === w.value
            const allowed = isTierAllowed(w.value, durNum)
            const floor = TIER_FLOOR_MIN[w.value]
            return (
              <button
                key={w.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!allowed}
                title={allowed ? undefined : `Needs a ${floor}+ min practice`}
                onClick={() => { if (!allowed) return; setWeightClass(w.value); queueSave({ weight_class: w.value }) }}
                className={choiceTileClasses(
                  active,
                  `flex min-h-11 flex-col items-center justify-center rounded-control px-3 py-2 text-body-sm font-medium ${
                    active ? 'text-primary-strong' : !allowed ? 'cursor-not-allowed text-subtle opacity-50' : 'text-muted'
                  }`,
                )}
              >
                <span>{w.label}</span>
                <span className={`text-2xs font-semibold ${active ? 'text-primary-strong' : 'text-muted'}`}>
                  {allowed ? `${w.zaps} Zaps` : `${floor}+ min`}
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-1 text-meta text-subtle">
          The per-log payout, earned by the practice&apos;s length: Standard needs {TIER_FLOOR_MIN.standard}+ min, Heavy {TIER_FLOOR_MIN.heavy}+ min. Set the length in the Timer section. Light 8 · Standard 12 · Heavy 15 Zaps.
        </p>
      </fieldset>

      {/* Reward override — admin only. Overrides the weight-class payout + sets the card note. */}
      {props.isAdmin && (
        <fieldset className="mt-4 rounded-control border border-warning/30 bg-warning-bg/20 p-3">
          <legend className={capsLabel('px-1 text-2xs font-semibold text-warning')}>Reward override · admin</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <StudioField label="Zap reward override">
              <Input
                type="number"
                min={0}
                max={1000}
                value={rewardZaps}
                onChange={(e) => setRewardZaps(e.target.value)}
                onBlur={saveReward}
                placeholder="(weight-class default)"
              />
            </StudioField>
            <StudioField label="Reward note (on the card)">
              <Input
                value={rewardNote}
                onChange={(e) => setRewardNote(e.target.value)}
                onBlur={saveReward}
                maxLength={120}
                placeholder="e.g. +20 Zaps · streak +1"
              />
            </StudioField>
          </div>
          <p className="mt-1 text-meta text-subtle">Overrides the weight-class payout. Leave the Zap field blank to use the default.</p>
        </fieldset>
      )}

      <p className="mt-4 text-meta text-subtle">Changes apply everywhere this practice appears.</p>

      {/* Publish (ADR-920 Phase 5): the status the author could previously never see, and the
          explicit "Submit to the library" a draft needs to reach review. Before this, a Crew
          practice entered the review queue half-built, at the moment of creation, and the
          author was never told it was under review or why it was not visible. */}
      {props.status != null && (
        <div className="mt-6 border-t border-border pt-4">
          <p className={capsLabel('text-2xs font-semibold text-muted')}>Library</p>
          {props.isPublic || props.status === 'approved' ? (
            <p className="mt-1.5 text-body-sm text-text">
              <span className="font-semibold text-success">Live.</span>{' '}
              {props.isPublic ? 'In the public library for anyone to adopt.' : 'Live to your space.'}
            </p>
          ) : props.status === 'pending' ? (
            <p className="mt-1.5 text-body-sm text-text">
              <span className="font-semibold text-warning">In review.</span> A curator will look it
              over; it goes live when approved. You can keep editing meanwhile.
            </p>
          ) : props.status === 'rejected' ? (
            <p className="mt-1.5 text-body-sm text-text">
              <span className="font-semibold text-danger">Not approved.</span> Rework it and submit
              again when it is ready.
            </p>
          ) : (
            <p className="mt-1.5 text-body-sm text-muted">
              <span className="font-semibold text-text">Private draft.</span> Only you can see it.
              Submit it to the library when the guide and timer are ready.
            </p>
          )}
          {(props.status === 'draft' || props.status === 'rejected') && (
            <Button
              type="button"
              disabled={submitting}
              onClick={() => {
                setSubmitting(true)
                void submitPracticeForReviewAction(props.id).then((res) => {
                  setSubmitting(false)
                  if (!isError(res)) setSubmittedNow(true)
                })
              }}
              size="md" className="mt-2.5 min-h-9"
            >
              {submitting ? 'Submitting…' : submittedNow ? 'Submitted' : 'Submit to the library'}
            </Button>
          )}
          {submittedNow && (
            <p className="mt-1.5 text-2xs text-success">
              Sent for review. A curator will take a look.
            </p>
          )}
        </div>
      )}

      {/* Danger zone — delete your own practice (owner-or-admin, re-checked server-side). */}
      <div className="mt-6 border-t border-border pt-4">
        <p className={capsLabel('text-2xs font-semibold text-muted')}>Danger zone</p>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={deleting}
          className="mt-2 inline-flex items-center gap-1.5 rounded-control border border-danger/30 px-3 py-2 text-body-sm font-medium text-danger transition-colors hover:bg-danger-bg/40 disabled:opacity-60"
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
