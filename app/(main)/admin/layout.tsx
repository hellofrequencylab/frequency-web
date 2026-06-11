import { Suspense } from 'react'
import { requireAdminFloor } from '@/lib/admin/guard'
import { AdminTopNav } from '@/components/admin/admin-top-nav'
import { AdminLeftNav } from '@/components/admin/admin-left-nav'
import { AdminInfoRail } from '@/components/admin/admin-info-rail'

// Admin route group. The guard is the single entry gate (host+); a viewer without
// access is redirected home (logged-out → '/', insufficient role → '/feed') rather
// than shown a dead-end 404. Pages re-assert their own minimum via requireAdmin(min).
//
// Chrome (ADR-228 + addendum): the sticky TOP-NAV megamenu is the cross-domain
// switcher, and the page is framed by SIDE COLUMNS like the rest of the app —
// NAVIGATION LEFT (the active domain's areas, scoped — not the old all-domains
// accordion) and INFO RIGHT (live counts + newest joins + needs-attention).
// Content runs in the middle. The shell's member rails stay suppressed
// (page-chrome 'none' on both axes) because this layout owns the admin frame.
// The info rail loads behind Suspense so it never blocks the page (PAGE-FRAMEWORK §5).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Floor for entering /admin: community host+ OR any staff role that can see at
  // least one admin group (ADR-127). Each group/page gates itself precisely.
  const { role, webRole, staffRole } = await requireAdminFloor()

  return (
    <div>
      <AdminTopNav role={role} webRole={webRole} staffRole={staffRole} />

      <div className="mx-auto flex w-full max-w-[105rem] gap-8">
        {/* Navigation left — the active domain's areas. */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-[6.5rem] max-h-[calc(100vh-7.5rem)] overflow-y-auto pb-6">
            <AdminLeftNav role={role} webRole={webRole} staffRole={staffRole} />
          </div>
        </aside>

        {/* The page. */}
        <main className="min-w-0 flex-1">{children}</main>

        {/* Info right — live signal. */}
        <aside className="hidden w-64 shrink-0 xl:block">
          <div className="sticky top-[6.5rem] max-h-[calc(100vh-7.5rem)] overflow-y-auto pb-6">
            <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl border border-border bg-surface" />}>
              <AdminInfoRail />
            </Suspense>
          </div>
        </aside>
      </div>
    </div>
  )
}
