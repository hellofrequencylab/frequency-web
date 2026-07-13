'use client'

import { useMemo, useState, useTransition } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import type { EmailColors } from '@/lib/email-studio/render'
import type { SpaceEmailStyle } from '@/lib/spaces/email-colors'
import { setSpaceEmailStyle } from '@/lib/spaces/email-style-actions'
import { isError } from '@/lib/action-result'

// EMAIL STYLE EDITOR (Email in the Business CRM, P1 · deliverable 3). Tunes the brand-derived email palette a
// Space's emails default to. A short, plain list of the colors that matter, each a swatch + hex you can reset to
// the brand default, beside a live mini-preview of an email in those colors. Saving persists only the fields you
// changed (setSpaceEmailStyle → spaces.preferences.emailStyle); the resolver (spaceEmailColors) layers them over
// the brand + platform default at render time.
//
// App chrome uses DAWN semantic tokens. The mini-preview and its swatches use inline hex ON PURPOSE: they render
// the EMAIL, which lives outside the app shell where DAWN CSS variables cannot resolve (the one place hex is
// correct). Voice canon: plain labels, no narrated feelings, no em/en dashes.

/** The palette slots the operator can tune, in display order, with plain names + one-line purposes. A subset of
 *  EmailColors — the high-impact colors; the rest keep the brand-derived / default value. */
const FIELDS: readonly { key: keyof EmailColors; label: string; desc: string }[] = [
  { key: 'primary', label: 'Buttons and links', desc: 'The main color for buttons and links.' },
  { key: 'primaryStrong', label: 'Headings', desc: 'Headings and the small label above them.' },
  { key: 'primaryBg', label: 'Highlight background', desc: 'The fill behind a callout or highlight.' },
  { key: 'canvas', label: 'Page background', desc: 'The area around the email card.' },
  { key: 'surface', label: 'Card background', desc: 'The card the email sits on.' },
  { key: 'text', label: 'Body text', desc: 'The color of the words.' },
]

const HEX = /^#[0-9a-fA-F]{6}$/

export function EmailStyleEditor({
  slug,
  current,
  brandDefaults,
  readOnly = false,
}: {
  slug: string
  /** The currently resolved palette (default + brand + any saved override) — the initial field values. */
  current: EmailColors
  /** The brand-derived palette WITHOUT the override — what each "reset" returns a field to. */
  brandDefaults: EmailColors
  /** A staff janitor preview: the controls render disabled. */
  readOnly?: boolean
}) {
  const initial = useMemo(() => {
    const out: Record<string, string> = {}
    for (const f of FIELDS) out[f.key] = current[f.key]
    return out
  }, [current])

  const [values, setValues] = useState<Record<string, string>>(initial)
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const setField = (key: string, value: string) => {
    setNote(null)
    setValues((v) => ({ ...v, [key]: value }))
  }

  const resetField = (key: keyof EmailColors) => setField(key, brandDefaults[key])
  const resetAll = () => {
    setNote(null)
    const out: Record<string, string> = {}
    for (const f of FIELDS) out[f.key] = brandDefaults[f.key]
    setValues(out)
  }

  // The override to persist: only the fields that differ from the brand default (so we never store redundant
  // values, and a field matching the brand clears back to "use the brand default"). Invalid hex is dropped.
  const buildOverride = (): SpaceEmailStyle => {
    const out: SpaceEmailStyle = {}
    for (const f of FIELDS) {
      const v = values[f.key]
      if (HEX.test(v) && v.toLowerCase() !== brandDefaults[f.key].toLowerCase()) {
        out[f.key] = v
      }
    }
    return out
  }

  const onSave = () => {
    if (readOnly) return
    setNote(null)
    const override = buildOverride()
    startTransition(async () => {
      const res = await setSpaceEmailStyle(slug, override)
      if (isError(res)) setNote({ kind: 'error', text: res.error })
      else setNote({ kind: 'ok', text: 'Saved. New emails will use these colors.' })
    })
  }

  // The live preview reads the working values, falling back to the resolved current for any slot not exposed.
  const preview: EmailColors = { ...current, ...(values as Partial<EmailColors>) }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      {/* LEFT: the color fields. */}
      <div className="space-y-3">
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {FIELDS.map((f) => {
            const value = values[f.key]
            const changed = HEX.test(value) && value.toLowerCase() !== brandDefaults[f.key].toLowerCase()
            return (
              <li key={f.key} className="flex items-center gap-3 p-3">
                <input
                  type="color"
                  aria-label={f.label}
                  value={HEX.test(value) ? value : '#000000'}
                  disabled={readOnly}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent disabled:cursor-not-allowed"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text">{f.label}</p>
                  <p className="text-xs text-muted">{f.desc}</p>
                </div>
                <input
                  type="text"
                  aria-label={`${f.label} hex`}
                  value={value}
                  disabled={readOnly}
                  spellCheck={false}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className="w-24 rounded-lg border border-border bg-surface-elevated/50 px-2 py-1.5 text-xs text-text placeholder:text-subtle focus:border-primary focus:outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  aria-label={`Reset ${f.label} to the brand default`}
                  onClick={() => resetField(f.key)}
                  disabled={readOnly || !changed}
                  className="shrink-0 rounded p-1.5 text-subtle transition-colors hover:text-text disabled:opacity-30"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={readOnly || pending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save style
          </button>
          <button
            type="button"
            onClick={resetAll}
            disabled={readOnly}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-text disabled:opacity-50"
          >
            Reset to brand
          </button>
          {note && (
            <span
              role="status"
              className={`text-xs font-medium ${note.kind === 'ok' ? 'text-success' : 'text-danger'}`}
            >
              {note.text}
            </span>
          )}
        </div>
      </div>

      {/* RIGHT: a live mini-preview of an email in the working colors (inline hex — this renders the EMAIL). */}
      <div>
        <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Preview</p>
        <div className="rounded-2xl p-4" style={{ background: preview.canvas }}>
          <div
            className="mx-auto max-w-[18rem] rounded-xl p-5"
            style={{ background: preview.surface, border: `1px solid ${preview.border}` }}
          >
            <p className="text-lg font-black lowercase" style={{ color: preview.primaryStrong }}>
              frequency
            </p>
            <p className="mt-3 text-sm font-bold" style={{ color: preview.primaryStrong }}>
              A quick hello
            </p>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: preview.text }}>
              This is how your emails will look. Plain words, your colors.
            </p>
            <div
              className="mt-3 rounded-lg p-2.5 text-xs"
              style={{ background: preview.primaryBg, color: preview.text }}
            >
              A highlighted note sits in here.
            </div>
            <span
              className="mt-3 inline-block rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ background: preview.primary, color: preview.onPrimary }}
            >
              Take a look
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
