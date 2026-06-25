import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/admin/guard'

// The Pages admin (page workspace, Splash Funnels, the template/splash editors) is staff-gated
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
  await requireAdmin('admin')
  return <>{children}</>
}
