'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { PROFILE_SKINS } from '@/lib/theme/profile-skins'
import { resolveProfileSkin } from '@/lib/theme/profile-skins'
import { updateProfileTheme } from '@/lib/profile/profile-theme-actions'

// Constrained theme picker for the Spotlight page: pick a look from the governed
// PROFILE_SKINS list (no raw colors/CSS). Each option previews its palette by
// applying its own [data-skin] to the swatch, so the choice is visible before saving.

export function ProfileThemePicker({ initialTheme }: { initialTheme: string | null }) {
  const [selected, setSelected] = useState(resolveProfileSkin(initialTheme))
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function pick(id: typeof selected) {
    if (id === selected) return
    const prev = selected
    setSelected(id)
    setError('')
    startTransition(async () => {
      try {
        await updateProfileTheme(id)
      } catch (err) {
        setSelected(prev)
        setError(err instanceof Error ? err.message : 'Could not change your theme.')
      }
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-text">Theme</p>
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-subtle" />}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PROFILE_SKINS.map((skin) => {
          const isActive = skin.id === selected
          return (
            <button
              key={skin.id}
              type="button"
              onClick={() => pick(skin.id)}
              disabled={isPending}
              aria-pressed={isActive}
              className={`relative overflow-hidden rounded-xl border text-left transition-colors disabled:opacity-60 ${
                isActive ? 'border-primary-strong ring-1 ring-primary-strong' : 'border-border hover:border-border-strong'
              }`}
            >
              {/* Palette preview, themed by the skin itself */}
              <div data-skin={skin.id} className="flex h-12 items-stretch bg-canvas">
                <div className="flex-1 bg-canvas" />
                <div className="flex-1 bg-surface-elevated" />
                <div className="flex-1 bg-primary" />
              </div>
              <div className="flex items-center justify-between gap-1 px-2.5 py-1.5">
                <span className="text-xs font-medium text-text">{skin.label}</span>
                {isActive && <Check className="h-3.5 w-3.5 text-primary-strong" />}
              </div>
            </button>
          )
        })}
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  )
}
