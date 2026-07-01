'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, Plus, Trash2, Pencil, Bookmark } from 'lucide-react'
import {
  type SpotlightTheme,
  buildGradientCss,
} from '@/lib/spotlight/theme'
import type { SpotlightBackground } from '@/lib/spotlight/blocks/schema'
import type { SpotlightThemeSlot } from '@/lib/profile/spotlight-flags'
import { MAX_SPOTLIGHT_THEMES } from '@/lib/profile/spotlight-flags'
import {
  saveSpotlightThemeSlot,
  applySpotlightThemeSlot,
  renameSpotlightThemeSlot,
  deleteSpotlightThemeSlot,
} from '@/app/(main)/settings/profile/spotlight-actions'

// "MY THEMES" — a member keeps up to three of their own looks and switches between them. Shown in
// BOTH the desktop Theme drawer and the mobile Theme dock tab (via ThemePanelContent), so the two
// surfaces never drift. Each slot bundles a full theme + background; "Apply" restores the whole look
// into the live editor state and persists it. Copy stays plain (CONTENT-VOICE); tokens only, no hex.

// A tiny swatch built from the slot's theme: the background (gradient/solid/canvas) with an accent
// dot and a surface chip, so a member recognises the look at a glance. All from validated theme values.
function SlotSwatch({ theme }: { theme: SpotlightTheme }) {
  const bg =
    theme.bg.kind === 'gradient'
      ? buildGradientCss(theme.bg.gradient)
      : theme.bg.kind === 'solid'
        ? theme.bg.color
        : 'var(--color-surface-elevated)'
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-strong"
      style={{ background: bg }}
      aria-hidden
    >
      <span
        className="h-4 w-4 rounded-full border border-white/40"
        style={{ background: theme.accent ?? 'var(--color-primary)' }}
      />
    </span>
  )
}

export function SpotlightThemeSlots({
  initialSlots,
  currentTheme,
  currentBackground,
  onApply,
}: {
  initialSlots: SpotlightThemeSlot[]
  /** The live editor theme — what "Save current as a theme" captures. */
  currentTheme: SpotlightTheme
  /** The live background — captured alongside the theme. */
  currentBackground: SpotlightBackground
  /** Push an applied slot's theme (+ background) back into the live editor state. */
  onApply: (theme: SpotlightTheme, background: SpotlightBackground) => void
}) {
  const [slots, setSlots] = useState<SpotlightThemeSlot[]>(initialSlots)
  const [error, setError] = useState('')
  const [naming, setNaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const full = slots.length >= MAX_SPOTLIGHT_THEMES

  function saveCurrent() {
    const name = newName.trim()
    setError('')
    start(async () => {
      const res = await saveSpotlightThemeSlot(name, currentTheme, currentBackground)
      if (res.error || !res.id) {
        setError(res.error ?? 'Could not save that theme.')
        return
      }
      setSlots((prev) => [
        ...prev,
        { id: res.id!, name: name || 'My theme', theme: currentTheme, background: currentBackground },
      ])
      setNaming(false)
      setNewName('')
    })
  }

  function apply(slot: SpotlightThemeSlot) {
    setError('')
    setBusyId(slot.id)
    start(async () => {
      const res = await applySpotlightThemeSlot(slot.id)
      setBusyId(null)
      if (res.error) {
        setError(res.error)
        return
      }
      onApply(slot.theme, slot.background)
    })
  }

  function commitRename(id: string) {
    const name = renameValue.trim()
    setError('')
    start(async () => {
      const res = await renameSpotlightThemeSlot(id, name)
      if (res.error) {
        setError(res.error)
        return
      }
      setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, name: name || 'My theme' } : s)))
      setRenaming(null)
      setRenameValue('')
    })
  }

  function remove(id: string) {
    setError('')
    setBusyId(id)
    start(async () => {
      const res = await deleteSpotlightThemeSlot(id)
      setBusyId(null)
      if (res.error) {
        setError(res.error)
        return
      }
      setSlots((prev) => prev.filter((s) => s.id !== id))
    })
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-text">
        <Bookmark className="h-4 w-4 text-primary-strong" aria-hidden /> My themes
      </p>
      <p className="mb-3 text-xs text-subtle">Save a look you like and switch back to it anytime. Up to {MAX_SPOTLIGHT_THEMES}.</p>

      {slots.length > 0 && (
        <ul className="space-y-1.5">
          {slots.map((slot) => (
            <li key={slot.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-2 py-1.5">
              <SlotSwatch theme={slot.theme} />
              {renaming === slot.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(slot.id)
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                  onBlur={() => commitRename(slot.id)}
                  maxLength={40}
                  className="min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-2 py-1 text-sm text-text focus:outline-none"
                  aria-label="Theme name"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{slot.name}</span>
              )}

              <button
                type="button"
                onClick={() => apply(slot)}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-40"
              >
                {busyId === slot.id && pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Apply
              </button>
              <button
                type="button"
                onClick={() => { setRenaming(slot.id); setRenameValue(slot.name) }}
                disabled={pending}
                aria-label={`Rename ${slot.name}`}
                className="rounded-md p-1 text-subtle hover:text-text disabled:opacity-30"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remove(slot.id)}
                disabled={pending}
                aria-label={`Delete ${slot.name}`}
                className="rounded-md p-1 text-subtle hover:text-danger disabled:opacity-30"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {naming ? (
        <div className="mt-3 flex items-center gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveCurrent()
              if (e.key === 'Escape') { setNaming(false); setNewName('') }
            }}
            placeholder="Name this theme"
            maxLength={40}
            className="min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:outline-none"
            aria-label="Theme name"
          />
          <button
            type="button"
            onClick={saveCurrent}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save
          </button>
          <button
            type="button"
            onClick={() => { setNaming(false); setNewName('') }}
            className="rounded-lg px-2 py-2 text-sm font-medium text-subtle hover:text-text"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setNaming(true)}
            disabled={full || pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden /> Save current as a theme
          </button>
          {full && (
            <p className="mt-1.5 text-xs text-muted">
              That is your {MAX_SPOTLIGHT_THEMES}. Delete one to save another.
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  )
}
