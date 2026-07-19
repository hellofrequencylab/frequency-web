'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, Loader2, ExternalLink } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { ELEMENT_ROLES, ELEMENT_ROLE_LABEL, type ElementDef, type ElementRole } from '@/lib/elements/registry'
import type { ResolvedElement, StoredElementConfig } from '@/lib/elements/config'
import { ElementPreview } from '@/components/elements/previews'
import { saveElementSettings } from './actions'

// One card per registered element: edit its feature settings (toggles / choices) + per-feature ROLE
// GATE (who may use each). Saving writes the PLATFORM MASTER, so every occurrence of the element
// reflects it site-wide. Seeded with the element's currently-resolved values.
export function ElementEditor({ def, resolved }: { def: ElementDef; resolved: ResolvedElement }) {
  const [settings, setSettings] = useState<Record<string, boolean | string>>({ ...resolved.settings })
  const [roles, setRoles] = useState<Record<string, ElementRole>>({ ...resolved.roles })
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  const save = () =>
    start(async () => {
      setNote(null)
      const config: StoredElementConfig = { settings, roles }
      const res = await saveElementSettings(def.key, config)
      setNote(isError(res) ? res.error : 'Saved. This applies everywhere the element appears.')
    })

  const inputSm = 'rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text focus:border-primary focus:outline-none'

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-text">{def.label}</h3>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">{def.description}</p>
        </div>
        {def.studioHref && (
          <Link href={def.studioHref} className="inline-flex items-center gap-1 text-sm font-medium text-primary-strong hover:underline">
            Open studio <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {/* Live preview of the canonical element (omitted for elements without one). */}
      <ElementPreview elementKey={def.key} />

      <ul className="mt-4 divide-y divide-border">
        {def.features.map((f) => (
          <li key={f.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text">{f.label}</p>
              {f.help && <p className="text-2xs text-muted">{f.help}</p>}
            </div>

            {/* Value: a toggle, or a choice select */}
            {f.kind === 'toggle' ? (
              <button
                type="button"
                role="switch"
                aria-checked={settings[f.key] === true}
                onClick={() => setSettings((s) => ({ ...s, [f.key]: !(s[f.key] === true) }))}
                className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${settings[f.key] === true ? 'border-primary bg-primary' : 'border-border bg-surface-elevated'}`}
              >
                <span className={`ml-0.5 h-5 w-5 rounded-full bg-canvas shadow transition-transform ${settings[f.key] === true ? 'translate-x-5' : ''}`} />
              </button>
            ) : (
              <select
                value={String(settings[f.key] ?? '')}
                onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.value }))}
                className={inputSm}
              >
                {f.choices?.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            )}

            {/* Role gate */}
            <label className="flex shrink-0 items-center gap-1.5 text-2xs text-subtle">
              Who
              <select
                value={roles[f.key] ?? f.defaultRole}
                onChange={(e) => setRoles((r) => ({ ...r, [f.key]: e.target.value as ElementRole }))}
                className={inputSm}
              >
                {ELEMENT_ROLES.map((r) => (
                  <option key={r} value={r}>{ELEMENT_ROLE_LABEL[r]}</option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save master
        </button>
        {note && <p className="text-xs text-muted">{note}</p>}
      </div>
    </div>
  )
}
