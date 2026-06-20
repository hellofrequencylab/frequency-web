import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
// The static authz guard exposes its pure classifiers for testing (ADR-275 / B8). We drive
// the LIB scan — the confused-deputy / missing-gate class — against committed fixtures so the
// guard itself has a regression test, alongside the runtime scoping tests in this folder.
import {
  isUnguardedLibMutation,
  isUnguardedAction,
  scanFiles,
} from '../../scripts/check-authz-guards.mjs'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const read = (name: string) => readFileSync(join(FIXTURES, name), 'utf8')

// The fixture path passed to the classifier is the bare fixture name, so none of them collide
// with a real allowlist entry — the verdict comes purely from the heuristic, not the allowlist.
const classify = (name: string) => isUnguardedLibMutation(name, read(name))

describe('check:authz lib scan — confused-deputy / missing-gate class (B8, ADR-274/275)', () => {
  it('FLAGS an un-guarded, un-scoped lib mutation helper', () => {
    expect(classify('unguarded-lib-mutation.ts.txt')).toBe(true)
  })

  it('PASSES a lib mutation helper that binds its write to an ownership/scope column', () => {
    expect(classify('scoped-lib-mutation.ts.txt')).toBe(false)
  })

  it('PASSES a lib mutation helper that self-guards (requireAdmin)', () => {
    expect(classify('guarded-lib-mutation.ts.txt')).toBe(false)
  })

  it('PASSES a lib mutation helper consciously marked `// authz-delegated:`', () => {
    expect(classify('delegated-lib-mutation.ts.txt')).toBe(false)
  })

  it('IGNORES a pure reader (no insert/update/delete/upsert/rpc)', () => {
    expect(classify('reader-lib-helper.ts.txt')).toBe(false)
  })

  it('IGNORES a file that never touches the admin client', () => {
    expect(isUnguardedLibMutation('x.ts', 'export const x = 1\n')).toBe(false)
  })
})

describe('check:authz lib scan — scanFiles over the fixtures dir', () => {
  it('reports exactly the un-guarded fixture as a violation', () => {
    const files = readdirSync(FIXTURES)
      .filter((f) => f.endsWith('.ts.txt'))
      .map((f) => join(FIXTURES, f))
    const violations = scanFiles(files, isUnguardedLibMutation).map((p) => p.split('/').pop())
    expect(violations).toEqual(['unguarded-lib-mutation.ts.txt'])
  })
})

describe('check:authz action scan — regression for the original app/ heuristic', () => {
  it('FLAGS a use-server admin-client action with no guard', () => {
    const src = "'use server'\nimport { createAdminClient } from '@/lib/supabase/admin'\n" +
      'export async function act() { await createAdminClient().from("t").delete() }\n'
    expect(isUnguardedAction('app/x/actions.ts', src)).toBe(true)
  })

  it('PASSES the same action once it self-guards', () => {
    const src = "'use server'\nimport { createAdminClient } from '@/lib/supabase/admin'\n" +
      'export async function act() { await requireAdmin(); await createAdminClient().from("t").delete() }\n'
    expect(isUnguardedAction('app/x/actions.ts', src)).toBe(false)
  })
})
