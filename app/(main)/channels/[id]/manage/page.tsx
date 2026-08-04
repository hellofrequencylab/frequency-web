import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getChannelCapabilities } from '@/lib/core/load-capabilities'
import { isProgram } from '@/lib/channels/programs'
import { DashboardTemplate } from '@/components/templates'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { Skeleton } from '@/components/ui/skeleton'
import { ChannelSettingsModule } from '@/components/admin/modules/channel-settings-module'
import { CHANNEL_HUB_SECTIONS, asChannelHubSection, type ChannelHubSection } from './hub'
import {
  ChannelHomeStrip,
  ChannelQuickLinks,
  MembersSection,
  CirclesSection,
  ProgramSection,
} from './sections'

// The Channel MANAGE HUB (ADR-870). ONE master dashboard for a topical channel,
// built on the event /manage model (events/[slug]/manage/page.tsx): a pill
// sub-menu navigates the areas via `?section=` (server-rendered, shareable).
// Still the bespoke entity dashboard the menu contract carves out
// (MENU-CONTRACT.md): the hub sections are a route-local grouping, not a module
// catalog; the channel's admin MODULES stay in ADMIN_MODULES, and the rail's
// "Manage Channel" row simply deep-links here.
//
//   Home     → the at-a-glance strip (tuned in, Circles/Chapters, forum posts,
//              room activity) + quick links.
//   Members  → everyone tuned in, newest first.
//   Circles  → the Circles practicing here (labeled Chapters on a Program).
//   Program  → attach a Chapter blueprint (live-circle snapshot or Starter
//              clone), or run the one it has: copy, refresh, pause, detach.
//   Settings → the SAME channel.settings module the admin rail mounts (the
//              catalog module, not a parallel form).
//
// Gated to staff (channel.manage, ADR-274); anyone else gets a 404 so this
// route confirms nothing. Speed is structural (PAGE-FRAMEWORK §5): the shell +
// nav paint immediately; every section streams behind its own <Suspense>.

export const metadata = {
  title: 'Manage Channel',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function SectionFallback() {
  return <Skeleton className="h-40 rounded-2xl" />
}

/** The pill sub-menu (the event/Space HubNav pattern, same classes): one tab per
 *  manage area. `circles` reads "Chapters" while the channel runs a Program. */
function ChannelHubNav({
  idOrSlug,
  section,
  isProgramChannel,
}: {
  idOrSlug: string
  section: ChannelHubSection
  isProgramChannel: boolean
}) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Manage areas">
      {CHANNEL_HUB_SECTIONS.map((s) => {
        const on = s.key === section
        const label = s.key === 'circles' && isProgramChannel ? 'Chapters' : s.label
        return (
          <Link
            key={s.key}
            href={`/channels/${idOrSlug}/manage?section=${s.key}`}
            scroll={false}
            aria-current={on ? 'page' : undefined}
            className={
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors ' +
              (on
                ? 'bg-primary text-on-primary'
                : 'border border-border text-muted hover:bg-surface-elevated hover:text-text')
            }
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

export default async function ManageChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ section?: string; saved?: string; error?: string }>
}) {
  const { id } = await params
  const { section: rawSection, saved, error } = await searchParams
  const admin = createAdminClient()

  // The route accepts the DB id or the slug, same as the channel detail page.
  const matchField = UUID_RE.test(id) ? 'id' : 'slug'
  const { data } = await admin
    .from('topical_channels')
    .select('id, name, slug, template_id, is_active')
    .eq(matchField, id)
    .maybeSingle()
  const channel = data as
    | { id: string; name: string; slug: string; template_id: string | null; is_active: boolean }
    | null
  // No is_active filter here on purpose: a PAUSED Program's public page 404s,
  // but staff must still reach this console to resume it.
  if (!channel) notFound()

  // Gate: channel.manage resolves to platform staff only (topical channels are
  // platform-curated). 404, not 403, so the route confirms nothing to anyone
  // else. Every section's action re-checks the same capability (ADR-274).
  const caps = await getChannelCapabilities(channel.id)
  if (!caps.has('channel.manage')) notFound()

  const isProgramChannel = isProgram(channel)
  const section = asChannelHubSection(rawSection)
  const blurb = CHANNEL_HUB_SECTIONS.find((s) => s.key === section)?.blurb

  return (
    <DashboardTemplate
      eyebrow="Manage Channel"
      title={channel.name}
      description="Your behind-the-scenes view: who is tuned in, what is running, and the Program behind it."
      back={{ href: `/channels/${channel.slug}`, label: 'Back to Channel' }}
      width="default"
      actions={
        <Button asChild variant="secondary" size="sm">
          {/* Straight into the full editor (ADR-882), not the Settings tab: this is the button an
              operator reaches for when they came here to CHANGE something. */}
          <Link href={`/channels/${channel.slug}/edit`}>
            <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit Channel
          </Link>
        </Button>
      }
    >
      <div className="space-y-5">
        <ChannelHubNav idOrSlug={channel.slug} section={section} isProgramChannel={isProgramChannel} />
        {blurb && section !== 'home' && <p className="max-w-2xl text-sm text-muted">{blurb}</p>}
      </div>

      {section === 'home' && (
        <>
          <Suspense fallback={<Skeleton className="h-20 rounded-xl" />}>
            <ChannelHomeStrip
              channelId={channel.id}
              idOrSlug={channel.slug}
              isProgramChannel={isProgramChannel}
            />
          </Suspense>
          <section>
            <SectionHeader title="Quick links" />
            <ChannelQuickLinks idOrSlug={channel.slug} isProgramChannel={isProgramChannel} />
          </section>
        </>
      )}

      {section === 'members' && (
        <section>
          <SectionHeader title="Tuned in" />
          <Suspense fallback={<SectionFallback />}>
            <MembersSection channelId={channel.id} />
          </Suspense>
        </section>
      )}

      {section === 'circles' && (
        <section>
          <SectionHeader title={isProgramChannel ? 'Chapters' : 'Circles'} />
          <Suspense fallback={<SectionFallback />}>
            <CirclesSection
              channelId={channel.id}
              idOrSlug={channel.slug}
              isProgramChannel={isProgramChannel}
              notice={{ saved: saved === '1', error }}
            />
          </Suspense>
        </section>
      )}

      {section === 'program' && (
        <section>
          <SectionHeader title="Program" />
          <Suspense fallback={<SectionFallback />}>
            <ProgramSection
              channelId={channel.id}
              idOrSlug={channel.slug}
              notice={{ saved: saved === '1', error }}
            />
          </Suspense>
        </section>
      )}

      {section === 'settings' && (
        <section>
          {/* The SAME inline channel.settings module the admin rail mounts (module-map), in the
              entity-console card treatment. The catalog module is the one channel editor, never a
              parallel form (MENU-CONTRACT): it reads the channel from the live path and self-gates
              (getChannelAdminData returns null for non-staff); autosaves in place. */}
          <SectionHeader title="Channel settings" />
          {/* The full editor is the deliberate surface (ADR-882): one Save, the URL, and the
              destructive controls. It is offered FIRST so the tab is a route to it, not a
              dead end for anyone who wants more than a quick tweak. */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-elevated/40 p-4">
            <p className="text-sm text-muted">
              Editing more than one thing? The full editor has every field, the URL, and the archive
              and delete controls.
            </p>
            <Button asChild size="sm">
              <Link href={`/channels/${channel.slug}/edit`}>
                <Pencil className="h-3.5 w-3.5" aria-hidden /> Open the full editor
              </Link>
            </Button>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-5 lift-1">
            <ChannelSettingsModule />
          </div>
        </section>
      )}
    </DashboardTemplate>
  )
}
