'use server'

import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getMembersData, type MemberRow } from './load-members'

// In-place Members module loader (ADR-138 — the People surface). Janitor-only, like
// the /admin/members page (`requireAdmin('janitor')`). Returns null otherwise; the
// role-assignment / account actions in MemberAdmin re-check their own authorization.
export async function loadMembers(): Promise<{ members: MemberRow[]; emailMap: Record<string, string> } | null> {
  const profile = await getCallerProfile()
  if (!profile?.community_role || !atLeastRole(profile.community_role, 'janitor')) return null
  return getMembersData()
}
