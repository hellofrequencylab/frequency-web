import Link from 'next/link'
import { Sparkles, LifeBuoy, Bug } from 'lucide-react'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'
import {
  ADMIN_HOME,
  ADMIN_GROUPS,
  canSeeGroup,
  canUseLink,
  type AdminLink,
} from '@/app/(main)/admin/sections'

// The admin workspace FOOTER (ADR-228 addendum 3) — admin-only. Three columns:
// NAVIGATION (Home + the domains a viewer may enter), VERA SUPPORT (the AI help +
// the operator support inbox), and VITAL LINKS (the cross-cutting destinations an
// operator reaches for). Gating reuses sections.ts (canSeeGroup / canUseLink) — a
// link a viewer can't use never shows. Server component (no hooks).

interface AdminFooterProps {
  role: CommunityRole
  webRole?: WebRole
  staffRole?: StaffRole | null
}

const ALL_LINKS = ADMIN_GROUPS.flatMap((g) => g.links)
function findLink(href: string): AdminLink | undefined {
  return ALL_LINKS.find((l) => l.href === href)
}

function FootCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 text-3xs font-semibold uppercase tracking-wider text-subtle">{title}</p>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  )
}

function FootLink({
  href,
  children,
  icon: Icon,
}: {
  href: string
  children: React.ReactNode
  icon?: typeof Sparkles
}) {
  return (
    <li>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text"
      >
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />}
        {children}
      </Link>
    </li>
  )
}

export function AdminFooter({ role, webRole = 'none', staffRole = null }: AdminFooterProps) {
  const domains = ADMIN_GROUPS.filter((g) => canSeeGroup(g, role, webRole, staffRole))
  const can = (href: string) => {
    const l = findLink(href)
    return l ? canUseLink(l, role, webRole, staffRole) : false
  }

  return (
    <footer className="mt-12 border-t border-border pt-8 pb-10">
      {/* Match the CONTENT column: the admin area now rides the global left menu, so
          the footer needs only the right info-rail spacer (w-64) to end exactly where
          the content does — no left spacer, no max-width frame of its own. */}
      <div className="flex w-full gap-8">
        <div className="min-w-0 flex-1">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {/* Navigation */}
          <FootCol title="Navigation">
            <FootLink href={ADMIN_HOME.href}>{ADMIN_HOME.label}</FootLink>
            {domains.map((g) => (
              <FootLink key={g.key} href={g.href}>
                {g.label}
              </FootLink>
            ))}
          </FootCol>

          {/* Vera support */}
          <FootCol title="Vera & support">
            <FootLink href="/help" icon={Sparkles}>
              Ask Vera
            </FootLink>
            <FootLink href="/help" icon={LifeBuoy}>
              Help center
            </FootLink>
            {can('/admin/support') && (
              <FootLink href="/admin/support" icon={LifeBuoy}>
                Support inbox
              </FootLink>
            )}
            {can('/admin/vera-ai?tab=help-gaps') && <FootLink href="/admin/vera-ai?tab=help-gaps">Help gaps</FootLink>}
          </FootCol>

          {/* Vital links */}
          <FootCol title="Operate">
            {can('/admin/roles') && <FootLink href="/admin/roles">Roles &amp; permissions</FootLink>}
            {can('/admin/audit') && <FootLink href="/admin/audit">Audit log</FootLink>}
            {can('/admin/vera-ai?tab=ai') && <FootLink href="/admin/vera-ai?tab=ai">AI controls</FootLink>}
            <FootLink href="/settings">Settings</FootLink>
          </FootCol>

          {/* Back / report */}
          <FootCol title="Frequency">
            <FootLink href="/feed">Back to the app</FootLink>
            <FootLink href="/help/ask" icon={Bug}>
              Report a problem
            </FootLink>
          </FootCol>
        </div>

        <p className="mt-8 text-2xs text-subtle">
          Frequency admin · you have access scoped to your role. Sensitive actions are logged to the audit trail.
        </p>
        </div>
        <div className="hidden w-64 shrink-0 xl:block" aria-hidden />
      </div>
    </footer>
  )
}
