// A guard that only fires for signed-in callers cannot protect anything from an anonymous one.
//
// ADR-961. Two SECURITY DEFINER RPCs shipped with this shape:
//
//   if auth.uid() is not null
//      and coalesce(private.get_my_web_role(), 'none') not in ('admin', 'janitor') then
//     raise exception 'not authorized ...';
//   end if;
//
// For an anonymous caller `auth.uid()` is NULL, the first conjunct is false, the exception
// never raises, and execution falls straight through to the data. A signed-in ordinary member
// is blocked; a stranger is not. It reads as a check and behaves as a welcome mat. Paired with
// the ADR-959 grant hole (`REVOKE ... FROM public` does not remove Supabase's explicit per-role
// default grants), both locks were open on the same pair of functions at once.
//
// The rule this encodes: an authorization guard must key on something EVERY caller has.
// `auth.role()` is non-null for anon, authenticated and service_role alike; `auth.uid()` is
// null for exactly the caller you are trying to keep out.
//
// Scope note: this fails only the specific INVERTED-GUARD shape — `auth.uid() is not null`
// used as the opening conjunct of an authorization test. `auth.uid() is not null` is perfectly
// correct elsewhere (an RLS predicate, an ownership comparison, a null-guard before a write),
// so the pattern below is deliberately narrow rather than a ban on the expression.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join('supabase', 'migrations')

/** `auth.uid() is not null` followed, within the same boolean expression, by a role test that
 *  raises. Whitespace- and newline-tolerant, because the real instances wrapped the line. */
const INVERTED_GUARD =
  /auth\.uid\(\)\s+is\s+not\s+null\s+and[\s\S]{0,240}?not\s+in\s*\([^)]*?(?:'admin'|'janitor'|'owner')[\s\S]{0,120}?raise\s+exception/gi

/** The corrected shape, so the test documents what to write instead. */
const CORRECT_GUARD = /auth\.role\(\)\s+is\s+distinct\s+from\s+'service_role'/i

/**
 * Migrations that CONTAIN the bad shape and are allowed to keep it, because a later migration
 * corrects the live function with `create or replace`. A migration file is history: editing it
 * would make the repo describe an apply that never happened, and would not change the database.
 *
 * Every entry names the migration that supersedes it. An entry with no superseder is a bug in
 * this list, not a licence.
 */
const SUPERSEDED: Readonly<Record<string, string>> = {
  '20270116000000_delete_topical_channel.sql': '20270216000000_insights_rpcs_fail_open_guard_and_grants.sql',
  '20270207000000_insights_journey_and_vitals_rpcs.sql':
    '20270216000000_insights_rpcs_fail_open_guard_and_grants.sql',
}

/**
 * The ADR-959 population, frozen. `REVOKE ... FROM public` was the house idiom for a long time,
 * so this is historical debt measured once, not a wall thrown up in front of it (ADR-928's
 * ratchet shape, applied here). Most of these were later closed by the explicit lockdown
 * migrations — `20261005000000`, `20261185000000`, `20270104000000` — which is why the count is
 * an idiom census and not a live-exposure count. It may only ever SHRINK: a new instance is a
 * new bug, and the two that mattered (journey_funnel, vitals_p75) are ADR-961.
 *
 * To lower it: fix the instances, re-run, and write the new number here with the reason.
 */
const REVOKE_FROM_PUBLIC_BASELINE = 19

describe('SQL authorization guards fail closed for anonymous callers', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql'))

  it('has migrations to scan', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('no migration uses the inverted `auth.uid() is not null` authorization guard', () => {
    const offenders: string[] = []

    for (const file of files) {
      const sql = readFileSync(join(DIR, file), 'utf8')
      // Strip line comments so the ADR-961 migration's own explanatory header — which quotes
      // the bad pattern verbatim to explain it — does not trip its own guard.
      const code = sql
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')

      for (const match of code.matchAll(INVERTED_GUARD)) {
        if (SUPERSEDED[file]) continue
        const line = code.slice(0, match.index ?? 0).split('\n').length
        offenders.push(`${file}:~${line}`)
      }
    }

    expect(
      offenders,
      [
        'An authorization guard opens with `auth.uid() is not null`, so it is SKIPPED for the',
        'anonymous caller it is meant to stop (ADR-961). Key on auth.role() instead:',
        '',
        "  if auth.role() is distinct from 'service_role'",
        "     and coalesce(private.get_my_web_role(), 'none') not in ('admin', 'janitor') then",
        '',
        'Offenders:',
        ...offenders,
      ].join('\n'),
    ).toEqual([])
  })

  it('every superseded migration names a corrector that exists and is newer', () => {
    for (const [bad, fix] of Object.entries(SUPERSEDED)) {
      expect(files, `${bad} is allowlisted but absent`).toContain(bad)
      expect(files, `${bad} names a corrector that does not exist: ${fix}`).toContain(fix)
      expect(fix > bad, `${fix} must sort AFTER ${bad} to actually correct it`).toBe(true)
    }
  })

  it('the ADR-961 migration ships the corrected guard', () => {
    const fix = files.find((f) => f.includes('insights_rpcs_fail_open_guard'))
    expect(fix, 'the ADR-961 migration is missing').toBeTruthy()
    const sql = readFileSync(join(DIR, fix!), 'utf8')
    expect(CORRECT_GUARD.test(sql)).toBe(true)
    // Both locks, not one: the guard AND the grant revoked from the roles that actually held it.
    expect(sql).toMatch(/revoke\s+execute\s+on\s+function\s+public\.journey_funnel[^;]*from\s+anon,\s*authenticated/i)
    expect(sql).toMatch(/revoke\s+execute\s+on\s+function\s+public\.vitals_p75[^;]*from\s+anon,\s*authenticated/i)
  })

  it('`revoke ... from public` is never the ONLY revoke for a function grant (ADR-959)', () => {
    // Supabase's ALTER DEFAULT PRIVILEGES grants land as explicit per-role grants, which
    // `REVOKE ... FROM public` does not touch. A migration that revokes only from public and
    // then grants to service_role believes it locked something it did not.
    const offenders: string[] = []
    for (const file of files) {
      const code = readFileSync(join(DIR, file), 'utf8')
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')

      // Functions this file revokes from public, and functions it revokes from anon by name.
      const fromPublic = new Set(
        [...code.matchAll(/revoke\s+(?:all|execute)\s+on\s+function\s+([\w.]+)\s*\([^)]*\)\s+from\s+public/gi)].map(
          (m) => m[1].toLowerCase(),
        ),
      )
      const byName = new Set(
        [...code.matchAll(/revoke\s+(?:all|execute)\s+on\s+function\s+([\w.]+)\s*\([^)]*\)\s+from\s+[^;]*\banon\b/gi)].map(
          (m) => m[1].toLowerCase(),
        ),
      )
      for (const fn of fromPublic) if (!byName.has(fn)) offenders.push(`${file}: ${fn}`)
    }

    expect(
      offenders.length,
      [
        `The \`revoke ... from public\` census is ${offenders.length}, baseline ${REVOKE_FROM_PUBLIC_BASELINE}.`,
        '',
        offenders.length > REVOKE_FROM_PUBLIC_BASELINE
          ? [
              'A NEW instance was added. `REVOKE ... FROM public` does not remove the explicit',
              "anon/authenticated grants Supabase's ALTER DEFAULT PRIVILEGES creates on every new",
              'function (ADR-959) — the statement succeeds and removes nothing. Revoke the roles',
              'BY NAME as well:',
              '',
              '  revoke execute on function public.thing(uuid) from anon, authenticated;',
            ].join('\n')
          : [
              'The census FELL, which is the point. Lower REVOKE_FROM_PUBLIC_BASELINE to',
              `${offenders.length} and record which instances were fixed and why.`,
            ].join('\n'),
        '',
        'Census:',
        ...offenders,
      ].join('\n'),
    ).toBe(REVOKE_FROM_PUBLIC_BASELINE)
  })
})
