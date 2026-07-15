'use server'

// Feature-funnel signup bridge (ADR-619). A feature funnel captures a name + email mid-demo and
// then hands the visitor into the SAME tested deferred-induction pipeline the cinematic induction
// uses: it stashes a minimal pending profile (name + a server-generated unique handle) in the
// fq_pending_induction cookie, stamps the fq_beta_seq cohort cookie for attribution, and returns.
// The client then calls the normal signInWithGoogle / signInWithMagicLink actions with
// next=/onboarding/beta/complete, and the existing finalizer writes the profile, tags the cohort,
// applies grants, and lands them. Nothing about signup is forked — this only pre-fills the stash.
//
// authz-ok: intentionally PUBLIC + anonymous (a signed-out visitor starting signup, same as the
// deferred induction's stashPendingInduction). There is no caller to authorize. The admin client is
// used ONLY for a handle-existence check (equivalent to the public /api/check-handle) and the writes
// are cookies on the caller's OWN browser — no cross-user read, no privileged write to any row.

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { stashPendingInduction } from './actions'

const BETA_SEQ_COOKIE = 'fq_beta_seq'

// "Daniel Tyack" -> "danieltyack" (mirrors the induction's suggestHandle).
function baseHandle(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24) || 'member'
}

/** A handle not already taken. Tries the base, then base2..base9, then a short random suffix, so a
 *  feature-funnel signup never dies on a unique-violation the visitor can't see or fix. Best-effort:
 *  a lookup hiccup falls back to a random-suffixed handle rather than blocking the join. */
async function uniqueHandle(name: string): Promise<string> {
  const base = baseHandle(name)
  const db = createAdminClient()
  const taken = async (h: string): Promise<boolean> => {
    try {
      const { data } = await db.from('profiles').select('id').eq('handle', h).maybeSingle()
      return !!data
    } catch {
      return false
    }
  }
  if (!(await taken(base))) return base
  for (let n = 2; n <= 9; n++) {
    const candidate = `${base}${n}`.slice(0, 30)
    if (!(await taken(candidate))) return candidate
  }
  return `${base}${Math.random().toString(36).slice(2, 6)}`.slice(0, 30)
}

/**
 * Prime the deferred-induction stash from a feature funnel's captured lead, then let the client
 * trigger the normal sign-in. Returns nothing sensitive; the redirect/auth is the client's next step.
 */
export async function beginFeatureFunnelSignup(input: {
  name: string
  email: string
  seq: string
}): Promise<{ ok: true }> {
  const name = (input.name ?? '').trim().slice(0, 120) || 'Member'
  const seq = (input.seq ?? '').trim().slice(0, 80)

  // Stamp the cohort cookie so the shared /complete path tags this member beta_<slug>, exactly like
  // the cinematic induction. Consumed-and-cleared at completion (writeBetaInduction).
  if (seq) {
    ;(await cookies()).set(BETA_SEQ_COOKIE, seq, {
      path: '/',
      maxAge: 60 * 30,
      sameSite: 'lax',
    })
  }

  // Park a minimal profile (name + a unique handle; everything else blank) in the pending-induction
  // cookie. The finalizer writes it through the tested writeBetaInduction path after sign-in.
  await stashPendingInduction({
    displayName: name,
    handle: await uniqueHandle(name),
    bio: '',
    location: '',
    lat: null,
    lng: null,
    intent: '',
    interests: '',
    heardAbout: '',
    oaths: [],
  })

  return { ok: true }
}
