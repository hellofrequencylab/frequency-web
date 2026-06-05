'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { updatePracticeAction, setPracticeTagsAction } from '@/app/(main)/practices/actions'
import { isError } from '@/lib/action-result'
import type { Practice } from '@/lib/practices'

// The practice content editor (ADR-096). Members shape their own practice's content
// + cadence here; rewards stay admin-governed (not exposed). FormData-free: small
// controlled form posting through the server action.

const CADENCES = ['Daily', 'A few times a week', 'Weekly', 'As needed']
const CATEGORIES = [
  'movement',
  'holistic-health',
  'spirituality',
  'creative',
  'business-support',
  'human-relating',
]
const ICONS = ['sparkles', 'waves', 'footprints', 'snowflake', 'brain', 'flame', 'heart', 'leaf', 'sun', 'moon']

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none'
const LABEL = 'block text-xs font-semibold uppercase tracking-wide text-subtle'

export function PracticeEditor({
  practice,
  pillars,
  subcategories,
  initialTags,
}: {
  practice: Practice
  pillars: { id: string; name: string }[]
  subcategories: { id: string; domain_id: string; name: string }[]
  initialTags: string[]
}) {
  const router = useRouter()
  const [title, setTitle] = useState(practice.title ?? '')
  const [summary, setSummary] = useState(practice.summary ?? '')
  const [description, setDescription] = useState(practice.description ?? '')
  const [body, setBody] = useState(practice.body ?? '')
  const [cadence, setCadence] = useState(practice.cadence ?? '')
  const [category, setCategory] = useState(practice.category ?? '')
  const [icon, setIcon] = useState(practice.icon ?? '')
  const [domainId, setDomainId] = useState(practice.domain_id ?? '')
  const [subcategoryId, setSubcategoryId] = useState(practice.subcategory_id ?? '')
  const [tagsInput, setTagsInput] = useState(initialTags.join(', '))
  const [headerImage, setHeaderImage] = useState(practice.header_image ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  // Sub-categories are scoped to the chosen Pillar; only offer the matching ones,
  // and drop the selection if it no longer belongs to the selected Pillar.
  const subOptions = subcategories.filter((s) => !domainId || s.domain_id === domainId)
  const effectiveSubId = subOptions.some((s) => s.id === subcategoryId) ? subcategoryId : ''

  function save() {
    setErr(null)
    setSaved(false)
    const labels = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
    start(async () => {
      const [r, rt] = await Promise.all([
        updatePracticeAction(practice.id, {
          title,
          summary,
          description,
          body,
          cadence,
          category,
          icon,
          domain_id: domainId || null,
          subcategory_id: effectiveSubId || null,
          header_image: headerImage,
        }),
        setPracticeTagsAction(practice.id, labels),
      ])
      const e = isError(r) ? r.error : isError(rt) ? rt.error : null
      if (e) setErr(e)
      else {
        setSaved(true)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <div>
          <label className={LABEL} htmlFor="title">Name</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={`mt-1 ${FIELD}`} />
        </div>
        <div>
          <label className={LABEL} htmlFor="summary">One-liner</label>
          <input id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={140} placeholder="A short hook shown on the card" className={`mt-1 ${FIELD}`} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="cadence">Cadence</label>
            <select id="cadence" value={cadence} onChange={(e) => setCadence(e.target.value)} className={`mt-1 ${FIELD}`}>
              <option value="">No set cadence</option>
              {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="pillar">Pillar</label>
            <select id="pillar" value={domainId} onChange={(e) => setDomainId(e.target.value)} className={`mt-1 ${FIELD}`}>
              <option value="">Uncategorized</option>
              {pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="subcategory">Sub-category</label>
            <select
              id="subcategory"
              value={effectiveSubId}
              onChange={(e) => setSubcategoryId(e.target.value)}
              disabled={!domainId}
              className={`mt-1 ${FIELD} disabled:opacity-50`}
            >
              <option value="">{domainId ? 'None' : 'Pick a Pillar first'}</option>
              {subOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="category">Category</label>
            <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} className={`mt-1 ${FIELD}`}>
              <option value="">None</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/-/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="icon">Icon</label>
            <select id="icon" value={icon} onChange={(e) => setIcon(e.target.value)} className={`mt-1 ${FIELD}`}>
              <option value="">Default</option>
              {ICONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={LABEL} htmlFor="tags">Tags</label>
          <input
            id="tags"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            maxLength={240}
            placeholder="morning, quick, outdoor"
            className={`mt-1 ${FIELD}`}
          />
          <p className="mt-1 text-xs text-subtle">
            Comma-separated. Helps people find this practice; new tags join the library.
          </p>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <div>
          <label className={LABEL} htmlFor="description">Short description</label>
          <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={280} className={`mt-1 ${FIELD}`} />
        </div>
        <div>
          <label className={LABEL} htmlFor="body">Full guide (markdown)</label>
          <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={10} maxLength={8000} placeholder="How to do it, why it matters, tips…" className={`mt-1 font-mono ${FIELD}`} />
        </div>
        <div>
          <label className={LABEL} htmlFor="header">Header image URL</label>
          <input id="header" value={headerImage} onChange={(e) => setHeaderImage(e.target.value)} maxLength={500} placeholder="https://…" className={`mt-1 ${FIELD}`} />
        </div>
      </section>

      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending || !title.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {pending ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
        </button>
        <span className="text-xs text-subtle">Changes apply everywhere this practice appears.</span>
      </div>
    </div>
  )
}
