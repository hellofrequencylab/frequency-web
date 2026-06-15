'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { Check, ChevronUp, ChevronDown, Eye, EyeOff } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { getPageLayoutForEditor, savePageLayout, type LayoutEditorItem } from '@/lib/page-settings/actions'
import { MODULE_ROLES, type ModuleRole } from '@/lib/page-settings/layout'

// The live Layout editor for the on-page "Page" settings panel (ADR-270/271). Staff choose
// which modules show, in what order, and who may see each (per-module role gate) — at one of
// three SCOPES: this page (the exact route), this section ('/seg/*'), or all pages ('*'),
// most-specific wins. The saved item order IS the rendered order; a disabled item is hidden.

const ROLE_LABEL: Record<ModuleRole, string> = {
  host: 'Hosts and up',
  guide: 'Guides and up',
  mentor: 'Mentors and up',
}

type ScopeChoice = 'page' | 'section' | 'global'

export function LayoutEditor() {
  const pathname = usePathname()
  const [choice, setChoice] = useState<ScopeChoice>('page')
  const [items, setItems] = useState<LayoutEditorItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // The scopes a staffer can edit from this page, and the key each writes to.
  const scopes = useMemo(() => {
    const seg = pathname.split('/').filter(Boolean)[0]
    const list: { choice: ScopeChoice; label: string; key: string; hint: string }[] = [
      { choice: 'page', label: 'This page', key: pathname, hint: 'Applies to this exact page.' },
    ]
    if (seg) {
      list.push({
        choice: 'section',
        label: 'This section',
        key: `/${seg}/*`,
        hint: `The default for every page under /${seg}. A page's own layout overrides it.`,
      })
    }
    list.push({ choice: 'global', label: 'All pages', key: '*', hint: 'The default everywhere. A section or page layout overrides it.' })
    return list
  }, [pathname])

  const active = scopes.find((s) => s.choice === choice) ?? scopes[0]
  const scopeKey = active.key

  useEffect(() => {
    let live = true
    getPageLayoutForEditor(scopeKey)
      .then((d) => {
        if (!live) return
        setItems(d)
        setLoading(false)
      })
      .catch(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [scopeKey])

  function chooseScope(c: ScopeChoice) {
    if (c === choice) return
    setSaved(false)
    setError(null)
    setLoading(true)
    setChoice(c)
  }

  function toggle(id: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, enabled: !it.enabled } : it)))
  }

  function setRole(id: string, role: ModuleRole | null) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, role } : it)))
  }

  function move(index: number, delta: number) {
    setItems((prev) => {
      const next = index + delta
      if (next < 0 || next >= prev.length) return prev
      const copy = [...prev]
      const [item] = copy.splice(index, 1)
      copy.splice(next, 0, item)
      return copy
    })
  }

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const r = await savePageLayout(scopeKey, items.map(({ id, enabled, role }) => ({ id, enabled, role })))
      if (isError(r)) setError(r.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      {/* Scope: which routes this layout applies to (most-specific wins). */}
      <div className="flex flex-wrap items-center gap-1.5">
        {scopes.map((s) => (
          <button
            key={s.choice}
            type="button"
            onClick={() => chooseScope(s.choice)}
            disabled={pending}
            aria-pressed={s.choice === choice}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
              s.choice === choice ? 'bg-primary text-on-primary' : 'border border-border text-muted hover:text-text'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="text-2xs text-muted">{active.hint}</p>

      {loading ? (
        <div className="h-44 animate-pulse rounded-xl border border-border bg-surface-elevated/50" />
      ) : items.length === 0 ? (
        <p className="text-xs text-muted">No modules available for this page yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="space-y-2 rounded-lg border border-border bg-surface-elevated/50 p-3"
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  disabled={pending}
                  aria-label={item.enabled ? `Hide ${item.label}` : `Show ${item.label}`}
                  aria-pressed={item.enabled}
                  className={`shrink-0 rounded-lg p-1.5 transition-colors disabled:opacity-40 ${
                    item.enabled ? 'text-primary-strong hover:text-primary-hover' : 'text-subtle hover:text-text'
                  }`}
                >
                  {item.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-semibold ${item.enabled ? 'text-text' : 'text-muted'}`}>
                    {item.label}
                  </p>
                  {item.description && <p className="truncate text-xs text-muted">{item.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={pending || index === 0}
                    aria-label={`Move ${item.label} up`}
                    className="rounded-lg p-1.5 text-muted transition-colors hover:text-text disabled:opacity-30"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={pending || index === items.length - 1}
                    aria-label={`Move ${item.label} down`}
                    className="rounded-lg p-1.5 text-muted transition-colors hover:text-text disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 pl-9">
                <span className="shrink-0 text-2xs font-medium uppercase tracking-wide text-subtle">Who sees it</span>
                <select
                  value={item.role ?? ''}
                  onChange={(e) => setRole(item.id, (e.target.value || null) as ModuleRole | null)}
                  disabled={pending}
                  aria-label={`Who can see ${item.label}`}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text disabled:opacity-40"
                >
                  <option value="">Everyone</option>
                  {MODULE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center justify-end gap-2 pt-1">
        {saved && (
          <span className="flex items-center gap-1 text-xs font-medium text-primary-strong">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={pending || loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
