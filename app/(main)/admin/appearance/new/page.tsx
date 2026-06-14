import { requireAdmin } from '@/lib/admin/guard'
import { ThemeEditor } from '@/components/admin/theme-studio/theme-editor'

export const dynamic = 'force-dynamic'

// The "new theme" route (janitor-gated). Opens the editor on an empty draft; Create persists it
// as a draft via createTheme, then routes back to the Studio list.
export default async function NewThemePage() {
  await requireAdmin('janitor')
  return <ThemeEditor initial={null} mode="new" />
}
