import Link from 'next/link'
import Image from 'next/image'
import { Users, MapPin } from 'lucide-react'
import { getInitials } from '@/lib/utils'

// Right-rail building blocks for the Community page. Presentational +
// server-friendly (no hooks). The page fetches the data; these only render.

type OnlineMember = {
  id: string
  handle: string
  displayName: string
  avatarUrl?: string | null
}

/** Soft bordered rail card — the shared shell for a sidebar section. */
export function SidebarCard({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <h2 className="mb-3 flex items-baseline gap-2 text-sm font-bold tracking-tight text-text">
        {title}
        {count != null && (
          <span className="text-xs font-medium tabular-nums text-subtle">{count}</span>
        )}
      </h2>
      {children}
    </section>
  )
}

/** "Online now" — a compact list of members currently online. */
export function OnlineMembersCard({ members }: { members: OnlineMember[] }) {
  return (
    <SidebarCard title="Online now" count={members.length}>
      {members.length === 0 ? (
        <p className="text-xs leading-relaxed text-subtle">
          No one’s online right now. Check back soon, or be the one who says hi first.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {members.map((m) => (
            <li key={m.id}>
              <Link
                href={`/people/${m.handle}`}
                className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-elevated"
              >
                <span className="relative shrink-0">
                  {m.avatarUrl ? (
                    <Image
                      src={m.avatarUrl}
                      alt={m.displayName}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-bg text-2xs font-semibold text-primary-strong select-none">
                      {getInitials(m.displayName)}
                    </span>
                  )}
                  <span
                    aria-hidden
                    className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text">{m.displayName}</span>
                  <span className="block truncate text-xs text-subtle">@{m.handle}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SidebarCard>
  )
}

/** Stats card — total members + the most popular place. */
export function CommunityStatsCard({
  totalMembers,
  topPlace,
  topPlaceCount,
}: {
  totalMembers: number
  topPlace?: string | null
  topPlaceCount?: number
}) {
  return (
    <SidebarCard title="At a glance">
      <dl className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
            <Users className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <dt className="text-xs text-subtle">Total members</dt>
            <dd className="text-base font-bold tabular-nums text-text">{totalMembers}</dd>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
            <MapPin className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <dt className="text-xs text-subtle">Most popular place</dt>
            <dd className="truncate text-base font-bold text-text">
              {topPlace ?? '–'}
              {topPlace && topPlaceCount ? (
                <span className="ml-1.5 text-xs font-medium text-subtle">{topPlaceCount} members</span>
              ) : null}
            </dd>
          </span>
        </div>
      </dl>
    </SidebarCard>
  )
}
