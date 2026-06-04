import Link from 'next/link'

const TABS = [
  { key: 'activity', label: 'Activity' },
  { key: 'posts', label: 'Posts' },
] as const

export type ProfileTab = (typeof TABS)[number]['key']

// Tab switch for the profile activity area: "Activity" (the merged stream) and
// "Posts" (just this member's authored history). Uses a ?tab= searchParam so
// the page stays server-rendered — each tab is a plain link, no client island.
export function ProfileTabs({
  handle,
  active,
}: {
  handle: string
  active: ProfileTab
}) {
  return (
    <div className="mb-4 flex w-fit gap-1 rounded-xl bg-surface-elevated/60 p-1">
      {TABS.map(({ key, label }) => (
        <Link
          key={key}
          href={key === 'activity' ? `/people/${handle}` : `/people/${handle}?tab=${key}`}
          scroll={false}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            active === key
              ? 'bg-surface text-text shadow-sm'
              : 'text-muted hover:text-text'
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  )
}
