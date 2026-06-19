// Seed ONE demo PRACTITIONER Space so the networked entity profile renders end-to-end
// (ENTITY-SPACES-BUILD Phase 1 / Epic 1.10). Idempotent + service-role only — run it once and the
// profile at /spaces/demo-practitioner is live with a brand, a type, and a couple of sample
// offerings. Re-running updates in place (upsert on slug / event slug), never duplicates.
//
//   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
//     node --experimental-strip-types scripts/seed-demo-space.mts
//
// Optional: DEMO_OWNER_PROFILE_ID=<a profiles.id> to own the Space (else the first active,
// non-system profile is used; falls back to ownerless if none exists).
//
// What it creates:
//   • spaces row: slug 'demo-practitioner', type 'practitioner', visibility 'network',
//     skin 'dawn', a brand name, owned by the chosen profile, on the root money entity.
//   • two upcoming `events` scoped to the Space (space_id = the new Space) so the Offerings /
//     Book tabs render real cards.
// Copy obeys CONTENT-VOICE §10 (plain, concrete, no em/en dashes, no narrated feelings).

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('✖ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const SLUG = 'demo-practitioner'
const REST = `${URL}/rest/v1`
const auth = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<unknown> {
  const headers: Record<string, string> = { ...auth }
  if (init.prefer) headers.Prefer = init.prefer
  const res = await fetch(`${REST}/${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${body}`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function main() {
  // 1) The root money entity (every Space's commerce posts to an entity; the demo reuses root's).
  const rootRows = (await rest(`spaces?type=eq.root&select=id,entity_id&limit=1`)) as { id: string; entity_id: string }[]
  const root = rootRows[0]
  if (!root) {
    console.error('✖ No root space found — apply the spaces migrations first.')
    process.exit(1)
  }

  // 2) Pick an owner profile: the env override, else the first active non-system profile.
  let ownerId = process.env.DEMO_OWNER_PROFILE_ID ?? null
  if (!ownerId) {
    const rows = (await rest(
      `profiles?is_active=eq.true&is_system=eq.false&select=id&order=created_at.asc&limit=1`,
    )) as { id: string }[]
    ownerId = rows[0]?.id ?? null
  }
  if (!ownerId) {
    console.warn('⚠ No owner profile found — the Space will be ownerless (still renders).')
  }

  // 3) Upsert the demo Practitioner Space (idempotent on the unique slug).
  const spacePayload = {
    slug: SLUG,
    name: 'River Method',
    type: 'practitioner',
    status: 'active',
    entity_id: root.entity_id,
    skin: 'dawn',
    network_connected: true,
    visibility: 'network',
    plan: 'free',
    entitlements: {},
    owner_profile_id: ownerId,
    brand_name: 'River Method',
    brand_logo_url: null,
    brand_accent: null,
  }
  const spaceRows = (await rest(`spaces?on_conflict=slug`, {
    method: 'POST',
    body: JSON.stringify(spacePayload),
    prefer: 'resolution=merge-duplicates,return=representation',
  })) as { id: string; slug: string }[]
  const space = spaceRows[0]
  console.log(`✓ Space upserted: ${space.slug} (${space.id})`)

  // 4) Upsert a couple of sample OFFERINGS (events) scoped to the Space. Plain, concrete copy.
  const now = Date.now()
  const inDays = (d: number) => new Date(now + d * 86_400_000).toISOString()
  const offerings = [
    {
      slug: `${SLUG}-morning-reset`,
      title: 'Morning reset: 30 minutes of breath and quiet',
      description: 'Start the day slow. A short breathing practice and a few minutes of quiet, before your coffee.',
      starts_at: inDays(3),
      ends_at: inDays(3),
    },
    {
      slug: `${SLUG}-1-1-intro-session`,
      title: '1:1 intro session',
      description: 'A first sit together. We pick one practice to try this week and figure out what fits your day.',
      starts_at: inDays(7),
      ends_at: inDays(7),
    },
  ]
  for (const o of offerings) {
    await rest(`events?on_conflict=slug`, {
      method: 'POST',
      body: JSON.stringify({
        ...o,
        host_id: ownerId,
        scope_id: space.id,
        scope_type: 'space',
        is_cancelled: false,
        space_id: space.id,
      }),
      prefer: 'resolution=merge-duplicates,return=minimal',
    })
    console.log(`  ✓ Offering upserted: ${o.slug}`)
  }

  console.log(`\n✓ Done. View the profile at: /spaces/${SLUG}`)
}

main().catch((err) => {
  console.error('✖ Seed failed:', err.message)
  process.exit(1)
})
