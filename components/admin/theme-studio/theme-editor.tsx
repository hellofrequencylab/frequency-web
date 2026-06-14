'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Palette, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldClasses } from '@/components/ui/field'
import { SectionHeader } from '@/components/ui/section-header'
import { isError, type ActionResult } from '@/lib/action-result'
import type { ThemeInput, ThemeKind, ThemeRow, ThemeTokens } from '@/lib/theme/admin-types'
import {
  TOKEN_GROUPS,
  BUILT_IN_SLUGS,
  type TokenSpec,
} from './tokens'
import { ThemePreview } from './theme-preview'
// Relative import per the build contract (another agent owns this actions file).
import { createTheme, updateTheme } from '../../../app/(main)/admin/appearance/actions'

// The Theme Studio editor (PAGE-FRAMEWORK: a Focus/compose surface). It edits a single
// ThemeInput draft and maps each token field into the {light, dark, feel} blocks of
// ThemeTokens, then calls createTheme (new) or updateTheme (existing). A live preview sits
// in the right column and re-skins as the operator types.
//
// TOKEN → ThemeInput MAPPING (the load-bearing rule):
//   - Each `--color-*` token renders a LIGHT input (writes tokens.light[name]) and a DARK
//     input (writes tokens.dark[name]), side by side.
//   - Each feel token renders ONE input (writes tokens.feel[name]).
//   - A BLANK field means "inherit the base" — the key is REMOVED from the block, so it is
//     never sent. The server persists only the keys present (and re-validates each).
// The only hardcoded colors live inside <ThemePreview> (the user's chosen palette is the
// point there); this form itself is semantic-token-only.

/** Turn a name into a slug suggestion: lowercase, spaces/punct → hyphens, trimmed. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/** An empty draft for the "new" route. */
export function blankTheme(): ThemeInput {
  return {
    slug: '',
    name: '',
    kind: 'skin',
    tokens: { light: {}, dark: {}, feel: {} },
    windowStart: null,
    windowEnd: null,
  }
}

/** Project a ThemeRow back to the editable ThemeInput shape (drops id/status/etc.). */
function toInput(row: ThemeRow): ThemeInput {
  return {
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    tokens: {
      light: { ...row.tokens.light },
      dark: { ...row.tokens.dark },
      feel: { ...row.tokens.feel },
    },
    windowStart: row.windowStart ?? null,
    windowEnd: row.windowEnd ?? null,
  }
}

type Block = keyof ThemeTokens // 'light' | 'dark' | 'feel'

const labelCls = 'block text-xs font-semibold text-muted'
const fieldHint = 'mt-1 text-xs text-subtle'

export function ThemeEditor({ initial, mode }: { initial: ThemeRow | null; mode: 'new' | 'edit' }) {
  const router = useRouter()
  const [draft, setDraft] = useState<ThemeInput>(() => (initial ? toInput(initial) : blankTheme()))
  // Auto-suggest the slug from the name only while the operator hasn't typed their own (and
  // never on an existing theme, where the slug is already meaningful).
  const [slugTouched, setSlugTouched] = useState(mode === 'edit')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const themeId = initial?.id ?? null

  function setField<K extends keyof ThemeInput>(key: K, value: ThemeInput[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
    setError(null)
  }

  function onNameChange(value: string) {
    setDraft((d) => ({
      ...d,
      name: value,
      // Mirror the name into the slug until the operator edits the slug directly.
      slug: slugTouched ? d.slug : slugify(value),
    }))
    setError(null)
  }

  /** Write (or clear) a single token value into the right block. Empty = delete the key so it
   *  isn't sent (the base value inherits). */
  function setToken(block: Block, name: string, value: string) {
    setDraft((d) => {
      const next = { ...d.tokens[block] }
      const v = value.trim()
      if (v) next[name] = v
      else delete next[name]
      return { ...d, tokens: { ...d.tokens, [block]: next } }
    })
    setError(null)
  }

  const isOccasion = draft.kind === 'occasion'
  const slugCollision = useMemo(
    () => draft.kind === 'skin' && BUILT_IN_SLUGS.includes(draft.slug),
    [draft.kind, draft.slug],
  )

  function submit() {
    if (pending) return
    setError(null)
    start(async () => {
      const payload: ThemeInput = {
        ...draft,
        // The server ignores the window for skins, but keep the payload clean here too.
        windowStart: isOccasion ? draft.windowStart || null : null,
        windowEnd: isOccasion ? draft.windowEnd || null : null,
      }
      const result: ActionResult<{ id: string } | void> =
        mode === 'edit' && themeId
          ? await updateTheme(themeId, payload)
          : await createTheme(payload)
      if (isError(result)) {
        setError(result.error)
        return
      }
      router.push('/admin/appearance')
      router.refresh()
    })
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      {/* Header band */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/admin/appearance"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-text"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to Theme Studio
          </Link>
          <h1 className="mt-1 inline-flex items-center gap-2 text-xl font-bold text-text">
            <Palette className="h-5 w-5 text-primary-strong" aria-hidden />
            {mode === 'new' ? 'New theme' : draft.name || 'Edit theme'}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            A theme is a set of token overrides. Leave a field blank to inherit the base look.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/appearance">Cancel</Link>
          </Button>
          <Button type="button" disabled={pending} onClick={submit}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {pending ? 'Saving…' : mode === 'new' ? 'Create theme' : 'Save theme'}
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-danger/40 bg-danger-bg px-4 py-3 text-sm font-medium text-danger"
        >
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        {/* ── LEFT: the form ── */}
        <div className="min-w-0 space-y-8">
          {/* Identity */}
          <section className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <SectionHeader title="Identity" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="theme-name" className={labelCls}>
                  Name
                </label>
                <input
                  id="theme-name"
                  className={`${fieldClasses} mt-1`}
                  value={draft.name}
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="e.g. Solstice"
                />
              </div>
              <div>
                <label htmlFor="theme-slug" className={labelCls}>
                  Slug
                </label>
                <input
                  id="theme-slug"
                  className={`${fieldClasses} mt-1`}
                  value={draft.slug}
                  onChange={(e) => {
                    setSlugTouched(true)
                    setField('slug', e.target.value.toLowerCase())
                  }}
                  placeholder="solstice"
                  inputMode="text"
                  pattern="[a-z0-9-]*"
                  aria-describedby="theme-slug-hint"
                />
                <p id="theme-slug-hint" className={fieldHint}>
                  Lowercase letters, numbers, and hyphens. Built-in slugs <code>default</code> and{' '}
                  <code>midnight</code> already exist in code.
                </p>
                {slugCollision && (
                  <p className="mt-1 text-xs font-medium text-warning">
                    This slug overlays a built-in skin of the same name.
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="theme-kind" className={labelCls}>
                  Kind
                </label>
                <select
                  id="theme-kind"
                  className={`${fieldClasses} mt-1`}
                  value={draft.kind}
                  onChange={(e) => setField('kind', e.target.value as ThemeKind)}
                >
                  <option value="skin">Skin · a palette and feel</option>
                  <option value="occasion">Occasion · a seasonal overlay</option>
                </select>
                <p className={fieldHint}>
                  {isOccasion
                    ? 'An overlay that applies within a calendar window.'
                    : 'The base palette and feel for a Space.'}
                </p>
              </div>
            </div>

            {isOccasion && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="theme-window-start" className={labelCls}>
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" aria-hidden /> Window start (MM-DD)
                    </span>
                  </label>
                  <input
                    id="theme-window-start"
                    className={`${fieldClasses} mt-1`}
                    value={draft.windowStart ?? ''}
                    onChange={(e) => setField('windowStart', e.target.value || null)}
                    placeholder="12-01"
                    pattern="\d{2}-\d{2}"
                    aria-describedby="theme-window-hint"
                  />
                </div>
                <div>
                  <label htmlFor="theme-window-end" className={labelCls}>
                    Window end (MM-DD)
                  </label>
                  <input
                    id="theme-window-end"
                    className={`${fieldClasses} mt-1`}
                    value={draft.windowEnd ?? ''}
                    onChange={(e) => setField('windowEnd', e.target.value || null)}
                    placeholder="12-31"
                    pattern="\d{2}-\d{2}"
                    aria-describedby="theme-window-hint"
                  />
                </div>
                <p id="theme-window-hint" className={`${fieldHint} sm:col-span-2`}>
                  Inclusive calendar bounds, e.g. 12-01 to 12-31. The overlay applies only inside
                  the window.
                </p>
              </div>
            )}
          </section>

          {/* Token groups */}
          {TOKEN_GROUPS.map((group) => (
            <section
              key={group.title}
              className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm"
            >
              <div>
                <SectionHeader title={group.title} />
                <p className="-mt-2 text-xs text-subtle">{group.hint}</p>
              </div>
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {group.tokens.map((spec) => (
                  <TokenField key={spec.name} spec={spec} draft={draft} setToken={setToken} />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* ── RIGHT: live preview (sticky) ── */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <ThemePreview tokens={draft.tokens} />
          </div>
        </div>
      </div>
    </div>
  )
}

/** One token's editor row. Color tokens render a light + dark color pair; feel tokens render a
 *  single text/number input typed to their value kind. */
function TokenField({
  spec,
  draft,
  setToken,
}: {
  spec: TokenSpec
  draft: ThemeInput
  setToken: (block: Block, name: string, value: string) => void
}) {
  if (spec.axis === 'feel') {
    const value = draft.tokens.feel[spec.name] ?? ''
    const id = `feel-${spec.name}`
    return (
      <div>
        <label htmlFor={id} className={labelCls}>
          {spec.label}
        </label>
        <input
          id={id}
          type={spec.feel === 'number' ? 'number' : 'text'}
          inputMode={spec.feel === 'number' ? 'decimal' : 'text'}
          step={spec.feel === 'number' ? 'any' : undefined}
          className={`${fieldClasses} mt-1`}
          value={value}
          placeholder={spec.placeholder}
          onChange={(e) => setToken('feel', spec.name, e.target.value)}
        />
        {spec.hint && <p className={fieldHint}>{spec.hint}</p>}
      </div>
    )
  }

  // color-mode: a light + dark pair.
  const light = draft.tokens.light[spec.name] ?? ''
  const dark = draft.tokens.dark[spec.name] ?? ''
  return (
    <div>
      <div className="text-xs font-semibold text-muted">{spec.label}</div>
      {spec.hint && <p className="text-xs text-subtle">{spec.hint}</p>}
      <div className="mt-1 grid grid-cols-2 gap-2">
        <ColorPair
          idBase={`light-${spec.name}`}
          modeLabel="Light"
          value={light}
          placeholder={spec.placeholder}
          ariaLabel={`${spec.label} (light)`}
          onChange={(v) => setToken('light', spec.name, v)}
        />
        <ColorPair
          idBase={`dark-${spec.name}`}
          modeLabel="Dark"
          value={dark}
          placeholder={spec.placeholder}
          ariaLabel={`${spec.label} (dark)`}
          onChange={(v) => setToken('dark', spec.name, v)}
        />
      </div>
    </div>
  )
}

/** A color input: a native swatch picker beside a hex text field, sharing one value. The text
 *  field is authoritative (it accepts blank = inherit, and any allowed CSS color the validator
 *  permits); the swatch is a convenience that writes a hex. */
function ColorPair({
  idBase,
  modeLabel,
  value,
  placeholder,
  ariaLabel,
  onChange,
}: {
  idBase: string
  modeLabel: string
  value: string
  placeholder?: string
  ariaLabel: string
  onChange: (value: string) => void
}) {
  // The native color input needs a valid 6-digit hex; fall back to the placeholder or a neutral.
  const swatchValue = /^#[0-9a-fA-F]{6}$/.test(value)
    ? value
    : placeholder && /^#[0-9a-fA-F]{6}$/.test(placeholder)
      ? placeholder
      : '#000000'
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        aria-label={`${ariaLabel} swatch`}
        value={swatchValue}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-0.5"
      />
      <input
        id={idBase}
        type="text"
        aria-label={`${ariaLabel} value`}
        value={value}
        placeholder={placeholder ? `${modeLabel} · ${placeholder}` : modeLabel}
        onChange={(e) => onChange(e.target.value)}
        className={`${fieldClasses} min-w-0 flex-1`}
      />
    </div>
  )
}
