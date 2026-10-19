import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

/** The service-role-only row that holds website drafts and the Executive Overview (SCAN-827). */
export async function readSpacePrivateState(spaceId: string): Promise<{
  websiteEditor: unknown
  programOverview: string
}> {
  const { data, error } = await createAdminClient()
    .from('space_private_state')
    .select('website_editor, program_overview')
    .eq('space_id', spaceId)
    .maybeSingle()
  if (error) throw error
  return {
    websiteEditor: data?.website_editor ?? null,
    programOverview: typeof data?.program_overview === 'string' ? data.program_overview : '',
  }
}
