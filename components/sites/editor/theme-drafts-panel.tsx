'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { FQ_EDITOR, k } from './skin'
import { SITE_THEMES } from '@/lib/theme/site-style'
import { MAX_THEME_DRAFTS, type WebsiteTheme, type WebsiteThemeDraft } from '@/lib/sites/editor/state'
import { THEME_DRAFT_NAME } from '@/lib/sites/editor/theme-drafts'

/** THEME DRAFTS (the Theme tab's top section): the owner's saved ways the same website could look. Picking one shows
 *  it on the canvas; only Publish makes it the live site. Pure view: the shell owns the draft and its undo. */
export function ThemeDraftsPanel({ drafts, activeId, liveId, editorTheme, error, onSwitch, onAdd, onRename, onRemove }: {
  drafts: WebsiteThemeDraft[]
  activeId: string
  liveId: string | null
  editorTheme: (id: (typeof SITE_THEMES)[number]['id']) => WebsiteTheme
  error: string
  onSwitch: (id: string) => void
  onAdd: (theme: WebsiteTheme, label: string, from?: string) => void
  onRename: (id: string, label: string) => void
  onRemove: (id: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [theme, setTheme] = useState<WebsiteTheme>('Midnight')
  const [label, setLabel] = useState('')
  const [fromActive, setFromActive] = useState(true)
  const active = drafts.find((d) => d.id === activeId) ?? drafts[0]
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const full = drafts.length >= MAX_THEME_DRAFTS
  const inputClass = FQ_EDITOR ? 'in' : undefined
  return <>
    <div className={k('we-caption')}>Theme drafts</div>
    <p className={k('we-note')}>Try more than one look on the same website. Your words, photos and menu are shared. Switching a draft changes only the preview. Visitors see a draft when you publish it.</p>
    {drafts.map((d) => <button type="button" key={d.id} className={k('we-row')} aria-pressed={d.id === activeId} onClick={() => d.id !== activeId && onSwitch(d.id)}>
      <span>{d.label}{d.id === activeId ? ' · Editing' : ''}{d.id === liveId ? ' · Live' : ''}<small>{THEME_DRAFT_NAME[d.theme]} theme</small></span>
    </button>)}
    {renaming
      ? <label className={k('we-field')}>{FQ_EDITOR ? <span className="l">Draft name</span> : 'Draft name'}<Input variant="seamless" className={inputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <span className={k('we-actions')}><button type="button" className={k('we-action secondary')} onClick={() => { onRename(active.id, name); setRenaming(false) }}>Save name</button><button type="button" className={k('we-action secondary')} onClick={() => setRenaming(false)}>Cancel</button></span></label>
      : <div className={k('we-actions')}>
        <button type="button" className={k('we-action secondary')} onClick={() => { setName(active.label); setRenaming(true) }}>Rename draft</button>
        <button type="button" className={k('we-action secondary')} disabled={drafts.length < 2 || active.id === liveId} onClick={() => onRemove(active.id)}>Remove draft</button>
        <button type="button" className={k('we-action secondary')} disabled={full} onClick={() => setAdding((v) => !v)}>New draft</button>
      </div>}
    {adding && <div className={k('we-field')}>
      <label className={k('we-field')}>{FQ_EDITOR ? <span className="l">Theme</span> : 'Theme'}
        <Select value={theme} onChange={(e) => setTheme(e.target.value as WebsiteTheme)}>{SITE_THEMES.map((t) => { const id = editorTheme(t.id); return <option key={t.id} value={id}>{THEME_DRAFT_NAME[id]}</option> })}</Select>
      </label>
      <label className={k('we-field')}>{FQ_EDITOR ? <span className="l">Name</span> : 'Name'}<Input variant="seamless" className={inputClass} value={label} maxLength={60} placeholder={THEME_DRAFT_NAME[theme]} onChange={(e) => setLabel(e.target.value)} /></label>
      {active.theme === theme && <label className={k('we-note')}><input type="checkbox" checked={fromActive} onChange={(e) => setFromActive(e.target.checked)} /> Start from {active.label}&rsquo;s accent and styles</label>}
      <div className={k('we-actions')}><button type="button" className={k('we-action secondary')} onClick={() => { onAdd(theme, label, fromActive ? active.id : undefined); setAdding(false); setLabel('') }}>Add draft</button></div>
    </div>}
    {error && <p role="alert" className={k('we-note')}>{error}</p>}
  </>
}
