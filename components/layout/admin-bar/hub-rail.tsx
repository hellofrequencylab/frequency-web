'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { UserCircle, Sparkles, Zap, Users, CreditCard, Store, Globe, GitBranch } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import type { BankLink } from '@/lib/admin/rail-bank'
import { getMemberHubData, type MemberHubData } from '@/app/(main)/settings/rail-getters'
import { getSpaceHubData, type SpaceHubData } from '@/app/(main)/spaces/[slug]/manage/rail-getters'

// ── The Hub rail body (ADR-516 Phase B) ──────────────────────────────────────────────────────────────
// The rail's `hub` archetype: a settings index (member /settings*, a Space /settings|/manage) or any
// generic content page shows a STATS + QUICK-LINKS Hub, never a duplicated inline editor. This is that
// body: a StatCard grid sourced from existing signals, one on-canon completeness nudge (member only), and
// the bank quick-links promoted from the pinned foot into a "Go to" grid. Self-fetches its stats through
// the read-gated getters (fail-safe: a null read drops to the bank alone), so nothing rides the
// serializable trigger detail. Tokens only, no hex.

/** Which Hub to render + the slug for a Space Hub. */
export type HubSpec = { kind: 'member' } | { kind: 'space'; slug: string }

/** The bank quick-links, rendered as the primary "Go to" body block (the same array settings-panel
 *  computes from bankForScope — one source of truth). Mirrors the foot-bank markup in admin-bar-body. */
function BankGrid({ bank }: { bank: readonly BankLink[] }) {
  if (bank.length === 0) return null
  return (
    <div className="min-w-0 space-y-2">
      <p className="px-1 text-2xs font-semibold uppercase tracking-wide text-subtle">Go to</p>
      <div className="grid grid-cols-2 gap-2">
        {bank.map((link) => {
          const Icon = link.icon
          return (
            <a
              key={link.href}
              href={link.href}
              className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
            >
              <Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
              <span className="min-w-0 truncate">{link.label}</span>
            </a>
          )
        })}
      </div>
    </div>
  )
}

/** The stats grid shell — a 2-up grid of StatCards. */
function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>
}

const SPOTLIGHT_LABEL: Record<MemberHubData['spotlight'], string> = {
  live: 'Live',
  draft: 'Draft',
  off: 'Off',
}

/** The member Hub: completeness + Spotlight + Zaps + connections + plan, plus one completeness nudge. */
function MemberHub({ bank }: { bank: readonly BankLink[] }) {
  const [data, setData] = useState<MemberHubData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    getMemberHubData()
      .then((d) => {
        if (!active) return
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const profileHref = data?.handle ? `/people/${data.handle}` : '/settings/profile'

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="h-28 animate-pulse rounded-2xl bg-surface-elevated/50" />
      ) : data ? (
        <>
          <StatGrid>
            <StatCard label="Profile complete" value={`${data.completeness}%`} icon={UserCircle} href={profileHref} />
            <StatCard label="Spotlight" value={SPOTLIGHT_LABEL[data.spotlight]} icon={Sparkles} size="sm" />
            <StatCard
              label="Zaps"
              value={data.zaps.toLocaleString()}
              icon={Zap}
              detail={data.streak > 0 ? `${data.streak} day streak` : undefined}
            />
            <StatCard label="Connections" value={data.connections.toLocaleString()} icon={Users} />
            <StatCard label="Plan" value={data.planLabel} icon={CreditCard} size="sm" href="/settings/billing" />
          </StatGrid>
          {data.nudge && (
            <div className="rounded-2xl border border-border bg-surface-elevated/40 p-3">
              <p className="text-sm text-text">
                Your profile is {data.completeness}% there. {data.nudge}
              </p>
              <Link
                href={profileHref}
                className="mt-1 inline-flex min-h-[44px] items-center text-sm font-medium text-primary hover:underline"
              >
                Add one
              </Link>
            </div>
          )}
        </>
      ) : null}
      <BankGrid bank={bank} />
    </div>
  )
}

/** One Space stat item; dropped when its value is null (the viewer cannot source that tool). */
function spaceTile(label: string, value: number | string | null, icon: LucideIcon, href?: string) {
  if (value === null) return null
  return <StatCard key={label} label={label} value={typeof value === 'number' ? value.toLocaleString() : value} icon={icon} size="sm" href={href} />
}

/** The Space Hub: members + pipeline + services + page state + plan (each tile dropped when unavailable). */
function SpaceHub({ slug, bank }: { slug: string; bank: readonly BankLink[] }) {
  const [data, setData] = useState<SpaceHubData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getSpaceHubData(slug)
      .then((d) => {
        if (!active) return
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [slug])

  const tiles = data
    ? [
        spaceTile('Members', data.members, Users, `/spaces/${slug}/settings/members`),
        spaceTile('Pipeline', data.pipeline, GitBranch, `/spaces/${slug}/crm`),
        spaceTile('Services', data.services, Store),
        spaceTile('Page', data.published ? 'Published' : 'Draft', Globe),
        spaceTile('Plan', data.planLabel, CreditCard),
      ].filter(Boolean)
    : []

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="h-28 animate-pulse rounded-2xl bg-surface-elevated/50" />
      ) : tiles.length > 0 ? (
        <StatGrid>{tiles}</StatGrid>
      ) : null}
      <BankGrid bank={bank} />
    </div>
  )
}

/** The Hub rail body for the `hub` archetype (ADR-516 Phase B). */
export function HubRail({ spec, bank }: { spec: HubSpec; bank: readonly BankLink[] }) {
  return spec.kind === 'space' ? <SpaceHub slug={spec.slug} bank={bank} /> : <MemberHub bank={bank} />
}
