import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

// LIVE-2190: Vera answers a Frequency team member's questions about running the place with live numbers, from a
// closed list of fixed read-only lookups. Reads the wiring: the list is closed, the lookup refuses an id off it and
// re-checks the caller's session before it reads, the turn hands the lookup in only for a staff session, the agent
// offers the tool only to an operator, and the model chokepoint reads nothing on a turn without it.
const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const questions = read('lib/ai/vera/admin-questions.ts')
assert.match(questions, /export const ADMIN_QUESTIONS = \{/, 'the questions are a closed list')
assert.match(questions, /Object\.hasOwn\(ADMIN_QUESTIONS, id\)/, 'only own ids count')

const lookups = read('lib/ai/vera/admin-lookups.ts')
assert.match(lookups, /^import 'server-only'/, 'the lookups never ship to a browser')
assert.match(lookups, /if \(!isAdminQuestion\(question\) \|\| !Object\.hasOwn\(RUNS, question\)\) return /, 'an id off the list reads nothing')
assert.match(lookups, /if \(!\(await isStaffNow\(\)\)\) return 'That lookup is for the Frequency team only\. Nothing was read\.'/, 'each run re-checks the session first')
assert.ok(!/\.(insert|update|upsert|delete)\(/.test(lookups), 'the lookups only read')
for (const id of Object.keys(Object.fromEntries([...questions.matchAll(/^  (\w+): '/gm)].map((m) => [m[1], 1])))) {
  assert.match(lookups, new RegExp(`  ${id}: \\w+,`), `${id} has a lookup`)
}

const turn = read('lib/ai/vera/turn.ts')
assert.match(turn, /adminLookup: viewer\?\.isOperator \? \(question\) => runAdminLookup\(question, staffNow\) : undefined/, 'only a staff session gets the lookup')
assert.match(turn, /const now = await callerIdentity\(\)\n  return !!now && isStaff\(now\.webRole\)/, 'the re-check reads the caller own session')

const agent = read('lib/ai/vera/agent-claude.ts')
assert.match(agent, /const adminLookup = input\.viewer\?\.isOperator \? input\.adminLookup : undefined/)
assert.match(agent, /\(adminLookup && OPERATOR_TOOL_KEYS\.has\(t\.key\)\)/, 'the tool is offered only with the lookup')
assert.match(agent, /\(managerChecks && SPACE_MANAGER_TOOL_KEYS\.has\(t\.key\)\)/, 'a staff caller gets no Space tools from the lookup alone')

const chokepoint = read('lib/ai/vera/model-tools.ts')
assert.match(chokepoint, /content = space\?\.lookup \? await space\.lookup\(c\.input\.question\) : 'That lookup is for the Frequency team only\. Nothing was read\.'/, 'an invented call on a member turn reads nothing')
console.log('LIVE-2190 ok: Vera answers operator questions with live numbers from a closed list, for staff only, read only')
