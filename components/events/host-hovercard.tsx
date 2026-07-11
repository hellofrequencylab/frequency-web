import Link from 'next/link'
import Image from 'next/image'
import { getInitials } from '@/lib/utils'

// The event host's name in the page header, with a hover/focus PROFILE PREVIEW popover
// (Event page overhaul, item 3). Reserved for an IN-NETWORK host — one with a Frequency
// profile; an out-of-network organizer renders as plain text upstream, so this box only ever
// previews a real member.
//
// CSS-only (group-hover + group-focus-within), mirroring components/ui/hover-tip.tsx, so it stays a
// Server Component with no client JS. The name itself stays a plain link to the profile, so a tap on
// touch still navigates while a desktop hover reveals the preview.
//
// Phrasing-only: the whole thing lives inside the header subtitle `<p>`, so every element here is
// inline (span / a / img) — no block `<div>` (which the browser would hoist out of the `<p>`). The
// avatar treatment mirrors PersonCard (round Image, initials fallback) so the host reads the same
// here as in any people list, without pulling in the block-level card shell.
export function HostHovercard({
  host,
}: {
  host: { id: string; display_name: string; handle: string; avatar_url: string | null }
}) {
  return (
    <span className="group/host relative inline-block align-baseline">
      <Link
        href={`/people/${host.handle}`}
        className="font-bold text-primary-strong hover:underline"
      >
        {host.display_name}
      </Link>
      <span className="pointer-events-none absolute left-0 top-full z-50 mt-2 block w-64 translate-y-1 rounded-2xl border border-border bg-surface p-3 opacity-0 shadow-lg transition-[opacity,transform] duration-100 ease-out group-hover/host:pointer-events-auto group-hover/host:translate-y-0 group-hover/host:opacity-100 group-focus-within/host:pointer-events-auto group-focus-within/host:translate-y-0 group-focus-within/host:opacity-100">
        <Link href={`/people/${host.handle}`} className="flex items-center gap-3">
          {host.avatar_url ? (
            <Image
              src={host.avatar_url}
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-full bg-primary-bg text-sm font-semibold text-primary-strong">
              {getInitials(host.display_name)}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-text">{host.display_name}</span>
            <span className="block truncate text-xs text-subtle">@{host.handle}</span>
            <span className="mt-0.5 block text-2xs font-semibold uppercase tracking-wide text-primary-strong">
              Host
            </span>
          </span>
        </Link>
      </span>
    </span>
  )
}
