// Attach a Space's free site address (<slug>.frequencylocal.com) to the Frequency Vercel project (LIVE-1496).
// The in-app Publish button does this (setWebsitePublished -> addSiteSubdomain); a site published by SQL or a
// seed script skips it, so the address has no certificate and the browser closes the connection. Run this as the
// LAST step after pasting a seed. There is no wildcard domain on the project: each address is added one by one.
//
//   VERCEL_API_TOKEN=... VERCEL_PROJECT_ID=... VERCEL_TEAM_ID=... node scripts/attach-site-subdomain.mjs <slug>
//
// Idempotent: an address already on the project reports success. Exits 1 on a bad slug, missing config or a Vercel error.

const BASE_DOMAIN = 'frequencylocal.com'
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

const slug = (process.argv[2] ?? '').trim().toLowerCase()
if (!SLUG.test(slug)) {
  console.error('Usage: node scripts/attach-site-subdomain.mjs <slug>   (lowercase letters, digits and hyphens)')
  process.exit(1)
}

const token = process.env.VERCEL_API_TOKEN?.trim()
const projectId = process.env.VERCEL_PROJECT_ID?.trim()
const teamId = process.env.VERCEL_TEAM_ID?.trim()
if (!token || !projectId || !teamId) {
  console.error('Set VERCEL_API_TOKEN, VERCEL_PROJECT_ID and VERCEL_TEAM_ID first.')
  process.exit(1)
}

const host = `${slug}.${BASE_DOMAIN}`
const res = await fetch(
  `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/domains?teamId=${encodeURIComponent(teamId)}`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: host }),
  },
)
const json = await res.json().catch(() => ({}))
const code = json?.error?.code
const already = res.status === 409 && (code === 'domain_already_exists' || (code === 'domain_already_in_use' && json.error.projectId === projectId))

if (res.ok || already) {
  console.log(`${host} is attached to the project${already ? ' (it already was)' : ''}. Open https://${host} to confirm it loads.`)
} else {
  console.error(`Vercel refused ${host}: ${code || res.status}`)
  process.exit(1)
}
