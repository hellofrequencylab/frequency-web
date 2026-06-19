// Seed ONE demo Space PER ROLE so every networked entity profile renders end-to-end
// (ENTITY-SPACES-BUILD Phase 1, Wave A + Wave B). Idempotent + service-role only. Run it once and
// /spaces/demo-practitioner, /spaces/demo-business, /spaces/demo-organization, and
// /spaces/demo-coaching are all live with a brand, a type, an about + tagline, and a couple of
// sample offerings each. Re-running upserts in place (on slug / event slug), never duplicates.
//
//   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
//     node --experimental-strip-types scripts/seed-demo-space.mts
//
// Optional: DEMO_OWNER_PROFILE_ID=<a profiles.id> to own every demo Space (else the first active,
// non-system profile is used; falls back to ownerless if none exists).
//
// What it creates, for each of the four roles:
//   • a spaces row: a demo-<role> slug, the role `type`, visibility 'network', status 'active',
//     skin 'dawn', a brand name, an about + tagline, owned by the chosen profile, on the root
//     money entity (every Space's commerce posts to an entity; the demo reuses root's).
//   • one or two upcoming `events` scoped to the Space (space_id = the new Space) so the
//     Offerings / Classes / Programs and the join/donate/enroll tabs render real cards.
// Copy obeys CONTENT-VOICE §10 (plain, concrete, no em/en dashes, no narrated feelings).

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('✖ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

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

// One demo Space to seed: the spaces row fields + its sample offerings. `slug` keys the upsert.
interface DemoSpace {
  slug: string
  name: string
  type: 'practitioner' | 'business' | 'organization' | 'coaching'
  brandName: string
  tagline: string
  about: string
  offerings: { suffix: string; title: string; description: string; inDays: number }[]
}

// The four demos. One per registered role blueprint (lib/spaces/blueprints.ts). All share skin
// 'dawn' (the Wave B blueprints reuse the Practitioner skin) and the root money entity.
const DEMOS: DemoSpace[] = [
  {
    slug: 'demo-practitioner',
    name: 'River Method',
    type: 'practitioner',
    brandName: 'River Method',
    tagline: 'Breath and quiet, one short practice at a time.',
    about:
      'River Method is a small practice run by one teacher. We keep it simple: a few minutes of breath, a few minutes of quiet, and one practice to carry into your week. Sessions are short and there is no jargon.',
    offerings: [
      {
        suffix: 'morning-reset',
        title: 'Morning reset: 30 minutes of breath and quiet',
        description: 'Start the day slow. A short breathing practice and a few minutes of quiet, before your coffee.',
        inDays: 3,
      },
      {
        suffix: '1-1-intro-session',
        title: '1:1 intro session',
        description: 'A first sit together. We pick one practice to try this week and figure out what fits your day.',
        inDays: 7,
      },
    ],
  },
  {
    slug: 'demo-business',
    name: 'Stillwater Studio',
    type: 'business',
    brandName: 'Stillwater Studio',
    tagline: 'A neighborhood studio for classes you actually come back to.',
    about:
      'Stillwater Studio is a movement and breath studio on the corner of Third and Main. We run weekly classes, keep the rooms small, and know your name by the second visit. Drop in for one class or become a member.',
    offerings: [
      {
        suffix: 'slow-flow',
        title: 'Slow flow: Tuesday evenings',
        description: 'A 45-minute class at an easy pace. Mats and props are here. Come straight from work.',
        inDays: 2,
      },
      {
        suffix: 'saturday-breathwork',
        title: 'Saturday breathwork',
        description: 'A morning breathwork class in the big room. Bring water and a friend if you want.',
        inDays: 5,
      },
    ],
  },
  {
    slug: 'demo-organization',
    name: 'Open Hands',
    type: 'organization',
    brandName: 'Open Hands',
    tagline: 'Neighbors helping neighbors get a warm meal.',
    about:
      'Open Hands is a small non-profit that runs a weekly community meal and a food pantry. Volunteers cook, serve, and pack boxes every week. Donations cover the groceries and keep the lights on.',
    offerings: [
      {
        suffix: 'community-meal',
        title: 'Thursday community meal',
        description: 'A free sit-down dinner for anyone who shows up. Come early to help set the tables.',
        inDays: 4,
      },
      {
        suffix: 'pantry-volunteer-day',
        title: 'Pantry volunteer day',
        description: 'A morning of packing grocery boxes for pickup. No experience needed. Coffee is on us.',
        inDays: 6,
      },
    ],
  },
  {
    slug: 'demo-coaching',
    name: 'Northlight Coaching',
    type: 'coaching',
    brandName: 'Northlight Coaching',
    tagline: 'A six-week cohort to build a habit that sticks.',
    about:
      'Northlight Coaching runs small cohorts that meet once a week for six weeks. Each week has one lesson and one practice to try, plus a group call to talk through what worked. You leave with a habit, not a binder.',
    offerings: [
      {
        suffix: 'cohort-call-week-1',
        title: 'Cohort call: week 1',
        description: 'The first live call of the cohort. We set one goal each and pick the practice for the week.',
        inDays: 3,
      },
      {
        suffix: 'office-hours',
        title: 'Open office hours',
        description: 'A drop-in call to ask anything between lessons. Bring the spot you are stuck on.',
        inDays: 8,
      },
    ],
  },
]

async function seedSpace(demo: DemoSpace, rootEntityId: string, ownerId: string | null): Promise<void> {
  // 1) Upsert the demo Space (idempotent on the unique slug).
  const spacePayload = {
    slug: demo.slug,
    name: demo.name,
    type: demo.type,
    status: 'active',
    entity_id: rootEntityId,
    skin: 'dawn',
    network_connected: true,
    visibility: 'network',
    plan: 'free',
    entitlements: {},
    owner_profile_id: ownerId,
    brand_name: demo.brandName,
    brand_logo_url: null,
    brand_accent: null,
    about: demo.about,
    tagline: demo.tagline,
  }
  const spaceRows = (await rest(`spaces?on_conflict=slug`, {
    method: 'POST',
    body: JSON.stringify(spacePayload),
    prefer: 'resolution=merge-duplicates,return=representation',
  })) as { id: string; slug: string }[]
  const space = spaceRows[0]
  console.log(`✓ Space upserted: ${space.slug} (${space.id})`)

  // 2) Upsert the sample OFFERINGS (events) scoped to the Space. Plain, concrete copy.
  const now = Date.now()
  const inDays = (d: number) => new Date(now + d * 86_400_000).toISOString()
  for (const o of demo.offerings) {
    await rest(`events?on_conflict=slug`, {
      method: 'POST',
      body: JSON.stringify({
        slug: `${demo.slug}-${o.suffix}`,
        title: o.title,
        description: o.description,
        starts_at: inDays(o.inDays),
        ends_at: inDays(o.inDays),
        host_id: ownerId,
        // events.scope_type CHECK allows circle/region/cluster/group/standalone/public (NOT
        // 'space'); space ownership is the separate space_id column, so the offering is a
        // 'standalone' event owned by the Space (scope_id = space_id = the Space id).
        scope_id: space.id,
        scope_type: 'standalone',
        is_cancelled: false,
        space_id: space.id,
      }),
      prefer: 'resolution=merge-duplicates,return=minimal',
    })
    console.log(`  ✓ Offering upserted: ${demo.slug}-${o.suffix}`)
  }
}

async function main() {
  // 1) The root money entity (every Space's commerce posts to an entity; the demos reuse root's).
  const rootRows = (await rest(`spaces?type=eq.root&select=id,entity_id&limit=1`)) as { id: string; entity_id: string }[]
  const root = rootRows[0]
  if (!root) {
    console.error('✖ No root space found. Apply the spaces migrations first.')
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
    console.warn('⚠ No owner profile found. The demo Spaces will be ownerless (still render).')
  }

  // 3) Seed every demo Space (one per role blueprint), idempotently.
  for (const demo of DEMOS) {
    await seedSpace(demo, root.entity_id, ownerId)
  }

  console.log(`\n✓ Done. View the profiles at:`)
  for (const demo of DEMOS) console.log(`  • /spaces/${demo.slug}`)
}

main().catch((err) => {
  console.error('✖ Seed failed:', err.message)
  process.exit(1)
})
