// ─────────────────────────────────────────────────────────────────────────────
// UNREFERENCED pnpm STORE ENTRIES, FOUND BY REACHABILITY RATHER THAN BY NAME (backlog HYG-016).
//
// 🔴 THE FAILURE THIS EXISTS FOR, and it is a DEADLOCK rather than a regression. On 2026-08-24
// every production deploy and every preview deploy in the repo failed on the same line:
//
//     🔴 check:cache-budget — node_modules is 1.39 GiB, over the 1.25 GiB floor budget.
//
// The install had not grown. A build of the SAME lockfile that happened to start from a cold cache
// measured `node_modules 932 MiB` and passed, twenty minutes earlier, on the same day. The 458 MiB
// between those two readings was orphaned store entries: `pnpm install --frozen-lockfile` writes
// the versions the lockfile asks for and does NOT remove the versions it no longer asks for, so a
// tree restored from a cache taken before a dependency bump carries BOTH copies of everything the
// bump moved.
//
// That makes it self-sustaining, which is the part worth naming: a failed build uploads no cache,
// so the stale cache survives, so the next build restores it and fails the same way. Nothing in the
// repo could clear it. Every deploy was blocked on a human manually redeploying without the cache.
//
// 🔴 AND THE GATE'S OWN COMMENT SAID THIS COULD NOT HAPPEN. check-cache-budget.mjs read:
//
//     "A Vercel build installs from the lockfile into an empty tree and never has them."
//
// It does not. `@vercel/next`'s `prepareCache` caches `node_modules/**` — the same file says so
// eighty lines higher up — so a Vercel build installs into a RESTORED tree and has exactly the
// condition the comment ruled out. The premise was written from a dev container and was never
// re-tested against the thing it was a claim about (AGENTS.md: a blocker phrased as "cannot
// happen" is a claim with an expiry date).
//
// ── HOW AN ORPHAN IS IDENTIFIED, and why it is not a lockfile diff ───────────────────────────
// Not by parsing `pnpm-lock.yaml`: the mapping from a lockfile entry to a `.pnpm` directory name
// encodes peer-dependency suffixes and a hash (`next@16.3.2_@babel+core@7.29.7_…_4a13d44b`), and a
// prune that deletes on a name it derived slightly wrong deletes a package that is in use.
//
// By REACHABILITY, over the same symlink graph Node's own resolver walks:
//
//     roots   node_modules/*  and  node_modules/.pnpm/node_modules/*   (both scope-aware)
//     edge    a symlink whose resolved target lands inside .pnpm/<entry>/
//     orphan  a .pnpm/<entry> no path from a root reaches
//
// If no chain of symlinks from a root reaches an entry, no `import` or `require` can resolve into
// it either. That is a property of the graph, not an inference about it. The closure has to start
// AT THE ROOTS rather than counting any inbound link: an orphan's own nested node_modules still
// links to its dependencies, so "referenced by something" would keep a whole orphaned subtree alive.
//
// ── WHY DELETING IS SAFE HERE, stated as a bound rather than as confidence ───────────────────
// The 2026-08-18 trim that hung two builds for 46 minutes deleted the incremental FETCH cache —
// something only the network could rebuild, three workers deep, mid-prerender. node_modules is the
// opposite case: it is fully reconstructible from `pnpm-lock.yaml` by the install step that runs
// before every build, and repairing it is what that step is FOR. So the worst case of a wrong
// deletion here is a slower install on the next build, not a build that does not finish.
//
// This module only FINDS. Deleting is the caller's decision, and check-cache-budget.mjs takes it
// only when the floor arm is already over budget and about to fail the build anyway.
// ─────────────────────────────────────────────────────────────────────────────
import { readdirSync, readlinkSync, existsSync } from 'node:fs'
import path from 'node:path'

/** Every symlink directly under `dir`, descending ONE level into `@scope/` directories because
 *  that is where pnpm puts scoped packages and they are not symlinks themselves. */
function symlinksIn(dir) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out // absent or unreadable contributes no edges rather than crashing a build
  }
  for (const entry of entries) {
    const child = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) out.push(child)
    else if (entry.isDirectory() && entry.name.startsWith('@')) out.push(...symlinksIn(child))
  }
  return out
}

/** The `.pnpm/<entry>` a symlink lands in, or null if it points anywhere else. Resolved against the
 *  link's own directory: pnpm's links are RELATIVE (`../@babel+core@7.29.7/node_modules/@babel/core`)
 *  and most of them do not contain the substring `.pnpm` at all, so matching on the raw target text
 *  finds 53 of 802 entries and would report the other 749 as orphans. */
function entryOf(link, storeAbs) {
  let target
  try {
    target = readlinkSync(link)
  } catch {
    return null
  }
  const abs = path.resolve(path.dirname(link), target)
  if (!abs.startsWith(storeAbs + path.sep)) return null
  return abs.slice(storeAbs.length + 1).split(path.sep)[0]
}

/**
 * @param {string} root  a directory containing `node_modules/`
 * @returns {{store: string|null, entries: string[], reachable: Set<string>, orphans: string[]}}
 *   `store` is null when there is no pnpm store to reason about (a npm/yarn tree, or no install),
 *   in which case there are no orphans and the caller should do nothing.
 */
export function pnpmOrphans(root) {
  const store = path.resolve(root, 'node_modules/.pnpm')
  if (!existsSync(store)) return { store: null, entries: [], reachable: new Set(), orphans: [] }

  const entries = readdirSync(store, { withFileTypes: true })
    // `.pnpm/node_modules` is pnpm's hoisted symlink directory, not a package entry. It is a ROOT
    // below, never a candidate for deletion.
    .filter((e) => e.isDirectory() && e.name !== 'node_modules')
    .map((e) => e.name)
  const all = new Set(entries)

  const reachable = new Set()
  const queue = []
  const visit = (name) => {
    if (name && all.has(name) && !reachable.has(name)) {
      reachable.add(name)
      queue.push(name)
    }
  }

  const roots = [
    ...symlinksIn(path.resolve(root, 'node_modules')),
    ...symlinksIn(path.join(store, 'node_modules')),
  ]
  for (const link of roots) visit(entryOf(link, store))
  while (queue.length > 0) {
    const name = queue.pop()
    for (const link of symlinksIn(path.join(store, name, 'node_modules'))) visit(entryOf(link, store))
  }

  return { store, entries, reachable, orphans: entries.filter((e) => !reachable.has(e)) }
}
