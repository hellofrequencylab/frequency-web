'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { Sun, Moon } from 'lucide-react'
import type { ThemeTokens } from '@/lib/theme/admin-types'

// The live preview panel. It applies the in-progress theme tokens as inline CSS custom
// properties on a wrapper and renders a few representative components (a card, a primary
// button, body + muted text, a badge) so the operator sees the look update as they pick
// colors. A light/dark toggle swaps the wrapper to tokens.dark.
//
// EXCEPTION TO THE NO-HEX RULE: the inline style here is the user's CHOSEN palette by
// design — that is the whole point of a live preview. The representative components below
// reference the SAME semantic tokens the real app uses (bg-[var(--color-surface)] etc.),
// so they re-skin to whatever the operator typed. Feel tokens (radius/motion) flow in too,
// so corners and timing preview as well. A blank token simply isn't included, so it inherits
// the baseline — exactly what the live site does.

/** Build the inline custom-property object for a mode. Feel tokens apply in BOTH modes (they
 *  aren't mode-specific). Empty strings are skipped so the base value shows through. */
function styleFor(mode: 'light' | 'dark', tokens: ThemeTokens): CSSProperties {
  const out: Record<string, string> = {}
  const base = mode === 'light' ? tokens.light : tokens.dark
  for (const [k, v] of Object.entries(base)) if (v) out[k] = v
  for (const [k, v] of Object.entries(tokens.feel)) if (v) out[k] = v
  return out as CSSProperties
}

export function ThemePreview({ tokens }: { tokens: ThemeTokens }) {
  const [mode, setMode] = useState<'light' | 'dark'>('light')
  const style = useMemo(() => styleFor(mode, tokens), [mode, tokens])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Live preview</p>
        <div
          className="inline-flex rounded-lg border border-border bg-surface p-0.5"
          role="group"
          aria-label="Preview mode"
        >
          <button
            type="button"
            aria-pressed={mode === 'light'}
            onClick={() => setMode('light')}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              mode === 'light' ? 'bg-primary text-on-primary' : 'text-muted hover:text-text'
            }`}
          >
            <Sun className="h-3.5 w-3.5" aria-hidden /> Light
          </button>
          <button
            type="button"
            aria-pressed={mode === 'dark'}
            onClick={() => setMode('dark')}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              mode === 'dark' ? 'bg-primary text-on-primary' : 'text-muted hover:text-text'
            }`}
          >
            <Moon className="h-3.5 w-3.5" aria-hidden /> Dark
          </button>
        </div>
      </div>

      {/* The skinned surface — every child reads the SAME semantic tokens the real app uses,
          re-pointed by the inline custom properties above to the operator's chosen values. */}
      <div
        style={style}
        className="space-y-4 rounded-2xl border p-5"
        // Map the preview chrome to the themed tokens (not the admin chrome's tokens):
        // canvas as the panel background, themed border + text.
      >
        <div
          style={{
            background: 'var(--color-canvas)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
            borderRadius: 'var(--radius-card)',
          }}
          className="space-y-4 border p-4"
        >
          {/* A card */}
          <div
            style={{
              background: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              borderRadius: 'var(--radius-card)',
              transitionDuration: 'var(--motion-base)',
            }}
            className="space-y-3 border p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <h4 style={{ color: 'var(--color-text)' }} className="text-base font-bold">
                A representative card
              </h4>
              {/* A badge — primary tint */}
              <span
                style={{
                  background: 'var(--color-primary-bg)',
                  color: 'var(--color-primary-strong)',
                  borderRadius: 'var(--radius-pill)',
                }}
                className="inline-flex items-center px-2 py-0.5 text-xs font-semibold"
              >
                Badge
              </span>
            </div>
            {/* Body + muted text */}
            <p style={{ color: 'var(--color-text-muted)' }} className="text-sm leading-relaxed">
              Body copy in the muted text color. The quick brown fox jumps over the lazy dog to
              show how reading text sits on this surface.
            </p>
            <p style={{ color: 'var(--color-text-subtle)' }} className="text-xs">
              A subtle caption line.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {/* A primary button */}
              <button
                type="button"
                style={{
                  background: 'var(--color-primary)',
                  color: 'var(--color-text-on-primary)',
                  borderRadius: 'var(--radius-control)',
                  transitionDuration: 'var(--motion-fast)',
                }}
                className="px-3.5 py-2 text-sm font-semibold"
              >
                Primary action
              </button>
              {/* A secondary (bordered) button */}
              <button
                type="button"
                style={{
                  background: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                  borderRadius: 'var(--radius-control)',
                }}
                className="border px-3.5 py-2 text-sm font-semibold"
              >
                Secondary
              </button>
            </div>
          </div>

          {/* State chips row */}
          <div className="flex flex-wrap gap-2">
            {[
              ['var(--color-success-bg)', 'var(--color-success)', 'Success'],
              ['var(--color-warning-bg)', 'var(--color-warning)', 'Warning'],
              ['var(--color-danger-bg)', 'var(--color-danger)', 'Danger'],
              ['var(--color-info-bg)', 'var(--color-info)', 'Info'],
            ].map(([bg, fg, label]) => (
              <span
                key={label}
                style={{ background: bg, color: fg, borderRadius: 'var(--radius-pill)' }}
                className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold"
              >
                {label}
              </span>
            ))}
          </div>

          {/* An ink (dark band) sample */}
          <div
            style={{
              background: 'var(--color-ink)',
              borderColor: 'var(--color-ink-border)',
              borderRadius: 'var(--radius-card)',
            }}
            className="space-y-1 border p-4"
          >
            <p style={{ color: 'var(--color-on-ink)' }} className="text-sm font-semibold">
              A dark band
            </p>
            <p style={{ color: 'var(--color-on-ink-muted)' }} className="text-xs">
              Text on ink, in the muted tone.
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-subtle">
        This previews the {mode} palette plus the shared feel. A token left blank inherits the
        base look, just like the live site.
      </p>
    </div>
  )
}
