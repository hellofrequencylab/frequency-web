import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/admin/guard'
import { SITE_DESIGN } from '@/lib/theme/design'
import { FrequencyAdminConsole } from '@/components/frequency/admin/admin-console'

// The Pages admin (page workspace, Funnels, the template/splash editors) is staff-gated
// (admin+). Belt-and-braces: noindex so an editorial surface can never be crawled even if an auth
// edge case ever exposed it. The workspace is module-driven (lib/widgets/modules.ts → '/pages'),
// so its arrangement lives in the on-page Settings → Layout panel — the legacy bottom-right
// "Sort areas" dock is gone.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function PagesAdminLayout({ children }: { children: React.ReactNode }) {
  // Gate the route group at the floor the Pages workspace needs (each page re-asserts its own
  // minimum; each module self-gates further where needed).
  const { profileId, role, webRole, staffRole } = await requireAdmin('admin')
  // Pages and Funnels are rows of the operator menu (Platform, Growth), so under Frequency they sit in the
  // admin console shell with the rest of their section instead of dropping the operator out of it.
  if (SITE_DESIGN === 'frequency') {
    return <FrequencyAdminConsole profileId={profileId} role={role} webRole={webRole} staffRole={staffRole}>{children}</FrequencyAdminConsole>
  }
  return <>{children}</>
}
