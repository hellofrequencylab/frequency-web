// Operator Console — SPACE scope (preview mount, P0). Behind operatorConsoleEnabled(). getSpaceScopeContext
// calls notFound() for a viewer who cannot manage or staff-preview the Space (never widens the existing
// settings guard). The cutover step (P0:9) relocates this onto /spaces/[slug]/manage.

import { notFound } from 'next/navigation'
import { operatorConsoleEnabled } from '@/lib/operator/feature-flag'
import { getSpaceScopeContext } from '@/lib/operator/scope-context'
import { getSpaceBySlug } from '@/lib/spaces/store'
import { visibleWorkspaces } from '@/lib/operator/visible'
import { WORKSPACE_IDS, type WorkspaceId } from '@/lib/operator/console'
import { ConsoleShell } from '@/components/operator/console-shell'

export const dynamic = 'force-dynamic'

export default async function SpaceConsolePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; workspace: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  if (!operatorConsoleEnabled()) notFound()

  const { slug, workspace } = await params
  if (!(WORKSPACE_IDS as readonly string[]).includes(workspace)) notFound()
  const { tab } = await searchParams

  const ctx = await getSpaceScopeContext(slug)
  const workspaces = visibleWorkspaces(ctx)
  const active = workspaces.find((w) => w.id === workspace)
  if (!active) notFound()

  const space = await getSpaceBySlug(slug)

  return (
    <ConsoleShell
      workspaces={workspaces}
      activeWorkspace={workspace as WorkspaceId}
      activeTab={tab ?? active.subtabs[0]?.id ?? ''}
      basePath={`/operator/s/${slug}`}
      scopeLabel={space?.name ?? 'Space'}
    />
  )
}
