'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Store } from 'lucide-react'
import { saveListing, type ListingInput } from './actions'
import { isError } from '@/lib/action-result'

const FIELDS: { key: keyof ListingInput; label: string; placeholder: string; textarea?: boolean }[] = [
  { key: 'name', label: 'Name', placeholder: 'Your business name' },
  { key: 'category', label: 'Category', placeholder: 'e.g. Café · Studio · Wellness' },
  { key: 'city', label: 'City', placeholder: 'Where you’re based' },
  { key: 'address', label: 'Address', placeholder: 'Street address (optional)' },
  { key: 'website', label: 'Website', placeholder: 'https://…' },
  { key: 'description', label: 'Description', placeholder: 'What members will find when they walk in.', textarea: true },
]

export function ListingForm({ initial }: { initial: Partial<Record<keyof ListingInput, string | null>> | null }) {
  const [form, setForm] = useState<ListingInput>({
    name: initial?.name ?? '',
    category: initial?.category ?? '',
    city: initial?.city ?? '',
    address: initial?.address ?? '',
    website: initial?.website ?? '',
    description: initial?.description ?? '',
  })
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const router = useRouter()

  function set<K extends keyof ListingInput>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function submit() {
    setResult(null)
    startTransition(async () => {
      const r = await saveListing(form)
      if (isError(r)) setResult({ ok: false, text: r.error })
      else {
        setResult({ ok: true, text: 'Listing published. Members can find you in the directory.' })
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-4">
      {FIELDS.map((f) => (
        <label key={f.key} className="block">
          <span className="mb-1 block text-sm font-medium text-text">{f.label}</span>
          {f.textarea ? (
            <textarea
              value={form[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              rows={4}
              placeholder={f.placeholder}
              className="w-full resize-none rounded-xl border border-border bg-surface-elevated px-4 py-3 text-sm text-text placeholder:text-subtle outline-none focus:border-primary"
            />
          ) : (
            <input
              value={form[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              className="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-text placeholder:text-subtle outline-none focus:border-primary"
            />
          )}
        </label>
      ))}

      <div className="flex items-center justify-between gap-3">
        {result && (
          <p className={`inline-flex items-center gap-1.5 text-sm ${result.ok ? 'text-success' : 'text-danger'}`}>
            {result.ok && <Check className="h-4 w-4 shrink-0" />} {result.text}
          </p>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !form.name.trim()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
          {initial ? 'Save listing' : 'Publish listing'}
        </button>
      </div>
    </div>
  )
}
