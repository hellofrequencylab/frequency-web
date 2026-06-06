'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import type { SequenceSplash } from '@/lib/onboarding/beta-sequences'
import { saveSequenceSplash } from './actions'

const input =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle outline-none focus:border-broadcast'
const label = 'block text-xs font-semibold text-subtle mb-1'

const FIELDS: { key: keyof SequenceSplash; label: string; hint?: string; area?: boolean }[] = [
  { key: 'eyebrow', label: 'Eyebrow', hint: 'Small kicker above the headline' },
  { key: 'headline', label: 'Headline' },
  { key: 'body', label: 'Body', area: true },
  { key: 'cta', label: 'CTA label' },
  { key: 'statement', label: 'Statement', hint: 'Wrap the accent word in *asterisks*' },
  { key: 'image', label: 'Hero image', hint: 'public/ path or URL' },
  { key: 'imageAlt', label: 'Image alt' },
]

export function SequenceSplashForm({ slug, splash }: { slug: string; splash: SequenceSplash }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)
  const [values, setValues] = useState<SequenceSplash>(splash)

  function set<K extends keyof SequenceSplash>(key: K, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }))
    setSaved(false)
  }

  function save() {
    if (pending) return
    start(async () => {
      const r = await saveSequenceSplash(slug, values)
      if (r.ok) {
        setSaved(true)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      {FIELDS.map((f) => (
        <div key={f.key}>
          <label className={label}>
            {f.label}
            {f.hint && <span className="ml-1.5 font-normal text-subtle/70">— {f.hint}</span>}
          </label>
          {f.area ? (
            <textarea className={`${input} resize-y`} rows={3} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
          ) : (
            <input className={input} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
          )}
        </div>
      ))}

      <div className="flex items-center justify-end gap-3 pt-1">
        {saved && <span className="inline-flex items-center gap-1 text-xs font-semibold text-success"><Check className="h-3.5 w-3.5" /> Saved & published</span>}
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save & publish'}
        </button>
      </div>
    </div>
  )
}
