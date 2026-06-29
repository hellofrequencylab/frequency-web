'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { Check, ChevronUp, ChevronDown, Eye, EyeOff } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { getPageLayoutForEditor, savePageLayout, type LayoutEditorItem } from '@/lib/page-settings/actions'
import { MODULE_ROLES, type ModuleRole } from '@/lib/page-settings/layout'
import { TEMPLATES, templateMeta, slotIds, defaultSlotId, type TemplateId } from '@/lib/widgets/templates'

// The live Layout editor for the on-page "Page" settings panel (ADR-270/271/272). Staff pick the
// interior TEMPLATE, assign each module to one of its AREAS (slots), set order + visibility + a
// per-module role gate — at one of three SCOPES: this page (the exact route), this section
// ('/seg/*'), or all pages ('*'), most-specific wins. Render order = the saved order within each
// slot; a disabled module is hidden; a gated module shows only to its rung and up.

const ROLE_LABEL: Record<ModuleRole, string> = {
  host: 'Hosts and up',
  guide: 'Guides and up',
  mentor: 'Mentors and up',
}

type ScopeChoice = 'page' | 'section' | 'global'

// A tiny vector mock of a template's shape — blocks laid out the way the real page is, so an
// operator picks a LAYOUT by clicking its picture, not by reading a name. The proportions match the
// renderer (components/widgets/page-modules.tsx): main + side is the 3:2 split, etc. `active` tints
// the blocks with the brand colour so the chosen layout reads at a glance.
function TemplateThumbnail({ id, active }: { id: TemplateId; active: boolean }) {
  const box = `rounded-[2px] ${active ? 'bg-primary/70' : 'bg-border-strong'}`
  const row = 'flex flex-1 gap-0.5'
  const frame = 'flex h-9 w-14'
  switch (id) {
    case 'main-side':
      return (
        <div className={`${frame} gap-0.5`}>
          <div className={`${box} basis-3/5`} />
          <div className={`${box} basis-2/5`} />
        </div>
      )
    case 'two-col':
      return (
        <div className={`${frame} flex-col gap-0.5`}>
          <div className={`${box} h-2`} />
          <div className={row}>
            <div className={`${box} flex-1`} />
            <div className={`${box} flex-1`} />
          </div>
        </div>
      )
    case 'three-col':
      return (
        <div className={`${frame} flex-col gap-0.5`}>
          <div className={`${box} h-2`} />
          <div className={row}>
            <div className={`${box} flex-1`} />
            <div className={`${box} flex-1`} />
            <div className={`${box} flex-1`} />
          </div>
        </div>
      )
    case 'header-side':
      return (
        <div className={`${frame} flex-col gap-0.5`}>
          <div className={`${box} h-2`} />
          <div className={row}>
            <div className={`${box} basis-3/5`} />
            <div className={`${box} basis-2/5`} />
          </div>
        </div>
      )
    case 'header-two-col':
      return (
        <div className={`${frame} flex-col gap-0.5`}>
          <div className={`${box} h-2`} />
          <div className={row}>
            <div className={`${box} flex-1`} />
            <div className={`${box} flex-1`} />
          </div>
        </div>
      )
    case 'single':
    default:
      return (
        <div className={`${frame} gap-0.5`}>
          <div className={`${box} flex-1`} />
        </div>
      )
  }
}

export function LayoutEditor({ spaceId }: { spaceId?: string }) {
  const pathname = usePathname()
  const [choice, setChoice] = useState<ScopeChoice>('page')
  const [template, setTemplate] = useState<TemplateId>('single')
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
    getPageLayoutForEditor(scopeKey, spaceId)
      .then((d) => {
        if (!live) return
        setTemplate(d.template)
        setItems(d.items)
        setLoading(false)
      })
      .catch(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [scopeKey, spaceId])

  function chooseScope(c: ScopeChoice) {
    if (c === choice) return
    setSaved(false)
    setError(null)
    setLoading(true)
    setChoice(c)
  }

  function chooseTemplate(t: TemplateId) {
    if (t === template) return
    setSaved(false)
    setTemplate(t)
    // Keep every module + its on/off + role; move any now-orphaned slot to the new default.
    const valid = new Set(slotIds(t))
    const def = defaultSlotId(t)
    setItems((prev) => prev.map((it) => (valid.has(it.slot) ? it : { ...it, slot: def })))
  }

  function toggle(id: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, enabled: !it.enabled } : it)))
  }

  function setRole(id: string, role: ModuleRole | null) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, role } : it)))
  }

  function setSlot(id: string, slot: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, slot } : it)))
  }

  // Swap a module with its nearest neighbour IN THE SAME SLOT (the flat item order is what each
  // slot's order is derived from on save).
  function move(id: string, dir: -1 | 1) {
    setItems((prev) => {
      const i = prev.findIndex((it) => it.id === id)
      if (i < 0) return prev
      const slot = prev[i].slot
      let j = i + dir
      while (j >= 0 && j < prev.length && prev[j].slot !== slot) j += dir
      if (j < 0 || j >= prev.length) return prev
      const copy = [...prev]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })
  }

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const r = await savePageLayout(scopeKey, {
        template,
        items: items.map(({ id, enabled, role, slot }) => ({ id, enabled, role, slot })),
      }, spaceId)
      if (isError(r)) setError(r.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  const slots = templateMeta(template).slots
  const multiSlot = slots.length > 1

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
        <div className="h-56 animate-pulse rounded-xl border border-border bg-surface-elevated/50" />
      ) : (
        <>
          {/* Template: pick the interior shape by clicking its mock-up (not a name). Each tile
              draws the layout's actual block arrangement; the chosen one is ringed + tinted. */}
          <div>
            <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-subtle">Template</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {TEMPLATES.map((t) => {
                const isActive = t.id === template
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => chooseTemplate(t.id)}
                    disabled={pending}
                    aria-pressed={isActive}
                    title={t.description}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors disabled:opacity-40 ${
                      isActive
                        ? 'border-primary bg-primary-bg/40 ring-1 ring-primary'
                        : 'border-border bg-surface-elevated/40 hover:border-border-strong'
                    }`}
                  >
                    <span className="flex h-9 w-14 items-center justify-center">
                      <TemplateThumbnail id={t.id} active={isActive} />
                    </span>
                    <span className={`text-center text-3xs font-semibold leading-tight ${isActive ? 'text-primary-strong' : 'text-muted'}`}>
                      {t.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Modules, grouped by the current template's slots. */}
          <div className="space-y-3">
            {slots.map((s) => {
              const group = items.filter((it) => it.slot === s.id)
              return (
                <div key={s.id} className="space-y-2">
                  {multiSlot && (
                    <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">{s.label}</p>
                  )}
                  {group.length === 0 ? (
                    <p className="text-xs text-muted">Nothing here yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {group.map((item, index) => (
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
                                onClick={() => move(item.id, -1)}
                                disabled={pending || index === 0}
                                aria-label={`Move ${item.label} up`}
                                className="rounded-lg p-1.5 text-muted transition-colors hover:text-text disabled:opacity-30"
                              >
                                <ChevronUp className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => move(item.id, 1)}
                                disabled={pending || index === group.length - 1}
                                aria-label={`Move ${item.label} down`}
                                className="rounded-lg p-1.5 text-muted transition-colors hover:text-text disabled:opacity-30"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-9">
                            {multiSlot && (
                              <label className="flex items-center gap-2">
                                <span className="text-2xs font-medium uppercase tracking-wide text-subtle">Area</span>
                                <select
                                  value={item.slot}
                                  onChange={(e) => setSlot(item.id, e.target.value)}
                                  disabled={pending}
                                  aria-label={`Area for ${item.label}`}
                                  className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text disabled:opacity-40"
                                >
                                  {slots.map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                            <label className="flex min-w-0 flex-1 items-center gap-2">
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
                            </label>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </>
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
