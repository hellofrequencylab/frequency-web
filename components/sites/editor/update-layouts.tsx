'use client'

import { upgradeDocument } from '@/lib/blocks/roles/legacy-map'
import { ROLES } from '@/lib/blocks/roles/roles'

type Doc = Parameters<typeof upgradeDocument>[0]

/** UPDATE TO NEW LAYOUTS (LIVE-1860): the owner's way from theme-named blocks to role blocks, one page at a time.
 *  It shows what would change and what stays, and nothing moves until Update is pressed. The caller commits the
 *  result as one undo step. */
export function UpdateLayouts<D extends object>({ doc, pageLabel, onApply, onClose }: { doc: D; pageLabel: string; onApply: (next: D) => void; onClose: () => void }) {
  const { doc: next, changes, kept } = upgradeDocument(doc as Doc)
  return (
    <div className="we-update-layouts">
      <p className="we-note">{changes.length ? `${changes.length} section${changes.length === 1 ? '' : 's'} on ${pageLabel} can move to the new layouts. Your words, buttons and pictures come with them. You can undo it.` : `Nothing on ${pageLabel} needs updating.`}</p>
      {changes.map((c) => <div className="we-row" key={c.id}><strong>{c.from}</strong><small>becomes {ROLES[c.role].label.replace(' (all themes)', '')}</small></div>)}
      {kept.length > 0 && <><div className="we-caption">Staying as they are</div>{kept.map((k) => <div className="we-row" key={k.id}><span>{k.type}</span><small>stays as is, its lists do not fit yet</small></div>)}</>}
      <div className="we-actions">
        <button type="button" className="we-action" disabled={!changes.length} onClick={() => onApply(next as D)}>Update this page</button>
        <button type="button" className="we-action secondary" onClick={onClose}>Not now</button>
      </div>
    </div>
  )
}
