import Link from 'next/link'

export type FriendsMode = 'people' | 'contacts'

const TABS: { key: FriendsMode; label: string }[] = [
  { key: 'people', label: 'People' },
  { key: 'contacts', label: 'Contacts' },
]

/** People · Contacts mode switch — the same underlined-tab grammar the rest of the
 *  app uses. A plain link toggle (?mode=…) so the page stays a Server Component. */
export function ModeSwitch({ mode, counts }: { mode: FriendsMode; counts?: Partial<Record<FriendsMode, number>> }) {
  return (
    <div className="flex gap-1 border-b border-border">
      {TABS.map((t) => {
        const active = mode === t.key
        const count = counts?.[t.key]
        return (
          <Link
            key={t.key}
            href={t.key === 'people' ? '/friends' : '/friends?mode=contacts'}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active ? 'border-primary text-primary-strong' : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {t.label}
            {count != null && <span className="ml-1.5 text-subtle">{count}</span>}
          </Link>
        )
      })}
    </div>
  )
}
