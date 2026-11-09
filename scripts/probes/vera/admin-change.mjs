import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

// LIVE-2191: Vera proposes a support ticket's status or priority to a Frequency team member, and a tap goes through
// the support console's own guarded action. Reads the wiring: the change list is closed, the tool is an operator
// tool the agent offers only with the staff lookup, the chokepoint refuses a change off the list, and the confirm
// path finds no ticket for a session that is not staff before it calls setTicketFields.
const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const changes = read('lib/ai/vera/admin-changes.ts')
assert.match(changes, /const FIELDS: Record<TicketField, Record<string, string>> = \{ status: STATUS_WORDS, priority: PRIORITY_WORDS \}/, 'only status and priority')
assert.match(changes, /Object\.hasOwn\(words, value\) \?/, 'a value off the field list has no card')

assert.match(read('lib/ai/vera/tools.ts'), /new Set\(\['admin_lookup', 'set_ticket'\]\)/, 'a ticket change is an operator tool')
assert.match(read('lib/ai/vera/agent-claude.ts'), /lookup: adminLookup, ticketCard \}/, 'the ticket card rides only the staff checks')
assert.match(read('lib/ai/vera/model-tools.ts'), /c\.name === 'set_ticket' && !space\?\.ticketCard\?\.\(/, 'the chokepoint refuses a change it may not offer')

const confirm = read('app/onboarding/vera-actions.ts')
assert.match(confirm, /if \(tool === 'set_ticket'\) return setTicket\(args\)/)
assert.match(
  confirm,
  /if \(!me \|\| !isStaff\(me\.webRole\)\) return \{ ok: false, error: 'That action is not available here\.' \}\n  const \{ data \} = await createAdminClient\(\)\.from\('support_tickets'\)/,
  'only a staff session finds the ticket',
)
assert.match(confirm, /await setTicketFields\(data\.id, /, 'a tap goes through the support console action, which re-checks the caller')
console.log('LIVE-2191 ok: Vera proposes a ticket status or priority to the team, and a tap goes through the console action')
