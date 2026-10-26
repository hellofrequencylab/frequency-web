import type { SlotGroupModel } from '@/lib/sites/editor/slot-panel'
import { k } from './skin'

/** The editor's Shared content panel: the Space facts this page's sections draw on, what is saved for each, and
 *  where to change it. It saves nothing itself; each fact is edited by the form that already owns it. */
export function SlotsPanel({ groups, origin }: { groups: SlotGroupModel[]; origin: string }) {
  return <>
    <p className={k('we-note')}>These facts are saved once on your Space and shared with your website, your Space page and your Spotlight. Sample words show until you fill one in.</p>
    {groups.map((group) => <div key={group.label}>
      <div className={k('we-caption')}>{group.label}</div>
      {group.rows.map((row) => <a key={row.key} className={k('we-row')} href={`${origin}${row.href}`} target="_blank" rel="noreferrer">
        <span>{row.label}<small>{row.saved ? row.saved : row.uses > 0 ? 'Sample words showing. Add yours.' : 'Not filled in yet'}</small></span>
        <small>{row.uses > 0 ? `${row.uses} on this page` : ''}</small>
      </a>)}
    </div>)}
  </>
}
