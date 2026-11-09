import 'server-only'

// THE LIVE NUMBERS BEHIND VERA'S OPERATOR ANSWERS (LIVE-2190). One fixed, read-only query per question on the
// closed list in admin-questions.ts. The agent hands this in only when the caller's own session is staff
// (isStaff on the profile's web role), and each run re-checks that before it reads, so a replayed or invented
// call from anyone else gets nothing. Results are short plain lines the model folds into its answer; member
// names never leave here, only Space names, counts and admin links.

import { createAdminClient } from '@/lib/supabase/admin'
import { readWebsitePublished } from '@/lib/spaces/website'
import { OPEN_STATUSES } from '@/lib/support/types'
import { isAdminQuestion } from './admin-questions'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const LIST_MAX = 15

type Db = ReturnType<typeof createAdminClient>

function weekAgo(): string {
  return new Date(Date.now() - WEEK_MS).toISOString()
}

function spaceLine(s: { name: string | null; slug: string | null }): string {
  return `${s.name ?? 'Untitled'} (/spaces/${s.slug ?? ''})`
}

async function spacesWithoutSite(db: Db): Promise<string> {
  const { data, error } = await db.from('spaces').select('name, slug, preferences').eq('status', 'active').order('created_at', { ascending: false }).limit(500)
  if (error) return 'Could not read Spaces just now. Point them to /admin/spaces.'
  const rows = (data ?? []).filter((s) => !readWebsitePublished(s.preferences))
  if (!rows.length) return 'Every live Space has a published website.'
  const shown = rows.slice(0, LIST_MAX).map(spaceLine).join('; ')
  return `${rows.length} live Space${rows.length === 1 ? '' : 's'} without a published website${rows.length > LIST_MAX ? ` (newest ${LIST_MAX} shown)` : ''}: ${shown}.`
}

async function newSpacesWeek(db: Db): Promise<string> {
  const { data, error } = await db.from('spaces').select('name, slug').gte('created_at', weekAgo()).order('created_at', { ascending: false }).limit(LIST_MAX + 1)
  if (error) return 'Could not read Spaces just now. Point them to /admin/spaces.'
  const rows = data ?? []
  if (!rows.length) return 'No Spaces were created in the last 7 days.'
  return `Spaces created in the last 7 days${rows.length > LIST_MAX ? ` (first ${LIST_MAX})` : ''}: ${rows.slice(0, LIST_MAX).map(spaceLine).join('; ')}.`
}

async function newMembersWeek(db: Db): Promise<string> {
  const { count, error } = await db.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo())
  if (error || count === null) return 'Could not count new members just now. Point them to /admin/insights.'
  return `${count} ${count === 1 ? 'person' : 'people'} joined in the last 7 days.`
}

async function openReports(db: Db): Promise<string> {
  const { count, error } = await db.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  if (error || count === null) return 'Could not count reports just now. Point them to /admin/moderation.'
  return count ? `${count} report${count === 1 ? ' is' : 's are'} waiting for review at /admin/moderation.` : 'No reports are waiting for review.'
}

async function openSupport(db: Db): Promise<string> {
  const { data, count, error } = await db
    .from('support_tickets')
    .select('ref, subject, created_at', { count: 'exact' })
    .in('status', OPEN_STATUSES)
    .order('created_at', { ascending: true })
    .limit(3)
  if (error || count === null) return 'Could not read support tickets just now. Point them to /admin/support.'
  if (!count) return 'No support tickets are open.'
  const oldest = (data ?? []).map((t) => `#${t.ref} ${t.subject}`).join('; ')
  return `${count} support ticket${count === 1 ? ' is' : 's are'} open. Oldest: ${oldest}. Review them at /admin/support.`
}

const RUNS: Record<string, (db: Db) => Promise<string>> = {
  spaces_without_site: spacesWithoutSite,
  new_spaces_week: newSpacesWeek,
  new_members_week: newMembersWeek,
  open_reports: openReports,
  open_support: openSupport,
}

/** Answer one operator question with live numbers, for a caller the turn already resolved as staff. `isStaffNow`
 *  re-reads that from the session on every run. FAIL-SAFE: any miss is a plain line pointing at /admin. */
export async function runAdminLookup(question: unknown, isStaffNow: () => Promise<boolean>): Promise<string> {
  if (!isAdminQuestion(question) || !Object.hasOwn(RUNS, question)) return 'That is not a question I can look up. Point them to /admin.'
  try {
    if (!(await isStaffNow())) return 'That lookup is for the Frequency team only. Nothing was read.'
    return await RUNS[question](createAdminClient())
  } catch {
    return 'Could not look that up just now. Point them to /admin.'
  }
}
