import Image from 'next/image'
import Link from 'next/link'
import { HeartHandshake, ArrowRight } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import type {
  IntroductionMade,
  IntroductionForYou,
  IntroPerson,
} from '@/lib/connections/introductions'

const ROW = 'card mu-ecard px-4 py-3'

function Avatar({ person, size = 36 }: { person: IntroPerson; size?: number }) {
  if (person.avatarUrl) {
    return (
      <Image
        src={avatarSrc(person.avatarUrl)}
        alt={person.displayName}
        width={size}
        height={size}
        className="rounded-pill object-cover ring-2 ring-surface-elevated"
        style={{ height: size, width: size, ...avatarFocusStyle(person.avatarUrl) }}
      />
    )
  }
  return (
    <span
      className="flex items-center justify-center rounded-pill bg-primary-bg text-2xs font-semibold text-primary-strong ring-2 ring-surface-elevated select-none"
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
      <p className="min-w-0 truncate text-body-sm font-semibold text-text">
        {a.displayName} <span className="font-normal text-subtle">&amp;</span> {b.displayName}
      </p>
    </div>
  )
}

function StatusChip({ intro, rewardGems }: { intro: IntroductionMade; rewardGems: number }) {
  if (intro.status === 'connected') return <span className="tag live">Connected ✓</span>
  if (intro.status === 'declined') return <span className="tag">Didn’t take</span>
  return <span className="tag">Waiting for them to connect · +{rewardGems} Gems when they do</span>
}

function MadeRow({ intro, rewardGems }: { intro: IntroductionMade; rewardGems: number }) {
  return (
    <li className={ROW}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pair a={intro.a} b={intro.b} />
        <StatusChip intro={intro} rewardGems={rewardGems} />
      </div>
      {intro.note && <p className="mt-2 text-body-sm text-muted">“{intro.note}”</p>}
    </li>
  )
}

function ForYouRow({ intro }: { intro: IntroductionForYou }) {
  return (
    <li className={ROW}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar person={intro.other} size={40} />
          <p className="min-w-0 text-body-sm text-text">
            <span className="font-semibold">{intro.introducer.displayName}</span> thinks you and{' '}
            <span className="font-semibold">{intro.other.displayName}</span> should meet.
          </p>
        </div>
        {intro.other.handle && (
          <Link
            href={`/people/${intro.other.handle}`}
            className={
              buttonClasses('primary', 'sm', 'shrink-0')
            }
          >
            Meet {intro.other.displayName.split(/\s+/)[0]}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      {intro.note && <p className="mt-2 text-body-sm text-muted">“{intro.note}”</p>}
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
