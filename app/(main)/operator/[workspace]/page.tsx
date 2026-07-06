// Operator Console — ROOT scope (preview mount, P0). Behind operatorConsoleEnabled(): notFound while
// OFF so nothing changes in production. The cutover step (P0:9) relocates this onto /admin.

import { notFound } from 'next/navigation'
import { operatorConsoleEnabled } from '@/lib/operator/feature-flag'
import { getRootScopeContext } from '@/lib/operator/scope-context'
import { visibleWorkspaces } from '@/lib/operator/visible'
import { WORKSPACE_IDS, type WorkspaceId } from '@/lib/operator/console'
import { ConsoleShell } from '@/components/operator/console-shell'

export const dynamic = 'force-dynamic'

export default async function RootConsolePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  if (!operatorConsoleEnabled()) notFound()

  const { workspace } = await params
  if (!(WORKSPACE_IDS as readonly string[]).includes(workspace)) notFound()
  const { tab } = await searchParams

  const ctx = await getRootScopeContext()
  const workspaces = visibleWorkspaces(ctx)
  const active = workspaces.find((w) => w.id === workspace)
  if (!active) notFound()

  return (
    <ConsoleShell
      workspaces={workspaces}
      activeWorkspace={workspace as WorkspaceId}
      activeTab={tab ?? active.subtabs[0]?.id ?? ''}
      basePath="/operator"
      scopeLabel="Platform"
    />
  )
}
