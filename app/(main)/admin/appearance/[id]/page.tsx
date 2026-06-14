import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin/guard'
import { getTheme } from '@/lib/theme/server/admin-themes'
import { ThemeEditor } from '@/components/admin/theme-studio/theme-editor'

export const dynamic = 'force-dynamic'

// The edit route (janitor-gated). Loads the theme by id and opens the editor on it; a missing
// id (absent, or the table isn't migrated yet) 404s rather than showing an empty form for a row
// that doesn't exist.
export default async function EditThemePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('janitor')
  const { id } = await params
  const theme = await getTheme(id)
  if (!theme) notFound()
  return <ThemeEditor initial={theme} mode="edit" />
}
