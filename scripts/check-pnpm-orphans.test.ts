import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error — .mjs sibling, no d.ts by design (this is a build script, not app code)
import { pnpmOrphans } from './lib/pnpm-orphans.mjs'

// THE GATE THAT NOTICES (backlog HYG-016). scripts/lib/pnpm-orphans.mjs decides which pnpm store
// entries check:cache-budget may DELETE on a real production build, so its two failure modes are
// not symmetric and both are tested here on a fixture rather than on this repo's own tree:
//
//   too FEW orphans   the deadlock stays. Every deploy keeps failing at 1.39 GiB. Recoverable.
//   too MANY orphans  a package in use is deleted from the cache. Bounded — `pnpm install` refetches
//                     it — but it is the direction that costs, so the fixture asserts the exact set.
//
// The repo's own node_modules is the positive control in the last case: a tree pnpm installed from
// the lockfile has no orphans, and a walk that reported any would be about to delete a live package.

const STORE = 'node_modules/.pnpm'

/** Build a pnpm-shaped tree: `.pnpm/<entry>/node_modules/<pkg>` real, linked from the roots. */
function makeTree(root: string, spec: { entries: Record<string, string>; top: Record<string, string> }) {
  for (const [entry, pkg] of Object.entries(spec.entries)) {
    mkdirSync(join(root, STORE, entry, 'node_modules', pkg), { recursive: true })
    writeFileSync(join(root, STORE, entry, 'node_modules', pkg, 'index.js'), '')
  }
  mkdirSync(join(root, 'node_modules'), { recursive: true })
  for (const [pkg, entry] of Object.entries(spec.top)) {
    const link = join(root, 'node_modules', pkg)
    mkdirSync(join(link, '..'), { recursive: true })
    // Relative to the LINK's own directory, exactly as pnpm writes it: a scoped package sits one
    // level deeper, so its target starts `../.pnpm/`. Getting this wrong in the fixture is the same
    // mistake the walk itself must not make.
    const up = pkg.startsWith('@') ? join('..', '.pnpm') : '.pnpm'
    symlinkSync(join(up, entry, 'node_modules', pkg), link, 'dir')
  }
}

describe('pnpm store entries nothing can reach', () => {
  let root: string
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'pnpm-orphans-'))
    // The real 2026-08-24 shape: a cache taken before a bump, restored after it. `next` moved
    // 16.3.1 -> 16.3.2 and BOTH copies are on disk; only the new one is linked. `left-pad` is a
    // dependency OF the orphan, reachable only through it — the case that makes the closure start
    // at the roots rather than counting inbound links.
    makeTree(root, {
      entries: {
        'next@16.3.1': 'next',
        'next@16.3.2': 'next',
        'only-the-orphan-needs-me@1.0.0': 'only-the-orphan-needs-me',
        '@scope+pkg@2.0.0': '@scope/pkg',
      },
      top: { next: 'next@16.3.2', '@scope/pkg': '@scope+pkg@2.0.0' },
    })
    symlinkSync(
      join('..', '..', 'only-the-orphan-needs-me@1.0.0', 'node_modules', 'only-the-orphan-needs-me'),
      join(root, STORE, 'next@16.3.1', 'node_modules', 'only-the-orphan-needs-me'),
      'dir',
    )
  })
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('names the superseded copy, and nothing else', () => {
    const { orphans } = pnpmOrphans(root)
    expect(orphans.sort()).toEqual(['next@16.3.1', 'only-the-orphan-needs-me@1.0.0'])
  })

  it('keeps a package reached only through a .bin shim, because deleting is the costly direction', () => {
    // `.bin` is not a package directory, so a walk that only descends into `@scope` never sees the
    // shims inside it. A CLI-only dependency normally ALSO carries an ordinary sibling symlink, so
    // this is a hole rather than a known leak — pinned anyway, because under-counting reachability
    // is precisely the direction that deletes something in use.
    const root = mkdtempSync(join(tmpdir(), 'pnpm-bin-'))
    try {
      makeTree(root, { entries: { 'some-cli@1.0.0': 'some-cli' }, top: {} })
      mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true })
      symlinkSync(
        join('..', '.pnpm', 'some-cli@1.0.0', 'node_modules', 'some-cli', 'index.js'),
        join(root, 'node_modules', '.bin', 'some-cli'),
      )
      expect(pnpmOrphans(root).orphans).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps the linked copy and the scoped package, which are what a wrong walk deletes', () => {
    const { reachable } = pnpmOrphans(root)
    expect(reachable.has('next@16.3.2'), 'the version the lockfile asks for').toBe(true)
    expect(reachable.has('@scope+pkg@2.0.0'), 'scoped packages are a directory, not a symlink').toBe(true)
  })

  it('does nothing at all without a pnpm store, so a npm or yarn tree is never touched', () => {
    const bare = mkdtempSync(join(tmpdir(), 'no-pnpm-'))
    try {
      expect(pnpmOrphans(bare)).toMatchObject({ store: null, orphans: [] })
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }
  })

  it("finds none in this repo's own installed tree — the control that a live package is never deleted", () => {
    const { store, entries, orphans } = pnpmOrphans(join(__dirname, '..'))
    if (store === null) return // no install here; the fixture cases above still ran
    expect(entries.length, 'the walk must see a real store, or it proves nothing').toBeGreaterThan(100)
    expect(orphans, `these would be DELETED from a real build cache:\n${orphans.join('\n')}`).toEqual([])
  })
})
