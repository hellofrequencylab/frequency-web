// The Operator Console shell (P0:3). One shell for both scopes (root platform + tenant Space),
// composing the Dashboard template (never hand-rolled, per PAGE-FRAMEWORK). It renders the seven
// workspaces as a sidebar, the active workspace's visible subtabs as an underline tab bar, and the
// active subtab body. During the fold (P0:5) each subtab body bridges to the legacy surfaces it will
// absorb, so operators keep working while the migration proceeds.

import Link from 'next/link'
import { DashboardTemplate } from '@/components/templates'
import type { OperatorWorkspace, WorkspaceId } from '@/lib/operator/console'

export interface ConsoleShellProps {
  /** The workspaces the viewer may see (already gated), each carrying only its visible subtabs. */
  workspaces: OperatorWorkspace[]
  /** The active workspace id and subtab id (from the route + ?tab=). */
  activeWorkspace: WorkspaceId
  activeTab: string
  /** Route root for this scope: '/admin' (root) or '/spaces/{slug}/manage' (space). */
  basePath: string
  /** A short scope label shown as the eyebrow ('Platform' or the Space name). */
  scopeLabel: string
}

export function ConsoleShell({
  workspaces,
  activeWorkspace,
  activeTab,
  basePath,
  scopeLabel,
}: ConsoleShellProps) {
  const active = workspaces.find((w) => w.id === activeWorkspace)
  const subtabs = active?.subtabs ?? []
  const current = subtabs.find((t) => t.id === activeTab) ?? subtabs[0]

  return (
    <DashboardTemplate
      eyebrow={scopeLabel}
      title={active?.label ?? 'Console'}
      description={current?.desc}
      width="wide"
    >
      <div className="flex flex-col gap-6 md:flex-row">
        {/* Workspace rail */}
        <nav aria-label="Workspaces" className="md:w-52 md:shrink-0">
          <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {workspaces.map((w) => {
              const on = w.id === activeWorkspace
              return (
                <li key={w.id}>
                  <Link
                    href={`${basePath}/${w.route}`}
                    aria-current={on ? 'page' : undefined}
                    className={[
                      'block whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors',
                      on
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    ].join(' ')}
                  >
                    {w.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Workspace body */}
        <div className="min-w-0 flex-1">
          {subtabs.length > 1 && (
            <nav aria-label="Sections" className="flex gap-4 overflow-x-auto border-b border-border">
              {subtabs.map((t) => {
                const on = t.id === current?.id
                return (
                  <Link
                    key={t.id}
                    href={`${basePath}/${active?.route}?tab=${t.id}`}
                    aria-current={on ? 'page' : undefined}
                    className={[
                      '-mb-px whitespace-nowrap border-b-2 px-1 pb-2 text-sm transition-colors',
                      on
                        ? 'border-primary text-foreground font-medium'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    ].join(' ')}
                  >
                    {t.label}
                  </Link>
                )
              })}
            </nav>
          )}

          {current ? (
            <section className="mt-4">
              <h2 className="text-base font-medium">{current.label}</h2>
              {current.desc && <p className="mt-1 text-sm text-muted-foreground">{current.desc}</p>}
              {current.legacyHrefs && current.legacyHrefs.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Surfaces</p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {current.legacyHrefs.map((href) => (
                      <li key={href}>
                        <Link
                          href={href.replace('[slug]', basePath.split('/')[2] ?? '')}
                          className="text-sm text-primary underline-offset-2 hover:underline"
                        >
                          {href}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Nothing to show here yet.</p>
          )}
        </div>
      </div>
    </DashboardTemplate>
  )
}
