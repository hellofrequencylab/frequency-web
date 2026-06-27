import Link from 'next/link'
import { Users, Globe, PenLine, CalendarDays } from 'lucide-react'
import type { PostOrigin } from '@/lib/feed/post-origin'

// The "where" line above a profile-timeline post — always shown so it's clear which
// circle / wall / public feed each post belongs to. Presentational only.

export function PostOriginHeader({ origin }: { origin: PostOrigin }) {
  if (origin.kind === 'circle') {
    return (
      <p className="text-xs text-subtle mb-1.5 flex flex-wrap items-center gap-1 px-1">
        <Users className="w-3 h-3" /> Posted in{' '}
        <Link href={`/circles/${origin.slug}`} className="font-medium text-muted hover:underline">
          {origin.name}
        </Link>
      </p>
    )
  }
  if (origin.kind === 'event') {
    return (
      <p className="text-xs text-subtle mb-1.5 flex flex-wrap items-center gap-1 px-1">
        <CalendarDays className="w-3 h-3" /> Posted on{' '}
        <Link href={`/events/${origin.slug}`} className="font-medium text-muted hover:underline">
          {origin.name}
        </Link>
      </p>
    )
  }
  if (origin.kind === 'wall') {
    return (
      <p className="text-xs text-subtle mb-1.5 flex flex-wrap items-center gap-1 px-1">
        <PenLine className="w-3 h-3" /> Posted on{' '}
        <Link href={`/people/${origin.handle}`} className="font-medium text-muted hover:underline">
          {origin.name}’s wall
        </Link>
      </p>
    )
  }
  return (
    <p className="text-xs text-subtle mb-1.5 flex items-center gap-1.5 px-1">
      <Globe className="w-3 h-3" /> Shared to the community
    </p>
  )
}

/** Inline "in <circle>" / "on <name>'s wall" suffix, used after another label
 *  (e.g. a mention line). Renders nothing for a plain feed post. */
export function PostOriginLabel({ origin, prefix }: { origin: PostOrigin; prefix?: string }) {
  if (origin.kind === 'circle') {
    return (
      <span className="inline-flex items-center gap-1">
        {prefix && <span>{prefix}</span>}
        <Link href={`/circles/${origin.slug}`} className="inline-flex items-center gap-1 font-medium text-muted hover:underline">
          <Users className="w-3 h-3" /> {origin.name}
        </Link>
      </span>
    )
  }
  if (origin.kind === 'event') {
    return (
      <span className="inline-flex items-center gap-1">
        {prefix && <span>{prefix}</span>}
        <Link href={`/events/${origin.slug}`} className="inline-flex items-center gap-1 font-medium text-muted hover:underline">
          <CalendarDays className="w-3 h-3" /> {origin.name}
        </Link>
      </span>
    )
  }
  if (origin.kind === 'wall') {
    return (
      <span className="inline-flex items-center gap-1">
        {prefix && <span>{prefix}</span>}
        <Link href={`/people/${origin.handle}`} className="font-medium text-muted hover:underline">
          {origin.name}’s wall
        </Link>
      </span>
    )
  }
  return null
}
