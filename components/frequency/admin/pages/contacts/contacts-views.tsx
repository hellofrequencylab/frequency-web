'use client'

import { useState, type ReactNode } from 'react'

// The Contacts page's two views. Workspace (the default) is the master-detail roster: every person on the
// left, the selected person's card, stats, timeline, notes and messaging on the right. Table is the design's
// flat list with visits and status. Both are server-rendered; this island only chooses which one shows, so a
// switch costs no request.

type View = 'workspace' | 'table'

export function ContactsViews({ workspace, table }: { workspace: ReactNode; table: ReactNode }) {
  const [view, setView] = useState<View>('workspace')
  return (
    <>
      <div className="chips adp-views" role="group" aria-label="Contacts view">
        {(
          [
            ['workspace', 'Workspace'],
            ['table', 'Table'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={view === key ? 'chip on' : 'chip'}
            aria-pressed={view === key}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div hidden={view !== 'workspace'} className="adp-workspace">
        {workspace}
      </div>
      <div hidden={view !== 'table'}>{table}</div>
    </>
  )
}
