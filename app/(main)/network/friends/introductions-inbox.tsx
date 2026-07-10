import Image from 'next/image'
import Link from 'next/link'
import { HeartHandshake, ArrowRight } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import type {
  IntroductionMade,
  IntroductionForYou,
  IntroPerson,
} from '@/lib/connections/introductions'

function Avatar({ person, size = 36 }: { person: IntroPerson; size?: number }) {
  if (person.avatarUrl) {
    return (
      <Image
        src={person.avatarUrl}
        alt={person.displayName}
        width={size}
        height={size}
        className="rounded-full object-cover ring-2 ring-surface-elevated"
        style={{ height: size, width: size }}
      />
    )
  }
  return (
    <span
      className="flex items-center justify-center rounded-full bg-primary-bg text-2xs font-semibold text-primary-strong ring-2 ring-surface-elevated select-none"
      style={{ height: size, width: size }}
    >
      {getInitials(person.displayName)}
    </span>
  )
}

/** Two overlapping avatars + both names — the visual of "you brought these two together". */
function Pair({ a, b }: { a: IntroPerson; b: IntroPerson }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex shrink-0 -space-x-2">
        <Avatar person={a} />
        <Avatar person={b} />
      </div>
      <p className="min-w-0 truncate text-sm font-semibold text-text">
        {a.displayName} <span className="font-normal text-subtle">&amp;</span> {b.displayName}
      </p>
    </div>
  )
}

function StatusChip({ intro, rewardGems }: { intro: IntroductionMade; rewardGems: number }) {
  if (intro.status === 'connected') {
    return (
      <span className="shrink-0 rounded-full bg-success-bg px-2.5 py-1 text-2xs font-semibold text-success">
        Connected ✓
      </span>
    )
  }
  if (intro.status === 'declined') {
    return (
      <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-2xs font-medium text-subtle">
        Didn’t take
      </span>
    )
  }
  return (
    <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-2xs font-medium text-muted">
      Waiting for them to connect · +{rewardGems} Gems when they do
    </span>
  )
}

function MadeRow({ intro, rewardGems }: { intro: IntroductionMade; rewardGems: number }) {
  return (
    <li className="rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pair a={intro.a} b={intro.b} />
        <StatusChip intro={intro} rewardGems={rewardGems} />
      </div>
      {intro.note && <p className="mt-2 text-sm text-muted">“{intro.note}”</p>}
    </li>
  )
}

function ForYouRow({ intro }: { intro: IntroductionForYou }) {
  return (
    <li className="rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar person={intro.other} size={40} />
          <p className="min-w-0 text-sm text-text">
            <span className="font-semibold">{intro.introducer.displayName}</span> thinks you and{' '}
            <span className="font-semibold">{intro.other.displayName}</span> should meet.
          </p>
        </div>
        {intro.other.handle && (
          <Link
            href={`/people/${intro.other.handle}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            Meet {intro.other.displayName.split(/\s+/)[0]}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      {intro.note && <p className="mt-2 text-sm text-muted">“{intro.note}”</p>}
    </li>
  )
}

/** The Introductions inbox — the introductions you've MADE (with reward status) and the
 *  ones made FOR you (warm nudges to meet someone). Rewards the act of introducing,
 *  never ranks people (ADR-186). */
export function IntroductionsInbox({
  made,
  forYou,
  rewardGems,
}: {
  made: IntroductionMade[]
  forYou: IntroductionForYou[]
  rewardGems: number
}) {
  return (
    <div className="space-y-8">
      <section>
        <SectionHeader title="Introductions you’ve made" count={made.length || undefined} />
        {made.length === 0 ? (
          <EmptyState
            icon={HeartHandshake}
            title="No introductions yet"
            description="When you introduce two friends above, they’ll show up here. You’ll earn Gems when they connect."
          />
        ) : (
          <ul className="space-y-3">
            {made.map((intro) => (
              <MadeRow key={intro.id} intro={intro} rewardGems={rewardGems} />
            ))}
          </ul>
        )}
      </section>

      {forYou.length > 0 && (
        <section>
          <SectionHeader title="Someone wants you to meet" count={forYou.length} />
          <ul className="space-y-3">
            {forYou.map((intro) => (
              <ForYouRow key={intro.id} intro={intro} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
