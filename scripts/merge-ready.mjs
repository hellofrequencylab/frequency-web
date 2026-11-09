#!/usr/bin/env node
// Merge-base check for the single merge driver. Usage: node scripts/merge-ready.mjs <pr> [<pr> ...]
// Needs GITHUB_TOKEN (or GH_TOKEN). Prints READY or WAIT per PR and exits 1 if any PR waits.
//
// WHY. A PR can be green on its own preview and still turn main red once it lands next to another
// PR that added weight (2026-11-03: check:shell-weight on `/`, 451 KB against 450). The Vercel
// preview runs the same `postbuild` gates as production, so the only honest "green" is a preview
// built on a head that already contains today's main. READY means: the PR head contains main's
// head, and the Vercel status for that head is success. Otherwise merge main in, push once, wait.
const repo = process.env.GITHUB_REPOSITORY || 'hellofrequencylab/frequency-web'
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
if (!token) {
  console.error('merge-ready: set GITHUB_TOKEN or GH_TOKEN')
  process.exit(2)
}
const api = async (path) => {
  const res = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json()
}

const prs = process.argv.slice(2).filter((a) => /^\d+$/.test(a))
if (prs.length === 0) {
  console.error('usage: node scripts/merge-ready.mjs <pr> [<pr> ...]')
  process.exit(2)
}

const main = await api('commits/main')
let waiting = 0
for (const n of prs) {
  const pr = await api(`pulls/${n}`)
  const reasons = []
  if (pr.draft) reasons.push('draft')
  const cmp = await api(`compare/${main.sha}...${pr.head.sha}`)
  if (cmp.behind_by > 0) reasons.push(`head is ${cmp.behind_by} commit(s) behind main ${main.sha.slice(0, 7)}`)
  const status = await api(`commits/${pr.head.sha}/status`)
  const vercel = status.statuses.find((s) => s.context === 'Vercel')
  if (!vercel) reasons.push('no Vercel status on this head')
  else if (vercel.state !== 'success') reasons.push(`Vercel is ${vercel.state}`)
  if (reasons.length) waiting++
  console.log(`#${n} ${reasons.length ? 'WAIT: ' + reasons.join('; ') : 'READY'}`)
}
process.exit(waiting ? 1 : 0)
