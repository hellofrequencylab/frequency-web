import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin/guard'
import { getSpaceById } from '@/lib/spaces/store'
import { listThemes } from '@/lib/theme/server/admin-themes'
import { SpaceBrandEditor, type SkinOption } from '@/components/admin/spaces/space-brand-editor'

export const dynamic = 'force-dynamic'

// The per-Space branding editor route (docs/SPACES.md). Janitor-gated. Loads the Space and
// the set of assignable skins — the built-in code skins plus every ACTIVE skin theme from the
// themes registry — and hands them to the client editor. If the Space is missing, 404.
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

  return <SpaceBrandEditor space={space} skins={skins} />
}
