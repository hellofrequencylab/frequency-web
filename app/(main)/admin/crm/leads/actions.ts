'use server'

// CSV export for the abandoned signup leads page (scan2 L9-03). The same gate the page uses
// (janitor, or marketing staff): a lead's email is personal data, so the export is authorised on
// the server rather than assembled from whatever the client already rendered.

import { getCallerProfile } from '@/lib/auth'
import { authorizeAction } from '@/lib/admin/guard'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { listAbandonedSignupLeads, abandonedSignupLeadsToCsv } from '@/lib/crm/signup-leads'

export async function exportAbandonedSignupLeadsCsv(
  input: { sinceDays?: number } = {},
): Promise<ActionResult<{ csv: string; count: number }>> {
  try {
    await authorizeAction(await getCallerProfile(), 'janitor', 'marketing')
  } catch {
    return fail('Staff access is required.')
  }
  const leads = await listAbandonedSignupLeads({ sinceDays: input.sinceDays, limit: 1000 })
  return ok({ csv: abandonedSignupLeadsToCsv(leads), count: leads.length })
}
