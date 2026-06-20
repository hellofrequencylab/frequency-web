import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CalendarClock, ChevronRight, Eye, BadgeCheck, Settings, Users } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminSection } from '@/components/templates'
import { getSpaceById } from '@/lib/spaces/store'
import { listThemes } from '@/lib/theme/server/admin-themes'
import { SpaceBrandEditor, type SkinOption } from '@/components/admin/spaces/space-brand-editor'

export const dynamic = 'force-dynamic'

// The per-Space branding editor route (docs/SPACES.md). Janitor-gated. Loads the Space and
// the set of assignable skins — the built-in code skins plus every ACTIVE skin theme from the
// themes registry — and hands them to the client editor. If the Space is missing, 404.
//
// It ALSO renders a "Preview owner back-end" section: a janitor (Executive Admin) can open any
// Space's owner surfaces (Manage hub, Availability for a practitioner, Memberships for a business,
// and Members) read-only, to see exactly what the owner sees. Those surfaces gate their render on
// canManage || staffViewing and keep every write on canEditProfile, so the preview is view-only.

/** One preview link into a Space's owner back-end (icon tile + label + one-line note). */
function PreviewLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string
  icon: typeof Eye
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong hover:bg-surface-elevated"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text">{title}</span>
        <span className="block text-xs text-muted">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
    </Link>
  )
}
export default async function SpaceBrandEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('janitor')
  const { id } = await params

  const [space, themes] = await Promise.all([getSpaceById(id), listThemes().catch(() => [])])
  if (!space) notFound()

  // Built-in code skins (app/globals.css) are always assignable; active skin themes layer on.
  const builtins: SkinOption[] = [
    { slug: 'default', name: 'Default (built-in)' },
    { slug: 'midnight', name: 'Midnight (built-in)' },
  ]
  const dbSkins: SkinOption[] = themes
    .filter((t) => t.kind === 'skin' && t.status === 'active')
    .map((t) => ({ slug: t.slug, name: t.name }))
  // De-dupe by slug (a built-in mirrored as a DB row keeps the DB name once).
  const seen = new Set(builtins.map((o) => o.slug))
  const skins: SkinOption[] = [...builtins, ...dbSkins.filter((o) => !seen.has(o.slug))]

  // The root Space serves the app itself; it has no public /spaces/<slug> profile or owner back-end,
  // so the preview section only renders for tenant Spaces.
  const hasOwnerBackEnd = space.type !== 'root'

  return (
    <SpaceBrandEditor space={space} skins={skins}>
      {hasOwnerBackEnd && (
        <AdminSection
          title="Preview owner back-end"
          description="Open this Space's owner surfaces read-only, exactly as the owner sees them. Changes are disabled in preview."
        >
          <div className="space-y-3">
            <PreviewLink
              href={`/spaces/${space.slug}/settings`}
              icon={Settings}
              title="Manage hub"
              description="The owner's settings hub: profile, brand, and visibility."
            />
            {space.type === 'practitioner' && (
              <PreviewLink
                href={`/spaces/${space.slug}/settings/availability`}
                icon={CalendarClock}
                title="Availability and bookings"
                description="The weekly booking windows and the owner's calendar."
              />
            )}
            {space.type === 'business' && (
              <PreviewLink
                href={`/spaces/${space.slug}/settings/memberships`}
                icon={BadgeCheck}
                title="Memberships"
                description="The membership tiers and who has joined."
              />
            )}
            <PreviewLink
              href={`/spaces/${space.slug}/settings/members`}
              icon={Users}
              title="Members"
              description="Who is on the team and the role each one holds."
            />
            <PreviewLink
              href={`/spaces/${space.slug}`}
              icon={Eye}
              title="View live profile"
              description="The public profile members see."
            />
          </div>
        </AdminSection>
      )}
    </SpaceBrandEditor>
  )
}
