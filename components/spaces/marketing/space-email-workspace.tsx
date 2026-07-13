'use client'

import { useMemo } from 'react'
import {
  EmailStudioWorkspace,
  type EmailWorkspaceActions,
} from '@/components/admin/email-studio/workspace'
import type { EmailCampaignCard } from '@/app/(main)/admin/email-studio/actions'
import type { EmailColors } from '@/lib/email-studio/render'
import {
  listSpaceEmailDrafts,
  createSpaceEmailDraft,
  deleteSpaceEmailDraft,
  loadSpaceEmailDraft,
  saveSpaceEmailDraft,
  sendSpaceTestEmail,
} from '@/lib/spaces/email-drafts'

// SPACE MARKETING EMAIL WORKSPACE (Email in the Business CRM, P1 · deliverable 2 — the client seam). A thin
// client wrapper that binds the space-scoped email actions to a spaceId and hands them to the SHARED Email
// Studio workspace (components/admin/email-studio). We do NOT fork the editor: the same two-pane list + the
// same on-canvas WYSIWYG editor (EmailCanvasEditor) render here, wired to this Space's own drafts and painted
// in the Space's brand palette (spaceEmailColors), resolved server-side and passed as `colors`.
//
// spaceId + colors are serializable props from the Server Component page; the action closures are built HERE
// (a client boundary) so each server action is called with the spaceId baked in.

export function SpaceEmailWorkspace({
  spaceId,
  initialCampaigns,
  colors,
}: {
  spaceId: string
  initialCampaigns: EmailCampaignCard[]
  colors: EmailColors
}) {
  const actions = useMemo<EmailWorkspaceActions>(
    () => ({
      list: () => listSpaceEmailDrafts(spaceId),
      create: () => createSpaceEmailDraft(spaceId),
      remove: (id) => deleteSpaceEmailDraft(spaceId, id),
      load: (id) => loadSpaceEmailDraft(spaceId, id),
      save: (id, patch) => saveSpaceEmailDraft(spaceId, id, patch),
      sendTest: (id) => sendSpaceTestEmail(spaceId, id),
    }),
    [spaceId],
  )

  return (
    <EmailStudioWorkspace
      initialCampaigns={initialCampaigns}
      actions={actions}
      arrangement="canvas"
      colors={colors}
    />
  )
}
