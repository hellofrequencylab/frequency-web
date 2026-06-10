'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Contact, Download, Check } from 'lucide-react'
import type { VcardConfig } from '@/lib/vcard'
import type { ActionResult } from '@/lib/action-result'

// Contact card editor. Reused for self-edit (/codes) and admin edit (QR Studio) via
// the `onSave` action. Toggle "Save contact" on, fill only the fields to share
// (permissions = presence + the enable switch); nothing else reaches the .vcf.
export function VcardEditor({
  config,
  handle,
  onSave,
}: {
  config: VcardConfig
  handle: string
  onSave: (config: VcardConfig) => Promise<ActionResult>
}) {
  const [form, setForm] = useState<VcardConfig>(config)
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  function set<K extends keyof VcardConfig>(key: K, value: VcardConfig[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }
  function save() {
    start(async () => {
      const r = await onSave(form)
      if (!('error' in r)) {
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-text">
          <Contact className="h-4 w-4 text-primary-strong" /> Contact card
        </h2>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
            className="accent-primary"
          />
          Offer “Save contact” on my code
        </label>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        Choose what your profile code shares. Only the fields you fill in are included.
      </p>

      {form.enabled && (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <VField label="Email" type="email" value={form.email} onChange={(v) => set('email', v)} placeholder="you@example.com" />
            <VField label="Phone" value={form.phone} onChange={(v) => set('phone', v)} placeholder="+1 555 555 5555" />
            <VField label="Title / role" value={form.title} onChange={(v) => set('title', v)} placeholder="e.g. Host, Vista circle" />
            <VField label="Organization" value={form.org} onChange={(v) => set('org', v)} placeholder="e.g. Frequency" />
            <VField label="Website" value={form.website} onChange={(v) => set('website', v)} placeholder="yoursite.com" />
            <label className="flex items-center gap-2 self-end text-sm text-text">
              <input
                type="checkbox"
                checked={form.includeAvatar}
                onChange={(e) => set('includeAvatar', e.target.checked)}
                className="accent-primary"
              />
              Include my photo
            </label>
          </div>
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {saved ? <Check className="h-3.5 w-3.5" /> : null}
          {pending ? 'Saving…' : saved ? 'Saved' : 'Save card'}
        </button>
        {config.enabled && (
          <a
            href={`/people/${handle}/vcard`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <Download className="h-3.5 w-3.5" /> Download .vcf
          </a>
        )}
      </div>
    </div>
  )
}

function VField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-subtle">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text"
      />
    </label>
  )
}
