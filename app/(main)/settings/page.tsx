import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { User, Palette, Bell, MapPin, Shield, CreditCard } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { Skeleton } from '@/components/ui/skeleton'
import { getMyProfileId } from '@/lib/auth'
import { SELECTABLE_SKINS } from '@/lib/theme/skins'
import { AppearanceSection } from './appearance/section'
import { NotificationsSection } from './notifications/section'
import { ConnectionsSection } from './connections/section'
import { AccountSection } from './account/section'
import { PlanSection } from './billing/section'

// The member Settings suite as ONE page (DAWN 2 screen pass, per
// design_handoff/dawn/ui_kits/screens/settings.html): a chip section-rail up top, then
// the whole suite stacked — Appearance (the skin picker leads), the four-channel
// notification grid, Connections and location, Account and privacy, Plan and billing.
// Each section keeps the exact forms + server actions its old standalone route had (the
// old routes now redirect to their anchor here); this page only composes them.
//
// Framework notes (docs/PAGE-FRAMEWORK.md): a Focus template surface; the rail stays
// 'global' via lib/layout/page-chrome.ts (the /settings row already exists — no change).
// Speed is structural: every section fetches its own data behind its own <Suspense>, so
// the shell + chips paint immediately and no section blocks another.

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Your whole settings suite on one page.',
}

// The section rail: Profile links out to its own editor (a full form surface with the
// Spotlight builder attached); the rest are in-page anchors.
const SECTIONS = [
  { id: 'appearance', label: 'Appearance', Icon: Palette },
  { id: 'notifications', label: 'Notifications', Icon: Bell },
  { id: 'connections', label: 'Connections and location', Icon: MapPin },
  { id: 'account', label: 'Account and privacy', Icon: Shield },
  { id: 'plan', label: 'Plan and billing', Icon: CreditCard },
] as const

export default async function SettingsPage({
  searchParams,
}: {
  // Stripe return URLs also append `upgraded=1` / `bundle=1` markers, but nothing reads them
  // (the old billing page never did either — `session_id` alone drives the confirm), so they
  // are deliberately not typed here.
  searchParams: Promise<{ session_id?: string; payouts?: string }>
}) {
  // The suite is a signed-in surface (the old billing page gated the same way).
  const myProfileId = await getMyProfileId()
  if (!myProfileId) redirect('/sign-in?next=/settings')

  // Stripe checkout / Connect returns land here via the /settings/billing redirect.
  const params = await searchParams

  return (
    <FocusTemplate title="Settings" description="The whole suite on one page." width="wide">
      {/* Section chips — one page, one scroll; each chip jumps to its section. */}
      <nav
        aria-label="Settings sections"
        className="mb-8 flex flex-wrap gap-2 border-b border-border pb-5"
      >
        <SectionChip href="/settings/profile" label="Profile" Icon={User} />
        {SECTIONS.map(({ id, label, Icon }) => (
          <SectionChip key={id} href={`#${id}`} label={label} Icon={Icon} />
        ))}
      </nav>

      {/* Profile — the full editor (form + Spotlight builder) stays its own surface. */}
      <section id="profile" className="scroll-mt-24">
        <SectionHeader title="Profile" href="/settings/profile" />
        <Link
          href="/settings/profile"
          className="flex items-center gap-3 rounded-control border border-border bg-surface px-4 py-3 lift-1 hover:border-primary-bg dark:hover:border-primary hover:bg-primary-bg/30 dark:hover:bg-primary-bg transition-colors"
        >
          <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-surface-elevated shrink-0">
            <User className="w-4 h-4 text-muted" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-body-sm font-medium text-text">Edit profile</span>
            <span className="mt-0.5 block text-meta text-muted">
              Display name, handle, bio, photo, and your Spotlight page
            </span>
          </span>
          <span className="text-subtle text-body-sm">→</span>
        </Link>
      </section>

      <SettingsSection
        id="appearance"
        title="Appearance"
        // 🔴 THE INTRO NAMED A CONTROL THAT IS NOT ON THE PAGE. It read "Pick the palette,
        // feel, and seasonal accent", but the switcher only renders the Palette picker when
        // there is more than one SELECTABLE skin (theme-switcher.tsx), and there is exactly
        // one today: Midnight is registered but `selectable: false` (lib/theme/skins.ts,
        // owner call 2026-08-04). So every member read a promise of a palette chooser and
        // then scrolled a phone-height section looking for it. It also never mentioned Mode,
        // which IS on the page. Derived from the same registry the switcher reads, so
        // flipping Midnight back to selectable restores the word by itself rather than
        // leaving a second copy to go stale. (The escape-hatch case — a member stranded on a
        // withdrawn skin, where the picker shows for one card — under-promises here, which is
        // the harmless direction.)
        intro={`Pick ${
          SELECTABLE_SKINS.length > 1 ? 'the palette, the feel' : 'the feel'
        }, the seasonal accent, and light or dark. Changes save instantly.`}
      >
        <Suspense fallback={<SectionSkeleton rows={3} />}>
          <AppearanceSection />
        </Suspense>
      </SettingsSection>

      <SettingsSection
        id="notifications"
        title="Notifications"
        intro="Choose how and when Frequency contacts you. Changes save instantly."
      >
        <Suspense fallback={<SectionSkeleton rows={6} />}>
          <NotificationsSection />
        </Suspense>
      </SettingsSection>

      <SettingsSection
        id="connections"
        title="Connections and location"
        intro="Decide who can find you, how precisely your location is shown, and how far your reach extends. Changes save instantly."
      >
        <Suspense fallback={<SectionSkeleton rows={4} />}>
          <ConnectionsSection />
        </Suspense>
      </SettingsSection>

      <SettingsSection
        id="account"
        title="Account and privacy"
        intro="Manage who you have blocked, download your data, and delete your account."
      >
        <Suspense fallback={<SectionSkeleton rows={3} />}>
          <AccountSection />
        </Suspense>
      </SettingsSection>

      <SettingsSection id="plan" title="Plan and billing" intro="Your plan and payment.">
        {/* Anchor alias: old deep links said "billing". */}
        <span id="billing" className="scroll-mt-24" />
        <Suspense fallback={<SectionSkeleton rows={2} />}>
          <PlanSection sessionId={params.session_id} payouts={params.payouts} />
        </Suspense>
      </SettingsSection>
    </FocusTemplate>
  )
}

/** One chip in the section rail. An in-page anchor (or the Profile route link). */
function SectionChip({
  href,
  label,
  Icon,
}: {
  href: string
  label: string
  Icon: typeof User
}) {
  return (
    <Link
      href={href}
      className="press inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-1.5 text-meta font-medium text-muted lift-1 transition-colors hover:border-primary/40 hover:text-primary-strong"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Link>
  )
}

/** A stacked section: anchor target + SectionHeader + plain intro line. */
function SettingsSection({
  id,
  title,
  intro,
  children,
}: {
  id: string
  title: string
  intro?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="mt-12 scroll-mt-24 border-t border-border pt-8">
      <SectionHeader title={title} />
      {intro && <p className="-mt-1 mb-4 max-w-xl text-body-sm text-muted">{intro}</p>}
      {children}
    </section>
  )
}

/** Loading shape for a section: a few row cards, no layout shift on arrival. */
function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 lift-1">
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}
