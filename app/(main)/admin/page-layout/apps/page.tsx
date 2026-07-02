import Link from 'next/link'
import { Info, LayoutGrid } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { APPS } from '@/lib/apps/catalog'
import type { App } from '@/lib/apps/types'
import { loadAppOverrides } from '@/lib/apps/overrides'
import { AppOverrideRow } from './app-override-row'

export const dynamic = 'force-dynamic'

// The Apps manager (staff, admin+) — the second tab of /admin/page-layout (docs/ADMIN-RAIL.md
// Phase 6). Per chosen SCOPE KIND, it lists every catalog App that attaches to that scope and lets
// an operator ENABLE/DISABLE it, REORDER it (position), and set a per-App "who sees it" role floor
// (min_role). Overrides overlay the code catalog defaults (lib/apps/catalog.ts APPS, resolved by
// lib/apps/for-scope.ts appsForScope); an unset App follows the catalog. Live end-to-end: overrides
// save into app_overrides, are read once per request in (main)/layout.tsx (loadAppOverrides),
// threaded into PageAdminProvider, and merged over the Apps in the settings panel (mergeAppOverrides
// + the min_role gate) on the next request. FAIL-SAFE throughout (any load error → catalog defaults).

// The AdminScope kinds an operator can govern (mirrors adminScopeFor / the manage actions).
const SCOPES: readonly { key: string; label: string }[] = [
  { key: 'global', label: 'Every page' },
  { key: 'circle', label: 'Circles' },
  { key: 'hub', label: 'Hubs' },
  { key: 'nexus', label: 'Nexuses' },
  { key: 'event', label: 'Events' },
  { key: 'practice', label: 'Practices' },
  { key: 'channel', label: 'Channels' },
  { key: 'profile', label: 'Profiles' },
]
const SCOPE_KEYS = new Set(SCOPES.map((s) => s.key))

/** The EDITOR (manage) Apps that attach to a scope kind, in catalog order — the same set
 *  appsForScope resolves for that scope before gating, so the manager governs exactly what the rail
 *  can show. Personal "You" Apps ride the 'global' scope. */
function editorAppsForKind(kind: string): App[] {
  return APPS.filter(
    (a) => a.surfaces.editor != null && a.scopes.some((s) => s.on === 'scopeKind' && s.kind === kind),
  )
}

export default async function AppOverridesAdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ scope?: string }>
}) {
  await requireAdmin('admin')

  const sp = (await searchParams) ?? {}
  const scopeKey = sp.scope && SCOPE_KEYS.has(sp.scope) ? sp.scope : 'global'
  const scopeLabel = SCOPES.find((s) => s.key === scopeKey)?.label ?? 'Every page'

  // Fail-safe: {} (catalog defaults) on any error or pre-migration.
  const overrides = await loadAppOverrides(scopeKey)
  const apps = editorAppsForKind(scopeKey)
  const overrideCount = apps.filter((a) => a.id in overrides).length

  return (
    <AdminTemplate
      title="Apps"
      eyebrow="Platform"
      icon={LayoutGrid}
      description="Tune the standardized settings rail per scope: enable or hide each App, set its order, and set a role floor for who sees it. Anything you leave alone follows the App catalog default, so the rail never breaks."
      width="default"
    >
      <AdminSection title="Scope" description="Pick which surfaces these App overrides apply to.">
        <div className="flex flex-wrap gap-2">
          {SCOPES.map((s) => {
            const active = s.key === scopeKey
            return (
              <Link
                key={s.key}
                href={`/admin/page-layout/apps?scope=${s.key}`}
                aria-current={active ? 'true' : undefined}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-primary-strong bg-primary-strong text-on-primary'
                    : 'border-border bg-surface text-muted hover:text-text'
                }`}
              >
                {s.label}
              </Link>
            )
          })}
        </div>
      </AdminSection>

      <AdminSection
        title={`Apps for ${scopeLabel}`}
        description={
          overrideCount > 0
            ? `${overrideCount} ${overrideCount === 1 ? 'App is' : 'Apps are'} overridden at this scope.`
            : 'Every App follows the catalog default at this scope.'
        }
      >
        <div className="mb-3 flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
          <p>
            Changes take effect live: the rail merges each override on the next request. Order is a
            number (lower shows first); leave it blank to keep the catalog order.
          </p>
        </div>

        {apps.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
            No Apps attach to this scope yet.
          </p>
        ) : (
          <div className="space-y-3">
            {apps.map((a, i) => {
              const o = overrides[a.id] ?? null
              return (
                <AppOverrideRow
                  key={a.id}
                  scopeKey={scopeKey}
                  appId={a.id}
                  label={a.label}
                  catalogIndex={i}
                  initial={o ? { enabled: o.enabled, position: o.position, minRole: o.minRole } : null}
                />
              )
            })}
          </div>
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
