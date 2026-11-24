#!/usr/bin/env node
// The project and messaging hub plan of 2026-11-24 (project thread "Design a central project and messaging
// hub"; owner rulings: built inside Spaces, email is the only outside channel for now). One probe per row:
// `node scripts/probes/hub-2026-11-24.mjs <ID>`. Each checks the consequence its row names in the code a
// member's message actually runs through. Exit 1 (FAIL) while the gap stands.
import { existsSync, readdirSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const has = (p) => existsSync(new URL(p, root))
const raw = (p) => (has(p) ? readFileSync(new URL(p, root), 'utf8') : '')
const code = (p) =>
  raw(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
const files = (dir, re) =>
  has(dir) ? readdirSync(new URL(dir, root), { recursive: true }).filter((f) => re.test(String(f))).map((f) => `${dir}/${f}`) : []

const MIGRATIONS = files('supabase/migrations', /\.sql$/)
const sql = () => MIGRATIONS.map((p) => raw(p).replace(/--.*$/gm, '')).join('\n')
const createsTable = (name) => new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?(public\\.)?${name}\\b`, 'i').test(sql())
const registry = () => code('lib/notifications/registry.ts')
const anyCode = (dirs, re) => dirs.flatMap((d) => files(d, /\.(ts|tsx)$/)).filter((p) => !/\.test\./.test(p)).some((p) => re.test(code(p)))

const PROBES = {
  // @ in a Plan or to-do comment stores the reference and notifies the person tagged.
  'LIVE-2524': () => {
    const f = []
    if (!createsTable('mentions')) f.push('no migration creates public.mentions, so a tag is never stored as a reference')
    if (!/'item\.mention'/.test(registry())) f.push("the notification registry has no 'item.mention' type")
    if (!/mentions/.test(code('lib/calendar/plan-comments-store.ts') + code('lib/calendar/plan-comments.ts')))
      f.push('Plan comments do not write mentions, so tagging a co-host on a to-do notifies nobody')
    return f
  },
  // One composer: @people and #items in team rooms and DMs, with the tag notifying.
  'LIVE-2525': () => {
    const f = []
    if (!anyCode(['lib/mentions'], /export function extractReferences\(/)) f.push('lib/mentions has no shared extractReferences, so each box parses on its own')
    for (const p of ['app/(main)/messages/actions.ts']) if (!/extractReferences/.test(code(p))) f.push(`${p} sends DMs without reading @ or # references`)
    if (!anyCode(['lib/messages', 'components/rooms', 'app/(main)/messages'], /room[\s\S]{0,400}extractReferences|extractReferences[\s\S]{0,400}room/i))
      f.push('room messages do not read @ or # references')
    if (!/target_type/.test(sql()) || !/'deal'/.test(sql()) || !/'contact'/.test(sql())) f.push('mentions cannot point at a deal or a contact')
    return f
  },
  // One Inbox: snooze, archive and a Priority view over notifications.
  'LIVE-2526': () => {
    const f = []
    if (!/alter\s+table\s+(public\.)?notifications[\s\S]{0,200}snoozed_until/i.test(sql())) f.push('notifications has no snoozed_until, so nothing can be snoozed')
    if (!/alter\s+table\s+(public\.)?notifications[\s\S]{0,200}archived_at/i.test(sql())) f.push('notifications has no archived_at, so done items cannot leave the list')
    if (!has('app/(main)/inbox/page.tsx')) f.push('there is no /inbox page')
    else if (!/[Pp]riority/.test(code('app/(main)/inbox/page.tsx'))) f.push('/inbox has no Priority view')
    return f
  },
  // A thread can hang off any item, not only a Plan or a calendar entry.
  'LIVE-2527': () => {
    const f = []
    const s = sql()
    if (!/subject_type/.test(s)) f.push('no thread table carries subject_type, so a thread can only hang off a Plan or calendar entry')
    for (const k of ['plan', 'task', 'event', 'deal', 'contact']) if (!new RegExp(`subject_type[\\s\\S]{0,400}'${k}'`).test(s)) f.push(`a thread cannot hang off a ${k}`)
    return f
  },
  // Item threads arrive live and carry unread state.
  'LIVE-2528': () => {
    const f = []
    if (!createsTable('thread_reads')) f.push('no migration creates thread_reads, so nobody sees what is unread')
    if (!/realtime\.(broadcast_changes|send)\s*\(/.test(sql())) f.push('no trigger broadcasts new thread messages, so a reply shows only after a reload')
    return f
  },
  // Every Space has one team room.
  'LIVE-2529': () => {
    const f = []
    if (!anyCode(['lib/messages', 'lib/spaces'], /export (async )?function ensureSpaceTeamRoom\(/)) f.push('nothing ensures a Space has a team room')
    return f
  },
  // Links in team messages show a preview, fetched on the server and cached.
  'LIVE-2530': () => {
    const f = []
    if (!createsTable('link_previews')) f.push('no migration creates link_previews, so outside links show as bare text')
    if (!anyCode(['lib/link-preview'], /export (async )?function getLinkPreview\(/)) f.push('lib/link-preview has no getLinkPreview')
    else if (!anyCode(['lib/link-preview'], /private|loopback|169\.254|isPublicHost/i)) f.push('the preview fetcher has no guard against private addresses')
    return f
  },
  // Find a time: the team votes on a Plan's candidate dates and times, and the best one is ranked first.
  'LIVE-2531': () => {
    const f = []
    if (!/create\s+table\s+(if\s+not\s+exists\s+)?(public\.)?\w*(time|date)_votes\b/i.test(sql())) f.push('no table holds votes on candidate dates, so a team cannot say which pencilled option works for them')
    if (!anyCode(['lib/calendar'], /export function rankTimeOptions\(/)) f.push('nothing ranks the candidate dates by votes, so nobody sees the best option')
    return f
  },
  // Vera proposes the best dates AND times for the people named, not only free days for the Space.
  'LIVE-2532': () => {
    const f = []
    if (!anyCode(['lib/calendar'], /export function suggestTimes\(/)) f.push('Vera can only suggest whole free days for the Space (suggestDates), never a time that suits the people involved')
    else if (!anyCode(['lib/calendar'], /suggestTimes\([\s\S]{0,300}(people|attendees)/)) f.push('suggestTimes does not read who has to be there')
    return f
  },
  // A collaborator without an account votes on dates from the email link.
  'EMAIL-092': () => {
    const f = []
    if (!anyCode(['lib/calendar'], /export (async )?function (sign|verify)TimeVoteToken\(/)) f.push('a vote needs a signed-in member, so an outside collaborator cannot pick a date from their email')
    return f
  },
  // Confirming a time sends every attendee a calendar invite.
  'EMAIL-093': () => {
    const f = []
    if (!anyCode(['lib/calendar'], /export (async )?function confirmTimeOption\(/)) f.push('there is no confirm step that turns the winning option into the date and releases the rest')
    else if (!anyCode(['lib/calendar'], /confirmTimeOption[\s\S]{0,2000}\.ics/)) f.push('confirming a time sends no calendar invite')
    return f
  },
  // A meeting on the calendar carries an agenda and notes, and Vera turns the notes into proposed to-dos.
  'LIVE-2533': () => {
    const f = []
    if (!/kind\s+in\s*\([^)]*'meeting'/i.test(sql())) f.push("a calendar entry cannot be a meeting (kind has no 'meeting')")
    if (!anyCode(['lib/calendar'], /export function notesToTodos\(/)) f.push('meeting notes never become to-dos; someone retypes them')
    return f
  },
  // A reply to a hub notification email posts into the thread it came from.
  'EMAIL-090': () => {
    const f = []
    if (!/thread/i.test(code('lib/comms/reply-address.ts'))) f.push('reply addresses only encode comms conversations, not item threads')
    if (!/thread/i.test(code('lib/comms/inbound.ts'))) f.push('the inbound mail router cannot post a reply into an item thread')
    return f
  },
  // Unread hub notifications step from push to one email per thread to a digest; quiet hours hold them.
  'EMAIL-091': () => {
    const f = []
    if (!has('lib/notifications/ladder.ts')) f.push('there is no notification ladder, so every notice goes out on its own')
    else if (!/read_at|readAt/.test(code('lib/notifications/ladder.ts'))) f.push('the ladder does not stop once the notice is read')
    if (!/quiet_hours/.test(sql())) f.push('notification preferences have no quiet hours')
    return f
  },
  // One task table: Space CRM tasks live in crm_tasks beside Plan to-dos.
  'HYG-251': () => {
    const f = []
    if (/\.eq\('kind',\s*'task'\)|kind:\s*'task'/.test(code('lib/crm/space-tasks.ts'))) f.push("lib/crm/space-tasks.ts still keeps tasks as crm_activities rows with kind='task', a second task table")
    return f
  },
  // One DM thread component behind the page and the dock.
  'HYG-252': () => {
    const f = []
    if (has('components/frequency/members/messages/dm-thread.tsx') && has('components/messages/thread.tsx')) {
      const page = code('components/frequency/members/messages/dm-thread.tsx')
      if (/useTypingIndicator/.test(page) && /useTypingIndicator/.test(code('components/messages/thread.tsx')))
        f.push('the DM page and the dock each run their own thread component, so a fix lands in one and not the other')
    }
    return f
  },
}

const id = process.argv[2]
const probe = PROBES[id]
if (!probe) {
  console.error(`unknown id ${id}; known: ${Object.keys(PROBES).join(', ')}`)
  process.exit(2)
}
const failures = probe()
if (failures.length) {
  console.log(`FAIL ${id}\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`PASS ${id}`)
