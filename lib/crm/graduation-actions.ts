'use server'

// THE CLIENT-CALLABLE SERVER ACTION for graduation (CRM-STRATEGY §6, ADR-361 P3).
//
// A 'use server' module may export ONLY async functions, so the implementation, the result type, and
// the pure filter helper live in lib/crm/graduation.ts (no directive: testable). This thin file is the
// seam the CLIENT graduation form imports, so the mutation crosses the network boundary as a proper
// Server Action:
//   import-contacts-form.tsx -> importContactsToSpace
//
// The authorization (owner gate + the crm entitlement) and validation all live in the implementation;
// this wrapper just re-exposes it. The gate is re-checked server-side, so it can never be bypassed.

import { importContactsToSpace as importContactsToSpaceImpl } from '@/lib/crm/graduation'
import type { GraduationFilter, GraduationResult } from '@/lib/crm/graduation'
import { type ActionResult } from '@/lib/action-result'

/** Bring the owner's personal contacts into a Space CRM. Owner + crm-entitlement gated server-side. */
export async function importContactsToSpace(
  spaceId: string,
  filter: GraduationFilter = {},
): Promise<ActionResult<GraduationResult>> {
  return importContactsToSpaceImpl(spaceId, filter)
}
