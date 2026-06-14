'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import {
  GENERATIONS,
  type GenerationId,
} from '@/lib/theme/generations'
import {
  THEME_COOKIE,
  THEME_COOKIE_ATTRS,
  parseThemeCookie,
  serializeThemeCookie,
} from '@/lib/theme/cookie'
import { useResolvedTheme } from './theme-provider'

// The member-facing STYLE preset picker. Lets a member pick how Frequency feels
// (the [data-generation] axis): roomy and calm through to lively and compact. This is
// framed honestly as a personal comfort/style choice, not an age assumption — the kids
// age bands live in a separate, guardian-provisioned subsection (preview only; the real
// auth/age gating is a separate safeguarding workstream, not built here).
//
// Persistence: we merge the chosen generation into the existing `fxtheme` cookie (so the
// member's skin/occasion picks survive) and let the server resolver re-apply it on reload.
// We ALSO set [data-generation] on <html> immediately so the change is instant, wrapped in
// a View Transition when the browser supports it and motion isn't reduced.

const ADULT_PRESETS = GENERATIONS.filter((g) => g.group === 'adult').sort(
  (a, b) => a.order - b.order,
)
const KIDS_PRESETS = GENERATIONS.filter((g) => g.group === 'kids').sort(
  (a, b) => a.order - b.order,
)

/** Merge the chosen generation into the `fxtheme` cookie and apply it to <html> now. */
function applyGeneration(id: GenerationId) {
  // Merge into (not overwrite) the existing cookie so skin/occasion picks survive.
  const raw = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${THEME_COOKIE}=`))
    ?.split('=')
    .slice(1)
    .join('=')
  const current = parseThemeCookie(raw ? decodeURIComponent(raw) : undefined)
  const serialized = serializeThemeCookie({ ...current, gen: id })
  document.cookie = `${THEME_COOKIE}=${encodeURIComponent(serialized)}; ${THEME_COOKIE_ATTRS}`

  const set = () => document.documentElement.setAttribute('data-generation', id)
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (typeof document.startViewTransition === 'function' && !reduceMotion) {
    document.startViewTransition(set)
  } else {
    set()
  }
}

export function ThemeSwitcher() {
  const { generation } = useResolvedTheme()
  const [selected, setSelected] = useState<GenerationId>(generation)

  function choose(id: GenerationId) {
    setSelected(id)
    applyGeneration(id)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Pick the look that feels best to you. This changes the feel, never the content.
      </p>

      {/* Adult spectrum — the primary, self-serve style choice. */}
      <div
        role="radiogroup"
        aria-label="Style"
        className="rounded-2xl border border-border bg-surface shadow-sm divide-y divide-border/80 dark:divide-border/50 overflow-hidden"
      >
        {ADULT_PRESETS.map((preset) => {
          const active = selected === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(preset.id)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                active
                  ? 'bg-primary-bg/60 dark:bg-primary-bg/40'
                  : 'hover:bg-surface-elevated'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${
                    active ? 'text-primary-strong' : 'text-text'
                  }`}
                >
                  {preset.label}
                </p>
                <p className="text-xs text-muted mt-0.5">{preset.vibe}</p>
              </div>
              {active && <Check className="w-4 h-4 text-primary-strong shrink-0" />}
            </button>
          )
        })}
      </div>

      {/* Kids age bands — guardian-provisioned, preview only. */}
      <div className="space-y-2 pt-2">
        <div>
          <p className="text-sm font-medium text-text">
            Younger members (guardian-managed)
          </p>
          <p className="text-xs text-muted mt-0.5">
            A parent or guardian sets these up. They are a preview for now, while the
            safeguarding controls are being built.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Younger members style preview"
          className="rounded-2xl border border-border bg-surface-elevated/60 shadow-sm divide-y divide-border/80 dark:divide-border/50 overflow-hidden"
        >
          {KIDS_PRESETS.map((preset) => {
            const active = selected === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => choose(preset.id)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                  active
                    ? 'bg-primary-bg/60 dark:bg-primary-bg/40'
                    : 'hover:bg-surface-elevated'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      active ? 'text-primary-strong' : 'text-text'
                    }`}
                  >
                    {preset.label}
                  </p>
                  <p className="text-xs text-muted mt-0.5">{preset.vibe}</p>
                </div>
                {active && <Check className="w-4 h-4 text-primary-strong shrink-0" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
