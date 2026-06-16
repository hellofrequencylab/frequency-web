import { Suspense } from 'react'
import Link from 'next/link'
import {
  Bot, ArrowUpRight, HelpCircle, Power, Lightbulb, Sparkles, MessageCircleQuestion,
  type LucideIcon,
} from 'lucide-react'
import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getStaffMember } from '@/lib/staff'
import { getCapabilityOverrides } from '@/lib/permissions'
import { isStaff, isJanitor } from '@/lib/core/roles'
import { staffCan } from '@/lib/core/staff-roles'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { DashArea, TileGrid, Tile, MiniStat, MiniGrid } from '@/components/admin/dash'
import { RingGauge } from '@/components/admin/spark-charts'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { UnderlineTabs } from '@/components/admin/underline-tabs'
import { RelatedAreas } from '@/components/admin/related-areas'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAiControlsData } from '@/app/(main)/admin/ai/load-ai'
import { getStudioRead } from '@/lib/studio/recommendations'
import { VeraTab } from '@/components/admin/vera-ai/vera-tab'
import { HelpGapsTab } from '@/components/admin/vera-ai/help-gaps-tab'
import { AiControlsTab } from '@/components/admin/vera-ai/ai-controls-tab'
import { StudioTab } from '@/components/admin/vera-ai/studio-tab'

// Vera AI — the assistant and the intelligence behind it, as ONE operator DASHBOARD
// (mirrors the Programs domain home): KPI areas up top — the assistant + AI usage, then
// the help/intelligence read — then a Manage grid, one card per surface, each a click from
// editing. BUT most of this domain's "surfaces" are TABS of THIS route (the ?tab= views,
// not separate pages, ADR-265). So the page is dual-mode: the bare /admin/vera-ai renders
// the dashboard; /admin/vera-ai?tab=x renders that tab's existing body (with the
// UnderlineTabs to move between them). Each slow read streams behind its own Suspense so
// the shell never blocks (PAGE-FRAMEWORK §5).
export const dynamic = 'force-dynamic'

const TAB_KEYS = ['vera', 'help-gaps', 'ai', 'studio'] as const
type TabKey = (typeof TAB_KEYS)[number]

const TAB_LABEL: Record<TabKey, string> = {
  vera: 'Vera',
  'help-gaps': 'Help gaps',
  ai: 'AI controls',
  studio: 'Studio',
}

export default async function VeraAiWorkspace({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab: rawTab } = await searchParams

  // ── ?tab=x → the existing tab workspace (per-tab gates preserved exactly). ──
  // The four tabs kept DIVERGENT gates (ADR-265): a viewer sees only the tabs they may
  // use, the default is the first allowed, and an unknown/forbidden ?tab coerces to it.
  // Each tab also re-asserts its own gate. Resolved here so we don't run this when the
  // bare dashboard is what's wanted.
  if (rawTab !== undefined) {
    const profile = await getCallerProfile()
    if (!profile) redirect('/')
    const staff = await getStaffMember().catch(() => null)
    const staffRole = staff?.role ?? null
    const overrides = await getCapabilityOverrides().catch(() => undefined)
    const webRole = profile.webRole

    //   vera  → requireAdmin('janitor', { staff: 'insights' })
    //   ai    → requireAdmin('janitor', { staff: 'platform' })
    //   help-gaps → requireAdmin('janitor')   (janitor only)
    //   studio    → requireAdmin('admin')     (any staff web_role)
    const can: Record<TabKey, boolean> = {
      vera: isJanitor(webRole) || staffCan(staffRole, 'insights', 'write', overrides),
      'help-gaps': isJanitor(webRole),
      ai: isJanitor(webRole) || staffCan(staffRole, 'platform', 'write', overrides),
      studio: isStaff(webRole),
    }
    const allowed = TAB_KEYS.filter((k) => can[k])
    if (allowed.length === 0) redirect('/feed')

    const tab: TabKey = allowed.includes(rawTab as TabKey) ? (rawTab as TabKey) : allowed[0]
    const href = (t: TabKey) => `/admin/vera-ai?tab=${t}`

    return (
      <AdminTemplate
        title="Vera AI"
        eyebrow="Domain"
        icon={Bot}
        width="wide"
        description="The assistant and the intelligence behind it: Vera's voice, the help gaps she surfaces, the platform AI controls, and the recommendations she generates."
      >
        <AdminSection>
          <UnderlineTabs
            activeHref={href(tab)}
            tabs={[
              { href: '/admin/vera-ai', label: 'Overview' },
              ...allowed.map((t) => ({ href: href(t), label: TAB_LABEL[t] })),
            ]}
          />
        </AdminSection>

        <div className="mt-2">
          {tab === 'vera' && <VeraTab />}
          {tab === 'help-gaps' && <HelpGapsTab />}
          {tab === 'ai' && <AiControlsTab />}
          {tab === 'studio' && <StudioTab />}
        </div>

        <RelatedAreas current="vera-ai" role={profile.community_role} webRole={webRole} staffRole={staffRole} />
      </AdminTemplate>
    )
  }

  // ── Bare /admin/vera-ai → the new single DASHBOARD. ──
  const { role, webRole, staffRole } = await requireAdmin('janitor', { staff: 'insights' })

  return (
    <AdminTemplate
      title="Vera AI"
      eyebrow="Domain"
      icon={Bot}
      width="wide"
      description="The assistant and the intelligence behind it in one place: how Vera and platform AI are running, the read on what to write and what to change, then every surface a click from editing."
    >
      <Suspense fallback={<DashSkeleton title="Assistant & AI" />}>
        <AssistantStats />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="The read" />}>
        <IntelligenceStats />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="Manage" />}>
        <ManageSections />
      </Suspense>

      <RelatedAreas current="vera-ai" role={role} webRole={webRole} staffRole={staffRole} />
    </AdminTemplate>
  )
}

// ── Assistant & AI — the master switch, today's spend, and the help index. ──────
async function AssistantStats() {
  const ai = await getAiControlsData()
  const activeFeatures = ai.rows.filter((r) => r.spent > 0).length

  return (
    <DashArea
      icon={Bot}
      label="Assistant & AI"
      blurb="Whether AI is on platform-wide, today's spend across features, and the help index Vera answers from. An empty index is why she deflects."
      footnote={<FreshnessNote at={new Date()} label="Spend resets daily · computed" />}
    >
      <TileGrid>
        <Tile label="Platform AI">
          <p className={`text-xl font-bold leading-tight ${ai.enabled ? 'text-success' : 'text-muted'}`}>
            {ai.enabled ? 'On' : 'Off'}
          </p>
          <p className="mt-1.5 text-xs font-medium text-muted">
            {ai.envReady ? 'Provider configured' : 'Provider not configured'}
          </p>
        </Tile>
        <Tile label="Today">
          <MiniGrid>
            <MiniStat value={`$${ai.totalSpend.toFixed(2)}`} label="AI spend" />
            <MiniStat value={activeFeatures.toLocaleString()} label="Features used" />
            <MiniStat value={ai.rows.length.toLocaleString()} label="Features capped" />
            <MiniStat value={ai.helpChunks.toLocaleString()} label="Help chunks" />
          </MiniGrid>
        </Tile>
        <Tile label="Help index" caption="Chunks indexed for Ask Vera. An empty index is why she deflects.">
          <MiniStat value={ai.helpChunks.toLocaleString()} label="Indexed chunks" />
        </Tile>
      </TileGrid>
    </DashArea>
  )
}

// ── The read — help gaps Vera deflected and the ranked Studio recommendations. ──
async function IntelligenceStats() {
  const admin = createAdminClient()
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const [queries, read] = await Promise.all([
    admin
      .from('ai_help_queries')
      .select('deflected')
      .gte('created_at', since.toISOString())
      .limit(2000),
    getStudioRead(),
  ])
  const rows = (queries.data ?? []) as { deflected: boolean }[]
  const total = rows.length
  const deflectedCount = rows.filter((r) => r.deflected).length
  const deflectRate = total === 0 ? 0 : deflectedCount / total

  const recs = read.recs
  const risk = recs.filter((r) => r.severity === 'risk').length
  const watch = recs.filter((r) => r.severity === 'watch').length

  return (
    <DashArea
      icon={Sparkles}
      label="The read"
      blurb="What members asked Vera in the last 30 days and couldn't get a sure answer to (the to-write list), and the ranked changes the Studio recommends from the live signal."
      footnote={<FreshnessNote at={new Date(read.generatedAt)} label={read.aiNarrated ? 'AI-narrated' : 'Computed'} />}
    >
      <TileGrid>
        <div className="col-span-1 flex items-center rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <RingGauge pct={deflectRate} label="Deflected" sub={`${deflectedCount} of ${total} asked · 30d`} />
        </div>
        <Tile label="Help gaps · 30d">
          <MiniGrid>
            <MiniStat value={total.toLocaleString()} label="Questions asked" />
            <MiniStat value={deflectedCount.toLocaleString()} label="Deflected" />
          </MiniGrid>
        </Tile>
        <Tile label="Studio recommendations">
          <MiniGrid>
            <MiniStat value={recs.length.toLocaleString()} label="From the signal" />
            <MiniStat value={risk.toLocaleString()} label="Needs attention" tone={risk > 0 ? 'bad' : 'neutral'} />
            <MiniStat value={watch.toLocaleString()} label="Watch" />
            <MiniStat value={(recs.length - risk - watch).toLocaleString()} label="Healthy" tone="good" />
          </MiniGrid>
        </Tile>
      </TileGrid>
    </DashArea>
  )
}

// ── Manage — one card per surface, each a stat + a link to open it. The first four
// link to THIS route's ?tab= views; Insights is its own workspace. ─────────────
interface ManageCard {
  label: string
  desc: string
  stat: string
  statLabel: string
  href: string
  Icon: LucideIcon
}

async function ManageSections() {
  const admin = createAdminClient()
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const [ai, queries, read] = await Promise.all([
    getAiControlsData(),
    admin
      .from('ai_help_queries')
      .select('deflected')
      .gte('created_at', since.toISOString())
      .limit(2000),
    getStudioRead(),
  ])
  const rows = (queries.data ?? []) as { deflected: boolean }[]
  const deflectedCount = rows.filter((r) => r.deflected).length

  const cards: ManageCard[] = [
    { label: 'Vera config', desc: 'Voice, live responses, and the founder-induction copy.', stat: '', statLabel: 'Manage', href: '/admin/vera-ai?tab=vera', Icon: Bot },
    { label: 'Help gaps', desc: "Questions Vera deflected, ranked. The to-write list.", stat: `${deflectedCount}`, statLabel: 'deflected · 30d', href: '/admin/vera-ai?tab=help-gaps', Icon: HelpCircle },
    { label: 'AI controls', desc: 'The master switch, per-feature spend, and the switch trail.', stat: ai.enabled ? 'On' : 'Off', statLabel: `$${ai.totalSpend.toFixed(2)} today`, href: '/admin/vera-ai?tab=ai', Icon: Power },
    { label: 'AI Studio', desc: 'Ranked AI recommendations and one-click, reversible changes.', stat: `${read.recs.length}`, statLabel: 'recommendations', href: '/admin/vera-ai?tab=studio', Icon: Lightbulb },
    { label: 'Insights', desc: 'All analytics in one place: the read, engagement, outcomes, and intel.', stat: '', statLabel: 'Open', href: '/admin/insights', Icon: MessageCircleQuestion },
  ]

  return (
    <AdminSection title="Manage" description="Every surface in Vera AI. Open one to edit it.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                <c.Icon className="h-4 w-4" aria-hidden />
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">{c.label}</p>
              <p className="mt-0.5 text-xs leading-snug text-muted">{c.desc}</p>
            </div>
            <p className="mt-auto flex items-baseline gap-1.5">
              {c.stat && <span className="text-lg font-bold tabular-nums text-text">{c.stat}</span>}
              <span className="text-2xs font-medium uppercase tracking-wide text-subtle">{c.statLabel}</span>
            </p>
          </Link>
        ))}
      </div>
    </AdminSection>
  )
}

// On-canvas area skeleton matching the DashArea grammar.
function DashSkeleton({ title }: { title: string }) {
  return (
    <section className="border-t border-border/70 pt-8 first:border-t-0 first:pt-0 sm:pt-9">
      <h2 className="text-xl font-bold tracking-tight text-text">{title}</h2>
      <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-surface-elevated" />
      <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-3">
        <div className="h-32 animate-pulse rounded-2xl bg-surface-elevated/70" />
        <div className="h-32 animate-pulse rounded-2xl bg-surface-elevated/70" />
        <div className="h-32 animate-pulse rounded-2xl bg-surface-elevated/70" />
      </div>
    </section>
  )
}
