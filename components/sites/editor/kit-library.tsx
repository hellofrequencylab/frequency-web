'use client'

import { useState } from 'react'
import { DESIGNER_PROFILE_KIT_INDEX, KIT_INDEX, NETWORK_KIT_PROFILE_KIT_INDEX, TEMPLE_KIT_PROFILE_KIT_INDEX } from '@/lib/sites/kits/registry'
import type { KitChanges } from '@/lib/sites/kits/apply'
import type { KitApplyMode, KitNiche, SiteKit } from '@/lib/sites/kits/types'
import { k } from './skin'

const MODES: { mode: KitApplyMode; label: string; help: string }[] = [
  { mode: 'add', label: 'Add its pages', help: 'Keeps every page you have and adds the kit’s pages next to them.' },
  { mode: 'replace', label: 'Replace my pages', help: 'Swaps all your pages for the kit’s. You can undo this.' },
  { mode: 'theme', label: 'Look only', help: 'Takes the kit’s theme and leaves your pages alone.' },
]

/** The Theme tab's starter kits. A kit is a starting point written into the draft once: it is one undo step,
 *  its words are placeholders, and nothing reaches the live site until the owner publishes. */
export function KitLibrary({ onApply, onPreview, suggestedNiche, theme }: { theme?: SiteKit['theme']; onApply: (id: string, mode: KitApplyMode) => Promise<string>; onPreview?: (id: string) => Promise<KitChanges | string>; suggestedNiche?: KitNiche | null }) {
  const [open, setOpen] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [changes, setChanges] = useState<KitChanges | string | null>(null)

  async function look(id: string) { setChanges(onPreview ? await onPreview(id) : null) }
  const list = (pages: string[] | string) => typeof pages === 'string' ? pages : pages.join(', ')

  async function run(id: string, mode: KitApplyMode) {
    if (mode === 'replace' && !confirm) { setConfirm(true); return }
    setBusy(true)
    setMessage(await onApply(id, mode))
    setBusy(false); setConfirm(false); setOpen(null); setChanges(null)
  }

  // The earlier Temple's kits (Royal Temple's) are offered nowhere, so they never list; the Temple Theme Kit lists its thirteen.
  // The kit for the door this Space came in through (its saved niche) leads the list; the rest keep their order.
  const kits = (theme === 'Designer' ? [...KIT_INDEX, ...DESIGNER_PROFILE_KIT_INDEX] : theme === 'NetworkKit' ? NETWORK_KIT_PROFILE_KIT_INDEX : theme === 'TempleKit' ? TEMPLE_KIT_PROFILE_KIT_INDEX : KIT_INDEX).filter((kit) => (!theme || kit.theme === theme) && kit.theme !== 'Temple').sort((a, b) => Number(b.niche === suggestedNiche) - Number(a.niche === suggestedNiche))

  if (!kits.length) return null
  return <>
    <div className={k('we-caption')}>Starter kits</div>
    <p className={k('we-note')}>A kit gives you pages with sample words to rewrite. Nothing goes live until you publish, and undo takes it back.</p>
    {kits.map((kit) => <div key={kit.id}>
      <button type="button" className={k('we-row')} aria-expanded={open === kit.id} onClick={() => { setOpen(open === kit.id ? null : kit.id); setConfirm(false); setChanges(null) }}><span>{kit.label}{kit.niche === suggestedNiche && <em> · Suggested for your Space</em>}<small>{kit.description}</small></span></button>
      {open === kit.id && onPreview && <button type="button" className={k('we-action secondary')} onClick={() => void look(kit.id)}>See what changes</button>}
      {open === kit.id && changes && (typeof changes === 'string' ? <p className={k('we-note')}>{changes}</p> : <div className={k('we-note')}>
        <p><strong>Now:</strong> {list(changes.now)}</p>
        <p><strong>Add its pages:</strong> {list(changes.add)}</p>
        <p><strong>Replace my pages:</strong> {list(changes.replace)}</p>
        <p><strong>Theme:</strong> {changes.theme}. Look only keeps your pages and takes this theme.</p>
      </div>)}
      {open === kit.id && <div className={k('we-actions')}>
        {MODES.map(({ mode, label, help }) => <button type="button" key={mode} className={k('we-action secondary')} disabled={busy} title={help} onClick={() => void run(kit.id, mode)}>{mode === 'replace' && confirm ? 'Yes, replace my pages' : label}</button>)}
      </div>}
    </div>)}
    {message && <p role="status" className={k('we-note')}>{message}</p>}
  </>
}
