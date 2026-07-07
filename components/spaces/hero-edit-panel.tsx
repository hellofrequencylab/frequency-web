'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { FieldEditor } from '@/components/entity-blocks/block-edit-panel'
import { HERO_FIELDS, heroCtaToPreference } from '@/lib/spaces/hero-config'
import { isError } from '@/lib/action-result'

// THE PINNED HERO EDITOR (PR: editable-top-hero). The rail arranger's FIXED first section: the profile cover
// hero, always at the top, editable but not deletable or reorderable like a normal block. It reuses the SAME
// declarative field kit every block uses — it maps over HERO_FIELDS (lib/spaces/hero-config) and dispatches
// each one through the shared FieldEditor, so height / button orientation / eyebrow / heading / tagline / CTA
// all render through the ADR-569 C6 control surface with NO bespoke control JSX.
//
// Persistence: the hero is NOT a rows-model block, so it does not ride the shared entity-layout store; it has
// its OWN debounced save (mirroring the store's ~600ms flush) through setSpaceHero, which writes the look/copy
// overrides to preferences.hero and the CTA to preferences.headerCta (item 5). The live cover render reconciles
// through router.refresh() on save (the cover chrome is a Server Component outside the client grid, so it
// cannot repaint purely client-side). Owner-gated upstream (the panel only mounts inside the owner rail).
//
// Copy runs CONTENT-VOICE: plain, sentence case, no em dashes.

const SAVE_DEBOUNCE_MS = 600

/** The hero editor's working values — the flat bag the declared HERO_FIELDS bind to (their keys). Every field
 *  is optional / a plain string; the render + sanitizer fall back to the Space defaults for blanks. */
export interface HeroEditorValues {
  height?: string
  buttonOrientation?: string
  eyebrow?: string
  heading?: string
  tagline?: string
  ctaLabel?: string
  ctaUrl?: string
}

export function HeroEditPanel({
  slug,
  initial,
}: {
  /** The Space whose hero this edits; guarded by the owner gate that mounts the panel. */
  slug: string
  /** The current hero values (from the rail seed): the operator's overrides, else the Space defaults. */
  initial: HeroEditorValues
}) {
  const router = useRouter()
  const [values, setValues] = useState<HeroEditorValues>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<HeroEditorValues | null>(null)

  const flush = useCallback(async () => {
    const next = pending.current
    if (!next) return
    pending.current = null
    setSaving(true)
    setError(null)
    try {
      // Split the flat values into the two persisted shapes: the hero look/copy bag (preferences.hero) and the
      // CTA (preferences.headerCta, via the header-cta model — item 5). The action re-validates + sanitizes.
      const { setSpaceHero } = await import('@/app/(main)/spaces/[slug]/manage/layout/actions')
      const res = await setSpaceHero(
        slug,
        {
          height: next.height as never,
          buttonOrientation: next.buttonOrientation as never,
          eyebrow: next.eyebrow,
          heading: next.heading,
          tagline: next.tagline,
        },
        heroCtaToPreference(next.ctaLabel ?? '', next.ctaUrl ?? ''),
      )
      if (res && isError(res)) setError(res.error)
      else router.refresh() // reconcile the Server-Component cover render with the saved hero
    } catch {
      setError('Could not save your hero. Try again.')
    } finally {
      setSaving(false)
    }
  }, [slug, router])

  // Flush any pending save on unmount / navigation so a mid-debounce edit is never lost (mirrors the store).
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      void flush()
    }
  }, [flush])

  const setField = useCallback(
    (key: keyof HeroEditorValues, value: unknown) => {
      setValues((prev) => {
        const next = { ...prev }
        if (value === undefined || value === '') delete next[key]
        else next[key] = value as string
        pending.current = next
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
        return next
      })
    },
    [flush],
  )

  return (
    <section
      aria-label="Top hero"
      className="rounded-2xl border border-primary/40 bg-surface"
    >
      {/* The pinned strip header: a fixed section, visually distinct (accent border) from the reorderable rows
          below it, so the operator reads it as "always at the top". No drag handle, no remove, no reorder. */}
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-text">
          <Sparkles className="h-3.5 w-3.5 text-primary-strong" aria-hidden />
          Top hero
        </span>
        {saving ? (
          <span className="flex items-center gap-1 text-2xs text-subtle" role="status" aria-live="polite">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving
          </span>
        ) : (
          <span className="flex items-center gap-1 text-2xs text-subtle" role="status" aria-live="polite">
            <Check className="h-3 w-3 text-success" aria-hidden /> Saved
          </span>
        )}
      </header>

      <div className="space-y-3 p-3">
        <p className="text-2xs text-subtle">
          The band at the very top of your page. It always stays first. Changes save on their own.
        </p>

        {error && (
          <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs font-medium text-danger" role="alert">
            {error}
          </p>
        )}

        {/* Every hero control is a declared field, dispatched through the SAME FieldEditor the block panel
            uses — height / buttons are the C6 primitives, the rest are text / textarea / url inputs. */}
        {HERO_FIELDS.map((field) => (
          <FieldEditor
            key={field.key}
            field={field}
            value={values[field.key as keyof HeroEditorValues]}
            onChange={(v) => setField(field.key as keyof HeroEditorValues, v)}
          />
        ))}
      </div>
    </section>
  )
}
