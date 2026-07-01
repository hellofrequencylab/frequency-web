import { Images } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { getRootSpaceId, listLibraryAssets } from '@/lib/library/store'
import { LibraryUploader } from './library-uploader'

// The Loom — site-wide asset gallery (janitor-gated). Phase D1 (minimal): upload an image,
// it's catalogued in library_assets, browse the grid, open/download. Search/facets, editing,
// versions, the Puck picker, and per-space Looms follow (docs/BUILD-LIST.md → The Loom).
export const dynamic = 'force-dynamic'

function humanBytes(n: number | null): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default async function AdminLibraryPage() {
  await requireAdmin('janitor')
  const spaceId = await getRootSpaceId()
  const assets = spaceId ? await listLibraryAssets(spaceId) : []

  return (
    <AdminTemplate
      title="Library"
      icon={Images}
      eyebrow="The Loom"
      description="The site-wide asset library. Upload images here and reuse them across the site."
      actions={<LibraryUploader />}
      actionsAlign="end"
    >
      <AdminSection>
        {assets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong px-6 py-16 text-center">
            <Images className="mx-auto mb-3 h-8 w-8 text-subtle" aria-hidden />
            <p className="text-base text-muted">No assets yet.</p>
            <p className="mt-1 text-sm text-subtle">Upload your first image to start the library.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {assets.map((a) => (
              <figure
                key={a.id}
                className="group overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
              >
                <a
                  href={a.url ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="block aspect-[4/3] overflow-hidden bg-surface-elevated"
                >
                  {a.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.url}
                      alt={a.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                    />
                  )}
                </a>
                <figcaption className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="truncate text-sm text-text" title={a.title}>
                    {a.title}
                  </span>
                  <a
                    href={a.url ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-xs font-semibold text-primary-strong hover:underline"
                  >
                    Open
                  </a>
                </figcaption>
                {a.bytes ? (
                  <p className="px-3 pb-2 text-xs text-subtle">{humanBytes(a.bytes)}</p>
                ) : null}
              </figure>
            ))}
          </div>
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
