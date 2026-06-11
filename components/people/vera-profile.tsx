import Link from 'next/link'
import Image from 'next/image'
import { HandHeart, Radio, LifeBuoy, ShieldCheck, BookOpen } from 'lucide-react'
import { DetailTemplate } from '@/components/templates'
import { RoleBadge } from '@/lib/community-roles'
import { getInitials } from '@/lib/utils'
import { AskVeraButton } from './ask-vera-button'

// Vera's profile (ADR-238) — the system voice gets her own page, not a member
// layout: no streaks, no rank, no friend button. Who she is, what her account
// does around the platform, and the one real door (Ask Vera). Visiting
// /people/<her handle> lands here via the is_system branch on the people page.

const WHAT_SHE_DOES = [
  {
    Icon: HandHeart,
    title: 'Welcomes every newcomer',
    line: 'The quiet join lines in the feed are hers, and so is the hello in your notifications.',
  },
  {
    Icon: Radio,
    title: 'Sends your Dispatch',
    line: 'Finish a sit in Mindless and she hands you tomorrow’s thread, one per day.',
    href: '/on-air/dispatches',
    linkLabel: 'Past Dispatches',
  },
  {
    Icon: LifeBuoy,
    title: 'Answers questions',
    line: 'Ask her anything about the place; her answers come from the help guides, with sources.',
    href: '/help',
    linkLabel: 'Help center',
  },
  {
    Icon: ShieldCheck,
    title: 'Routes reports to people',
    line: 'When something needs moderation, she brings it to a human. She never moderates alone.',
  },
]

export function VeraProfile({
  name,
  handle,
  avatarUrl,
  bio,
}: {
  name: string
  handle: string
  avatarUrl: string | null
  bio: string | null
}) {
  return (
    <DetailTemplate
      title={
        <span className="inline-flex items-center gap-3 align-middle">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={name}
              width={56}
              height={56}
              className="h-14 w-14 rounded-full object-cover ring-2 ring-surface-elevated"
            />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-bg text-lg font-bold text-primary-strong">
              {getInitials(name)}
            </span>
          )}
          <span className="min-w-0 break-words">{name}</span>
        </span>
      }
      subtitle={<span className="font-medium">@{handle} · the voice of Frequency</span>}
      badges={<RoleBadge role="moderator" className="text-xs leading-tight" />}
      actions={<AskVeraButton />}
    >
      {bio && <p className="mb-6 max-w-prose text-[15px] leading-relaxed text-text/90">{bio}</p>}

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-subtle">
          What Vera does
        </h2>
        <ul className="space-y-2.5">
          {WHAT_SHE_DOES.map(({ Icon, title, line, href, linkLabel }) => (
            <li
              key={title}
              className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="min-w-0">
                <p className="text-sm font-semibold text-text">{title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">
                  {line}
                  {href && linkLabel && (
                    <>
                      {' '}
                      <Link href={href} className="font-medium text-primary-strong hover:underline">
                        {linkLabel}
                      </Link>
                    </>
                  )}
                </p>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-subtle">
        <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Vera is the platform&rsquo;s voice, not a player: no streaks, no rank, and her job is to
        get you to real people, then step back.
      </p>
    </DetailTemplate>
  )
}
