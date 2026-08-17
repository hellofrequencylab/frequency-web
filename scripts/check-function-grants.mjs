#!/usr/bin/env node
// FUNCTION-GRANT CONTRACT — every public function carries a deliberate EXECUTE verdict.
//
// WHY THIS EXISTS. PostgREST exposes every function in `public` as an RPC, so an EXECUTE grant to
// `anon` is a browser-reachable endpoint callable with the publishable key. Supabase ships
// `ALTER DEFAULT PRIVILEGES IN SCHEMA public` granting `anon` and `authenticated` EXECUTE on every
// new function, and Postgres separately grants EXECUTE to the pseudo-role PUBLIC. Those are two
// different grants and neither revoke removes the other: `REVOKE ... FROM public` leaves the
// explicit per-role grants standing (ADR-959), and `REVOKE ... FROM anon, authenticated` leaves the
// PUBLIC grant satisfying has_function_privilege(). The 20270221000100 / 20270221000200 pair
// learned this the expensive way — the first migration ran, succeeded, and closed two of six.
//
// So the SQL READS CORRECT while removing nothing, which is why this is a gate and not a review
// note. A reviewer looking at `revoke execute on function public.thing(uuid) from public;` sees a
// lock. The database sees a no-op.
//
// A SECURITY DEFINER function is worse than a table here: a table that leaks still has RLS as a
// second lock, and `internal` tables sit behind RLS-on-with-no-policy. A definer function bypasses
// RLS by construction. The grant IS the wall. There is no second one.
//
// MEASURED ON PROD (azsqfeonabsbmemvddqd, 2026-08-17, by has_function_privilege AND by the Supabase
// advisors, agreeing exactly): 29 SECURITY DEFINER functions in `public` are EXECUTE-able by
// `anon`, 49 by `authenticated`. This gate does not fix that. See WHAT IT CANNOT SEE.
//
// WHAT IT ENFORCES, all cumulative over every migration in filename order:
//
//   1. BIJECTION. The set of live `public` functions replayed from supabase/migrations/ equals the
//      set of names in scripts/function-grants.txt. A new function with no verdict fails. A verdict
//      for a dropped function fails.
//   2. `internal` AND `authenticated` ARE BOTH LOAD-BEARING. Either verdict asserts "anon must not
//      call this", and both require an explicit `revoke ... on function <name> ... from ... anon`
//      that NAMES THE ROLE, somewhere in the migrations.
//   3. `revoke ... from public` DOES NOT SATISFY RULE 2. This is the entire point of the file. A
//      public-only revoke is recorded and then explicitly rejected with a message saying why.
//   4. A LATER `grant execute ... to anon` UNDOES AN EARLIER REVOKE. Statements replay in order, so
//      a revoke that a subsequent migration hands back does not count. This is real, not
//      hypothetical: 20270303000100 revokes capture_guest_rsvp from `public, anon, authenticated`
//      on line 193 and grants it back to `anon, authenticated` on line 209 — deliberately, because
//      guest RSVP is an anon entry point. A set-union reading of that file reports the function as
//      revoked. It is not.
//
// ── WHERE THIS DIVERGES FROM scripts/check-grants.mjs, AND WHY ────────────────────────────────
//
// This is the function sibling of the table gate and mirrors it on purpose. Three deliberate
// differences, each because functions are not tables:
//
//   · `authenticated` is load-bearing HERE and only a declaration THERE. On a table, RLS is the
//     second lock and `authenticated` means "policies exist and gate on identity". A SECURITY
//     DEFINER function has no second lock, so "signed-in only" is a claim about the GRANT and
//     nothing else. Making it a declaration would have left 20 of the 29 open functions describable
//     as compliant. Verified affordable before adopting: every function this repo currently treats
//     as signed-in-only already carries a role-explicit revoke.
//   · STATEMENT-ORDERED REPLAY, not a set union. check-grants.mjs collects revoked tables into a
//     Set with no ordering, which cannot see rule 4 above. Functions get revoked and re-granted in
//     the same file in this repo, so order is not optional here.
//   · DROP RESETS THE VERDICT. `drop function` + `create function` returns the ACL to default
//     (PUBLIC + Supabase's default privileges); `create or replace` preserves it. The replay models
//     both, so a function re-created after its revoke is reported as open — which it is.
//
// WHY NOT A COUNT-RATCHET. Same reason as the table gate: a bare number's cheapest fix is editing
// the number (ADR-962). There is deliberately no baseline. Adding a function is a one-word edit to
// the ledger, and the word is the decision.
//
// WHY NOT "revoke in the same migration as the create". A grant decision legitimately lands later,
// and a per-file rule would be red on most of the 165 create sites on day one. Same argument
// check-rls.mjs makes for its own class of check.
//
// ── WHAT IT CANNOT SEE, stated plainly so nobody mistakes green here for safe ──────────────────
//
//   · 🔴 WHETHER ANY REVOKE WAS EVER APPLIED. This reads `supabase/migrations/`. It does not
//     connect to a database and it never will — that is `pnpm check:migrations`' rule 4, which
//     compares the repo against the live ledger head (ADR-1007). PRODUCTION TODAY HAS 29
//     anon-executable and 49 authenticated-executable SECURITY DEFINER functions in `public`
//     (measured 2026-08-17). THIS GUARD CLOSES NONE OF THEM. A green run here means "the repo
//     states a decision for every function", not "the database enforces it".
//
//     🔴 AND A GREEN RUN HERE CANNOT BE MADE TO MEAN MORE BY EDITING THE LEDGER, which was tried
//     and caught. The first ledger moved twelve functions to `internal` / `authenticated` on the
//     strength of a revoke migration that was authored and never applied. The migration then
//     failed check:migrations rule 4 — a repo file with no ledger row — and had to leave the tree
//     for docs/proposals/. Had the ledger's twelve claims stayed, this gate would have printed a
//     tick over the exact 29 functions it exists to report. The rule that falls out: A VERDICT
//     DESCRIBES THE TREE, NEVER AN INTENTION. `public` means "anon can execute this", not
//     "anon should". 59 rows say `public` and roughly fourteen are deliberate front doors; that
//     gap is OWN-006, and it is an open row, not a silence.
//   · MCP `apply_migration` and `execute_sql` write to prod without leaving a file, so the
//     repo⇄ledger bijection (ADR-963) is the only thing making "in a migration" approximate "in the
//     database". That bijection has broken three times, twice in one day.
//   · OVERLOADS COLLAPSE TO A NAME. `revoke ... from anon` on one signature of an overloaded
//     function marks the name revoked. Postgres tracks ACLs per signature. Matching table-grants'
//     granularity was the deliberate choice; a per-signature ledger would need every argument list
//     spelled exactly as pg_get_function_identity_arguments renders it, which is not something a
//     migration author can be expected to get right by hand.
//   · DYNAMIC SQL. Catalog-driven `do $$ ... execute format(...)` loops are invisible to a regex.
//     Two exist here and both are declared below (RETIRED_BY_DYNAMIC_SQL, LOOP_REVOKES, LOOP_COVERED)
//     rather than silently absorbed, because a parser that cannot see a statement is a parser that
//     cannot protect the object it touched. A catalog loop is also a ONE-SHOT: it sees the catalog
//     as it stood the moment it ran, so every function created after it needs its own revoke — and
//     LOOP_COVERED verifies exactly that ordering rather than believing the claim.
//   · SCHEMAS OTHER THAN `public`. Functions in `private` are not on the PostgREST surface at all,
//     which is the whole reason 18 RLS helpers were moved there in 20270101000000.
//   · WHETHER THE BODY IS SAFE. `public` is an unverified assertion that a signed-out visitor is
//     meant to reach it. It says nothing about what the function returns or whether its internal
//     guard fails closed for anon — that is supabase/migrations/fail-open-guards.test.ts (ADR-961).
//     Keep both.
//
// Usage: `node scripts/check-function-grants.mjs` (or `pnpm check:function-grants`). Exits 1 on
// violation. Model: scripts/check-grants.mjs.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS = join('supabase', 'migrations')
const LEDGER = join('scripts', 'function-grants.txt')
const VERDICTS = new Set(['public', 'authenticated', 'internal'])

/** A repo this size never legitimately drops to a handful of migrations. Matches check-grants.mjs:
 *  the floor exists to tell "I read the directory and it was fine" apart from "I could not read the
 *  directory", which is the confusion that has inverted probes in this repo five times. */
const MIN_MIGRATIONS = 400

/**
 * Functions the migrations CREATE in `public` and later remove by DYNAMIC SQL this parser cannot
 * follow. Each entry names the migration that removed it; the guard checks that migration exists
 * and genuinely contains the dynamic move, so a stale entry fails here rather than quietly
 * standing in for a function that came back.
 *
 * All 18 are the RLS helpers moved to the `private` schema by 20270101000000, whose loop reads
 * `execute format('alter function %s set schema private', sig)`. Verified against the production
 * catalog on 2026-08-17: all 18 are in `private` and none is in `public`.
 *
 * ⚠️ IT IS A DECLARATION, NOT A HEURISTIC. "Some migration mentions this name" would be too weak.
 * Naming the migration is a reviewable act, and the check below keeps the claim from rotting.
 */
export const RETIRED_BY_DYNAMIC_SQL = Object.fromEntries(
  [
    'am_participant',
    'am_room_member',
    'can_read_event',
    'can_view_space_content',
    'can_write_space_content',
    'event_id_for_post',
    'get_my_circle_ids',
    'get_my_hub_ids',
    'get_my_profile_id',
    'get_my_region_id',
    'get_my_role',
    'get_my_tuned_channel_ids',
    'get_my_web_role',
    'is_event_cohost',
    'is_my_event',
    'is_space_admin',
    'is_space_member',
    'is_space_update_post',
  ].map((fn) => [fn, '20270101000000_rls_helpers_to_private_schema.sql']),
)

/** The dynamic-SQL move each RETIRED_BY_DYNAMIC_SQL entry must be backed by. */
const DYNAMIC_RETIREMENT_PROOF = /alter\s+function\s+%s\s+set\s+schema\s+private/i

/**
 * Migrations that revoke EXECUTE through a catalog-driven loop instead of naming functions.
 * Listed so the header's claim about them is checkable, and so nobody "fixes" a future failure by
 * pointing at one of these and calling the function covered.
 *
 * A LOOP IS NOT A LEDGER ENTRY, and this guard deliberately gives it no credit. 20261231000000's
 * own header claims "a trigger function added later by another migration is covered on the next
 * `db reset` replay" — which is false, because replay is version-ordered and the loop only ever
 * walks the catalog as it stands when it runs. 20270224000100 was written specifically to correct
 * one function that claim had missed. Every function needs its own revoke.
 *
 * ⚠️ Checked in scripts/check-function-grants.test.ts against the REAL tree, not here. This list
 * changes nothing about the verdict for any function — it exists so the header's claim cannot rot
 * — and enforcing a real-tree fact inside the CLI would fail every fixture that does not happen to
 * contain these two files.
 */
export const LOOP_REVOKES = [
  '20261231000000_revoke_trigger_fn_rest_execute.sql',
  '20270224000100_revoke_friendships_freeze_identity_execute.sql',
]

/**
 * The ONE function whose closed state in production this repo cannot reproduce with a named
 * revoke, declared rather than hidden. `after_crew_completion_verified` is `anon=false` in prod and
 * no migration names it — 20261231000000 closed it inside a `do $$` loop over pg_proc.
 *
 * ⚠️ THIS IS NOT A LICENCE, AND IT IS NOT TAKEN ON TRUST. A catalog loop only covers functions that
 * ALREADY EXIST when it runs, and replay is version-ordered, so the claim "the loop covers it" is a
 * checkable fact: the function's create migration must sort STRICTLY BEFORE the loop's. The guard
 * verifies exactly that below, plus that the named migration really is a catalog-driven revoke.
 * 20270224000100 exists because friendships_freeze_identity FAILED that test — created at
 * 20270221000000, after the loop — and needed its own revoke. A new trigger function added today
 * cannot be waved through here: it would sort after the loop and this entry would fail.
 *
 * Every entry is a function this repo would rather name explicitly. OWN-006's proposal
 * (docs/proposals/OWN-006-revoke-browser-execute.sql) includes the named revoke that empties this
 * map; until an owner applies it, `public` would be a lie (anon genuinely cannot execute it) and
 * a hard failure would be a gate nobody can make green. So it is declared, verified, and COUNTED
 * IN THE PASSING OUTPUT so it can never read as ordinary coverage.
 */
export const LOOP_COVERED = {
  after_crew_completion_verified: '20261231000000_revoke_trigger_fn_rest_execute.sql',
}

/** What a LOOP_COVERED migration must actually be: a catalog-driven revoke, not a hand-list. */
const CATALOG_LOOP_PROOF = [/do\s*\$\$/i, /pg_proc/i, /revoke/i]

/**
 * Blank BOTH comment forms, preserving length so nothing shifts. Lifted verbatim in spirit from
 * check-grants.mjs, and the reason is the same one that file records: a migration in this tree
 * carries a full rollback script inside a C-style block comment, and a parser reading only `--`
 * comments treats those statements as real. Here the stakes are identical in the other direction —
 * three migrations QUOTE `revoke ... from public` in their explanatory headers to explain why it
 * does not work, and a parser that counts those has just credited the exact statement this whole
 * file exists to reject.
 *
 * BLANKED, not deleted: length-preserving substitution cannot move a match that was already there,
 * which matters because the replay below is ordered by match index.
 */
export function stripSqlComments(text) {
  const blank = (m) => m.replace(/[^\n]/g, ' ')
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|\n)([ \t]*--[^\n]*)/g, (_m, lead, body) => lead + blank(body))
}

/**
 * Split a comma-separated object list at TOP LEVEL only, so argument lists survive.
 * `public.mkt_content_performance(int,int), public.mkt_geo()` is two entries, not three.
 *
 * 🔴 This is not a nicety. 20260604030000 revokes FIVE functions in one statement, and the first
 * draft of this parser — which matched a single name between `on function` and `from` — saw only
 * `mkt_growth`. Four SECURITY DEFINER admin RPCs read as un-revoked while their revoke was sitting
 * right there in the file. Cross-checking the parse against the production catalog is what caught
 * it; the four are `anon=false` in prod, so the parser was wrong and the SQL was right.
 */
export function splitTopLevel(span) {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of span) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

/** Count the parameters in a raw argument span. `''` is zero, not one. */
export function arityOf(argSpan) {
  const inner = argSpan.trim()
  if (inner === '') return 0
  return splitTopLevel(inner).length
}

/**
 * The `public` functions named in an object list, as `{ name, arity }`.
 * `arity` is null when the statement gave no argument list — for a DROP that means "every
 * signature", which is what Postgres does when the name is unambiguous.
 */
export function functionNamesIn(span) {
  const out = []
  for (const item of splitTopLevel(span)) {
    const m = /^\s*(?:([a-z0-9_]+)\s*\.\s*)?"?([a-z0-9_]+)"?\s*(\(([\s\S]*)\))?/i.exec(item)
    if (!m) continue
    const schema = (m[1] || 'public').toLowerCase()
    if (schema !== 'public') continue
    out.push({ name: m[2].toLowerCase(), arity: m[3] === undefined ? null : arityOf(m[4]) })
  }
  return out
}

/** Does this role list name `anon` as a ROLE? `public` alone must never answer yes — rule 3. */
export function namesAnonRole(roleList) {
  return /(^|[\s,])anon([\s,]|$)/i.test(roleList.trim())
}

const CREATE_FN =
  /create\s+(?:or\s+replace\s+)?function\s+(?:([a-z0-9_]+)\s*\.\s*)?"?([a-z0-9_]+)"?\s*\(/gi
const DROP_FN = /drop\s+function\s+(?:if\s+exists\s+)?([\s\S]*?);/gi
const SET_SCHEMA =
  /alter\s+function\s+(?:([a-z0-9_]+)\s*\.\s*)?"?([a-z0-9_]+)"?\s*(?:\([^)]*\))?\s*set\s+schema\s+([a-z0-9_]+)/gi
const REVOKE_FN =
  /revoke\s+(?:all(?:\s+privileges)?|execute)\s+on\s+function\s+([\s\S]*?)\s+from\s+([^;]+);/gi
const GRANT_FN =
  /grant\s+(?:all(?:\s+privileges)?|execute)\s+on\s+function\s+([\s\S]*?)\s+to\s+([^;]+);/gi

/** The raw argument span of a `create function name(` whose `(` sits at `open`. Balanced. */
function argSpanFrom(sql, open) {
  let depth = 0
  for (let i = open; i < sql.length; i++) {
    if (sql[i] === '(') depth++
    else if (sql[i] === ')') {
      depth--
      if (depth === 0) return sql.slice(open + 1, i)
    }
  }
  return ''
}

/**
 * Replay every migration's statements IN ORDER and return the live `public` functions with their
 * final anon-EXECUTE state.
 *
 * Order is load-bearing twice over — across files (filename order is apply order) and WITHIN a
 * file, because this repo revokes and re-grants the same function eleven lines apart. Statements
 * are therefore collected with their match index and sorted, not processed regex-by-regex. The
 * first draft of this function processed all creates, then all drops, per file — and quietly lost
 * NINE functions whose migrations open with `drop function if exists ...; create function ...`.
 * Diffing the parse against the production catalog is the only reason that was ever noticed.
 *
 * ── TWO GRANULARITIES, ON PURPOSE ────────────────────────────────────────────────────────────
 * LIVENESS is tracked per SIGNATURE (by arity), because dropping one overload must not erase the
 * name. `record_qr_scan` is why: 20270104000000 drops its 7-argument signature, and the 8-argument
 * one created in 20260607020000 is still live in production today. A name-granular liveness model
 * marked the whole function dead, which took it out of the bijection entirely — a function the
 * parser cannot see is a function this gate cannot protect, and it is anon-reachable in prod.
 *
 * The GRANT STATE is tracked per NAME, matching scripts/table-grants.txt's granularity. A revoke on
 * one signature therefore credits the name. That is a real blind spot, stated in the header, and
 * the alternative — a ledger keyed on argument lists spelled exactly as Postgres renders them — is
 * not something a migration author can be expected to get right by hand.
 */
export function replay(files) {
  /** name -> { sigs, anonRevoked, createdIn, publicOnlyRevokes: [file], regrantedIn: [file] } */
  const state = new Map()
  const fresh = () => ({
    sigs: new Set(),
    anonRevoked: false,
    createdIn: null,
    publicOnlyRevokes: [],
    regrantedIn: [],
  })
  const touch = (fn) => {
    if (!state.has(fn)) state.set(fn, fresh())
    return state.get(fn)
  }

  for (const { name, text } of files) {
    const sql = stripSqlComments(text)
    const events = []

    for (const m of sql.matchAll(CREATE_FN)) {
      if ((m[1] || 'public').toLowerCase() !== 'public') continue
      const open = m.index + m[0].length - 1
      events.push({ i: m.index, kind: 'create', fn: m[2].toLowerCase(), arity: arityOf(argSpanFrom(sql, open)) })
    }
    for (const m of sql.matchAll(DROP_FN)) {
      for (const t of functionNamesIn(m[1])) events.push({ i: m.index, kind: 'drop', fn: t.name, arity: t.arity })
    }
    for (const m of sql.matchAll(SET_SCHEMA)) {
      if ((m[1] || 'public').toLowerCase() !== 'public') continue
      if (m[3].toLowerCase() === 'public') continue
      events.push({ i: m.index, kind: 'drop', fn: m[2].toLowerCase(), arity: null })
    }
    for (const m of sql.matchAll(REVOKE_FN)) {
      const anon = namesAnonRole(m[2])
      for (const t of functionNamesIn(m[1])) {
        events.push({ i: m.index, kind: anon ? 'revoke-anon' : 'revoke-not-anon', fn: t.name })
      }
    }
    for (const m of sql.matchAll(GRANT_FN)) {
      if (!namesAnonRole(m[2])) continue
      for (const t of functionNamesIn(m[1])) events.push({ i: m.index, kind: 'grant-anon', fn: t.name })
    }

    events.sort((a, b) => a.i - b.i)
    for (const e of events) {
      const s = touch(e.fn)
      switch (e.kind) {
        case 'create':
          // `create or replace` preserves the ACL; a create after the last drop resets it to
          // Postgres' default (PUBLIC) plus Supabase's default privileges (anon, authenticated).
          if (s.sigs.size === 0) {
            s.anonRevoked = false
            s.publicOnlyRevokes = []
            s.regrantedIn = []
          }
          s.sigs.add(e.arity)
          if (!s.createdIn) s.createdIn = name
          break
        case 'drop':
          // No argument list means every signature, which is what Postgres does.
          if (e.arity === null) s.sigs.clear()
          else s.sigs.delete(e.arity)
          if (s.sigs.size === 0) {
            s.anonRevoked = false
            s.publicOnlyRevokes = []
            s.regrantedIn = []
          }
          break
        case 'revoke-anon':
          s.anonRevoked = true
          s.regrantedIn = []
          break
        case 'revoke-not-anon':
          // Recorded, NOT credited. This is the ADR-959 hole itself: the statement succeeds and
          // removes nothing, because Supabase's default privileges are explicit per-role grants.
          s.publicOnlyRevokes.push(name)
          break
        case 'grant-anon':
          if (s.anonRevoked) s.regrantedIn.push(name)
          s.anonRevoked = false
          break
      }
    }
  }

  const live = new Map()
  for (const [fn, s] of state) if (s.sigs.size > 0) live.set(fn, s)
  return live
}

/** Parse the ledger: `name<whitespace>verdict`, `#` comments, blank lines ignored. */
export function parseLedger(text) {
  const out = new Map()
  const bad = []
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) return
    const [name, verdict] = line.split(/\s+/)
    if (!name || !verdict || !VERDICTS.has(verdict)) {
      bad.push(`${LEDGER}:${i + 1}  "${raw.trim()}"`)
      return
    }
    out.set(name.toLowerCase(), { verdict, line: i + 1 })
  })
  return { entries: out, bad }
}

/** The whole check, over already-read files. Returns the failure messages, newest concern first. */
export function audit(files, ledgerText) {
  const problems = []
  const liveAll = replay(files)
  const byName = new Map(files.map((f) => [f.name, f.text]))

  // The dynamic-SQL declarations must still be true, or they are a story nobody checks.
  //
  // Only entries that are DOING WORK are validated — i.e. those whose function the parse actually
  // found live in `public`, which is the only case where the declaration is what removes it. An
  // entry naming a function no migration in this tree creates removes nothing and is inert, so
  // demanding its migration exist would fail every fixture and every partial tree. What must never
  // happen is an entry silently hiding a function that IS there.
  for (const [fn, file] of Object.entries(RETIRED_BY_DYNAMIC_SQL)) {
    if (!liveAll.has(fn)) continue
    const text = byName.get(file)
    if (text === undefined) {
      problems.push(
        `✗ check:function-grants — RETIRED_BY_DYNAMIC_SQL hides \`${fn}\` from the bijection and\n` +
          `    credits \`${file}\`, which does not exist in ${MIGRATIONS}/.\n` +
          `    A declaration pointing at a missing migration is not evidence of anything. Either fix\n` +
          `    the entry, or delete it and give \`${fn}\` a real verdict.\n`,
      )
      continue
    }
    if (!DYNAMIC_RETIREMENT_PROOF.test(text)) {
      problems.push(
        `✗ check:function-grants — ${file} no longer contains the dynamic schema move that\n` +
          `    RETIRED_BY_DYNAMIC_SQL claims retired \`${fn}\`. Either the migration changed or the\n` +
          `    entry is stale. Re-verify against the catalog before touching this list.\n`,
      )
    }
  }

  const live = new Map([...liveAll].filter(([fn]) => !RETIRED_BY_DYNAMIC_SQL[fn]))
  const { entries, bad } = parseLedger(ledgerText)

  for (const line of bad) {
    problems.push(
      `✗ check:function-grants — unparseable ledger line.\n\n  ${line}\n\n` +
        `    Expected: <function_name>  <public|authenticated|internal>\n`,
    )
  }

  // 1. Bijection — missing verdicts.
  for (const [fn, s] of [...live].sort()) {
    if (entries.has(fn)) continue
    const gap = ' '.repeat(fn.length + 2)
    problems.push(
      `✗ check:function-grants — no EXECUTE verdict for \`${fn}\`.\n` +
        `    created in ${MIGRATIONS}/${s.createdIn ?? '(unknown)'}\n\n` +
        `    PostgREST exposes every public function as an RPC, and Supabase's\n` +
        `    \`ALTER DEFAULT PRIVILEGES IN SCHEMA public\` ALREADY granted anon and authenticated\n` +
        `    EXECUTE on it. Decide, then add ONE line to ${LEDGER}:\n\n` +
        `      ${fn}  internal        <- service_role only. ALSO add to the migration:\n` +
        `      ${gap}                   revoke execute on function public.${fn}(<args>)\n` +
        `      ${gap}                     from public, anon, authenticated;\n` +
        `      ${fn}  authenticated   <- signed-in callers invoke it with the anon key.\n` +
        `      ${gap}                   STILL needs the revoke above naming anon: a definer\n` +
        `      ${gap}                   function has no RLS behind it.\n` +
        `      ${fn}  public          <- a signed-out visitor must be able to call it.\n\n` +
        `    If you are unsure, it is \`internal\`. That is the verdict that fails closed.\n`,
    )
  }

  // 2. Bijection — stale verdicts.
  for (const [fn, { line }] of [...entries].sort()) {
    if (live.has(fn)) continue
    const retired = RETIRED_BY_DYNAMIC_SQL[fn]
    problems.push(
      `✗ check:function-grants — stale ledger entry \`${fn}\` (${LEDGER}:${line}).\n` +
        (retired
          ? `    It left \`public\` in ${retired}. Delete the line.\n`
          : `    No live public function by that name in ${MIGRATIONS}/. Delete the line.\n`),
    )
  }

  // 2b. A LOOP_COVERED claim is a checkable fact, so check it. The loop must exist, must really be
  //     a catalog-driven revoke, and must run AFTER the function was created — otherwise a
  //     version-ordered replay walks a catalog the function is not in yet and covers nothing.
  const loopCovered = new Set()
  for (const [fn, file] of Object.entries(LOOP_COVERED)) {
    const s = live.get(fn)
    if (!s) continue
    const text = byName.get(file)
    if (text === undefined) {
      problems.push(
        `✗ check:function-grants — LOOP_COVERED credits \`${file}\` for \`${fn}\`, and that\n` +
          `    migration does not exist. Delete the entry and give \`${fn}\` a named revoke.\n`,
      )
      continue
    }
    if (!CATALOG_LOOP_PROOF.every((re) => re.test(text))) {
      problems.push(
        `✗ check:function-grants — LOOP_COVERED credits \`${file}\` for \`${fn}\`, but that file is\n` +
          `    not a catalog-driven revoke any more. Re-verify against the catalog, then fix the entry.\n`,
      )
      continue
    }
    if (!(s.createdIn && s.createdIn < file)) {
      problems.push(
        `✗ check:function-grants — LOOP_COVERED claims \`${file}\` covers \`${fn}\`, but \`${fn}\` is\n` +
          `    created in ${s.createdIn ?? '(unknown)'}, which does NOT sort before it.\n\n` +
          `    🔴 A catalog loop is a ONE-SHOT over the catalog as it stood when it ran, and replay is\n` +
          `    version-ordered — so a fresh \`db reset\` walks a catalog this function is not in yet and\n` +
          `    revokes nothing. This is exactly what 20270224000100 was written to correct.\n` +
          `    Give \`${fn}\` its own revoke:\n\n` +
          `      revoke execute on function public.${fn}(<args>) from public, anon, authenticated;\n`,
      )
      continue
    }
    loopCovered.add(fn)
  }

  // 3. `internal` and `authenticated` must both be backed by a REAL, role-explicit revoke.
  for (const [fn, { verdict, line }] of [...entries].sort()) {
    if (verdict === 'public') continue
    const s = live.get(fn)
    if (!s || s.anonRevoked || loopCovered.has(fn)) continue
    let why
    if (s.regrantedIn.length > 0) {
      why =
        `\n    🔴 IT WAS REVOKED, AND THEN GRANTED BACK. The re-grant is in:\n` +
        s.regrantedIn.map((f) => `         ${MIGRATIONS}/${f}`).join('\n') +
        `\n    Statements replay in order, so the later grant is the state that survives. If the\n` +
        `    re-grant is deliberate, the verdict is \`public\`, not \`${verdict}\` — say so in the\n` +
        `    ledger. If it is not, remove it.\n`
    } else if (s.publicOnlyRevokes.length > 0) {
      why =
        `\n    🔴 IT HAS A REVOKE, AND THE REVOKE REMOVES NOTHING. Found in:\n` +
        s.publicOnlyRevokes.map((f) => `         ${MIGRATIONS}/${f}`).join('\n') +
        `\n    Those revoke from PUBLIC without naming a role. Supabase's ALTER DEFAULT\n` +
        `    PRIVILEGES issued anon and authenticated EXPLICIT per-role grants, and revoking\n` +
        `    the pseudo-role PUBLIC does not touch an explicit grant. The statement succeeds\n` +
        `    and removes nothing (ADR-959). This is the exact failure this gate exists for.\n`
    } else {
      why = `\n    No revoke names \`anon\` for this function anywhere in the migrations.\n`
    }
    problems.push(
      `✗ check:function-grants — \`${fn}\` is marked \`${verdict}\` but anon can still execute it` +
        ` (${LEDGER}:${line}).\n` +
        why +
        `\n    Add to a migration — BOTH halves, in ONE statement, or neither lock closes:\n\n` +
        `      revoke execute on function public.${fn}(<args>) from public, anon, authenticated;\n\n` +
        `    Template: ${MIGRATIONS}/20270224000100_revoke_friendships_freeze_identity_execute.sql\n` +
        `    A catalog-driven \`do $$\` loop does NOT count: it is a one-shot over the catalog as it\n` +
        `    stood when it ran, and every function created afterwards needs its own revoke.\n`,
    )
  }

  return { problems, live, entries, loopCovered }
}

function main() {
  if (!existsSync(MIGRATIONS) || !existsSync(LEDGER)) {
    console.error(
      `✗ check:function-grants — missing ${!existsSync(MIGRATIONS) ? MIGRATIONS : LEDGER} (cwd: ${process.cwd()}).`,
    )
    console.error('    Run from the repo root. A gate cannot pass over nothing.')
    process.exit(1)
  }

  const names = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  if (names.length < MIN_MIGRATIONS) {
    console.error(
      `✗ check:function-grants — found ${names.length} migration(s), expected at least ${MIN_MIGRATIONS}.`,
    )
    console.error('    That is a broken read, not a clean tree. Nothing below would mean anything.')
    process.exit(1)
  }
  const files = names.map((f) => ({ name: f, text: readFileSync(join(MIGRATIONS, f), 'utf8') }))

  const { problems, live, entries, loopCovered } = audit(files, readFileSync(LEDGER, 'utf8'))

  for (const p of problems) console.error(p)
  if (problems.length > 0) {
    console.error(`✗ Function-grant contract: ${problems.length} problem(s).`)
    process.exit(1)
  }

  const counts = { public: 0, authenticated: 0, internal: 0 }
  for (const [, { verdict }] of entries) counts[verdict]++
  console.log(
    `✓ Function-grant contract: ${live.size} live public function(s), every one with a verdict ` +
      `(${counts.public} public · ${counts.authenticated} authenticated · ${counts.internal} internal).`,
  )
  console.log(
    `  ⚠️ This read ${MIGRATIONS}/, NOT the database. Prod held 29 anon-executable and 49 ` +
      `authenticated-executable\n     SECURITY DEFINER functions in \`public\` when last measured ` +
      `(2026-08-17). Applied state is check:migrations' job.`,
  )
  console.log(
    `  ⚠️ ${counts.public} function(s) are declared reachable by \`anon\`. That is a DECLARATION, not` +
      ` a finding:\n     the gate cannot read a function body. OWN-006 is the open row that revisits it.`,
  )
  if (loopCovered.size > 0) {
    // Never let a declared exception read as ordinary coverage. It gets a line every single run.
    console.log(
      `  ⚠️ ${loopCovered.size} function(s) rest on a CATALOG LOOP rather than a named revoke: ` +
        `${[...loopCovered].sort().join(', ')}.\n     Verified to sort before their loop, so a replay ` +
        `covers them — but a named revoke is better, and OWN-006 carries it.`,
    )
  }
}

if (process.argv[1] && process.argv[1].endsWith('check-function-grants.mjs')) main()
