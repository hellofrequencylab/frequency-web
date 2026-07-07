import { Shapes } from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { Icon } from '@/components/ui/icon'
import { ICON_SETS } from '@/lib/library/icon-sets'
import { ICONS } from '@/lib/ui/icon-catalog'

// The Loom Icons lane view (docs/ICONS.md §Loom, ADR-505). Rendered when ?lane=icons. A SERVER
// Component: it indexes the installed @iconify-json sets read-only and previews them + the house
// semantic palette with the RSC <Icon> primitive (which statically imports the collections, so it is
// safe here and NOT in a client lane). Staff-gated by the page (requireAdmin) that mounts it.
//
// Governance-first: this lane shows WHICH sets are installed, their LICENSE (the white-label audit),
// and the house palette. Full cross-set search over every glyph needs a client render path and is a
// follow-up (docs/ICONS.md §Migration); the lane never edits an icon (icons are code, not DB rows).

export function IconsLaneView() {
  const houseCount = Object.keys(ICONS).length

  return (
    <AdminTemplate
      title="Icons"
      eyebrow="Loom"
      icon={Shapes}
      description="The installed icon sets and the house palette. Lucide is the primary family (the set the site already uses); Phosphor and Tabler fill gaps. Reference icons by meaning through the semantic catalog, not by raw name."
      width="wide"
    >
      <AdminSection
        title="Installed sets"
        description="Each set is indexed read-only from its package. Check the license before shipping a set in the white-label product."
      >
        <div className="grid gap-4 @2xl:grid-cols-2">
          {ICON_SETS.map((set) => (
            <div key={set.prefix} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{set.name}</span>
                    <span
                      className={
                        set.role === 'house'
                          ? 'rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-on-primary'
                          : 'rounded-full border border-border px-2 py-0.5 text-xs text-muted'
                      }
                    >
                      {set.role === 'house' ? 'House' : 'Coverage'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {set.total.toLocaleString()} glyphs · prefix{' '}
                    <code className="rounded bg-surface-elevated px-1 py-0.5 text-ink">{set.prefix}</code>
                  </p>
                </div>
                <a
                  href={set.license.url ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-elevated"
                >
                  {set.license.title} license
                </a>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-ink">
                {set.samples.map((s) => (
                  <Icon key={s} name={`${set.prefix}:${s}`} className="size-6" />
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">
                by{' '}
                <a href={set.author.url ?? '#'} target="_blank" rel="noreferrer" className="underline">
                  {set.author.name}
                </a>
              </p>
            </div>
          ))}
        </div>
      </AdminSection>

      <AdminSection
        title="House palette"
        description={`The ${houseCount} semantic icons the site uses by meaning. Code references icon('energy'), not the raw name, so the house family stays swappable.`}
      >
        <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-4 @4xl:grid-cols-6">
          {Object.entries(ICONS).map(([key, name]) => (
            <div
              key={key}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
            >
              <Icon name={name} className="size-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-ink">{key}</p>
                <p className="truncate text-xs text-muted">{name}</p>
              </div>
            </div>
          ))}
        </div>
      </AdminSection>
    </AdminTemplate>
  )
}
