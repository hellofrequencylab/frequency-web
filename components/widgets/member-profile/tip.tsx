import Link from 'next/link'
import { Heart } from 'lucide-react'
import type { MemberBlockProps } from '@/lib/entity-blocks/member-adapter'
import { buttonClasses } from '@/components/ui/button'
import { MemberSection } from './section'

// TIP JAR: a warm card on the public Spotlight (SPL-06). The Spotlight is ISR and cookie-free, so this is
// a server-rendered LINK to the in-app tip composer (/people/<handle>#tip), never the client composer.
// Signed-out visitors get the usual sign-in round trip on that route. FAIL-SAFE: it renders only when the
// reader says the member can actually receive tips (`canTip`, the same payouts-ready rule as the in-app
// Tip button), so a member who has not set up payouts never shows a dead door. Tips are 0% platform fee.
export function TipBlock({ member, data }: MemberBlockProps) {
  if (!data.canTip) return null
  const handle = member.slug
  if (!handle) return null
  const name = member.displayName.split(' ')[0] || 'them'
  return (
    <MemberSection anchor="tip">
      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Heart aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
          <div className="min-w-0">
            <h2 className="text-lead font-semibold text-text">Tip jar</h2>
            <p className="text-body-sm text-muted">
              Enjoying {name}&apos;s work? Tips go straight to {name}, with 0% platform fee.
            </p>
          </div>
        </div>
        <Link href={`/people/${handle}#tip`} className={buttonClasses('primary', 'md', 'shrink-0 justify-center')}>
          Send a tip
        </Link>
      </div>
    </MemberSection>
  )
}
