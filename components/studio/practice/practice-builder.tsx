'use client'

import { useCallback, useState, createElement } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles, Waves, Footprints, Snowflake, Brain, Flame, Heart, Leaf, Sun, Moon, Eye,
  type LucideIcon,
} from 'lucide-react'
import { StudioWindow } from '../studio-window'
import { useStudioDraft } from '../kit/use-studio-draft'
import { StudioField } from '../kit/studio-field'
import { SaveStatus, StudioFooter } from '../kit/studio-footer'
import { updatePracticeAction, setPracticeTagsAction } from '@/app/(main)/practices/actions'
import type { PracticeEdit } from '@/lib/practices'

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

const FIELD = 'rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none'

export interface PracticeBuilderProps {
  id: string
  title: string
  summary: string | null
  description: string | null
  body: string | null
  cadence: string | null
  category: string | null
  icon: string | null
  domainId: string | null
  subcategoryId: string | null
  headerImage: string | null
  pillars: { id: string; name: string }[]
  subcategories: { id: string; domain_id: string; name: string }[]
  initialTags: string[]
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
  const [category, setCategory] = useState(props.category ?? '')
  const [icon, setIcon] = useState(props.icon ?? '')
  const [domainId, setDomainId] = useState(props.domainId ?? '')
  const [subcategoryId, setSubcategoryId] = useState(props.subcategoryId ?? '')
  const [headerImage, setHeaderImage] = useState(props.headerImage ?? '')
  const [tagsInput, setTagsInput] = useState(props.initialTags.join(', '))
  const [iconOpen, setIconOpen] = useState(false)

  // Sub-categories are scoped to the chosen Pillar.
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
      {/* Identity: icon face + name + one-liner */}
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setIconOpen((v) => !v)}
            aria-label="Choose an icon"
            className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong transition-transform hover:scale-105"
          >
            {createElement(ICON_BY_KEY.get(icon) ?? Sparkles, { className: 'h-7 w-7' })}
          </button>
          {iconOpen && (
            <div className="absolute left-0 top-[4.5rem] z-10 w-56 rounded-2xl border border-border bg-surface p-3 shadow-xl">
              <div className="grid grid-cols-5 gap-1">
                {ICONS.map(({ key, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setIcon(key); setIconOpen(false); queueSave({ icon: key }) }}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${icon === key ? 'bg-primary-bg text-primary-strong ring-2 ring-primary' : 'text-muted hover:bg-surface-elevated'}`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => { setIcon(''); setIconOpen(false); queueSave({ icon: '' }) }} className="mt-2 text-xs text-subtle hover:text-text">Use default</button>
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
        </div>
      </div>

      {/* Taxonomy + cadence */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <StudioField label="Cadence">
          <select value={cadence} onChange={(e) => { setCadence(e.target.value); queueSave({ cadence: e.target.value }) }} className={FIELD}>
            <option value="">No set cadence</option>
            {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </StudioField>
        <StudioField label="Pillar">
          <select
            value={domainId}
            onChange={(e) => { setDomainId(e.target.value); queueSave({ domain_id: e.target.value || null }) }}
            className={FIELD}
          >
            <option value="">Uncategorized</option>
            {props.pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </StudioField>
        <StudioField label="Sub-category">
          <select
            value={effectiveSubId}
            onChange={(e) => { setSubcategoryId(e.target.value); queueSave({ subcategory_id: e.target.value || null }) }}
            disabled={!domainId}
            className={`${FIELD} disabled:opacity-50`}
          >
            <option value="">{domainId ? 'None' : 'Pick a Pillar first'}</option>
            {subOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </StudioField>
        <StudioField label="Category">
          <select value={category} onChange={(e) => { setCategory(e.target.value); queueSave({ category: e.target.value || null }) }} className={FIELD}>
            <option value="">None</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/-/g, ' ')}</option>)}
          </select>
        </StudioField>
      </div>

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
        <StudioField label="Header image URL">
          <input value={headerImage} onChange={(e) => { setHeaderImage(e.target.value); queueSave({ header_image: e.target.value || null }) }} maxLength={500} placeholder="https://…" className={FIELD} />
        </StudioField>
      </div>

      <p className="mt-4 text-xs text-subtle">Changes apply everywhere this practice appears.</p>
    </StudioWindow>
  )
}
