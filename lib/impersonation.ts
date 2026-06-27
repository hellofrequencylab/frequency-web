import 'server-only'
import { cookies } from 'next/headers'

// Janitor "Act as member" (identity impersonation). A real janitor swaps their
// Supabase session for a member's, so the WHOLE stack — every read and write —
// genuinely runs as that member (their feed, settings, posts, gems). The janitor's
// own session is stashed in this httpOnly cookie so Exit restores it EXACTLY (no
// re-minting, so a forged cookie can only ever produce an invalid session, never a
// session for an arbitrary user — there is no privilege-escalation path through Exit).
//
// SECURITY: entering is gated on the REAL janitor web_role, checked server-side
// before the swap (impersonate-actions.ts). Both enter and exit are audited.

export const IMPERSONATION_COOKIE = 'freq-act-as'

export interface ImpersonationStash {
  /** The real janitor's session, captured before the swap, restored on Exit. */
  at: string // access_token
  rt: string // refresh_token
  actorId: string // janitor profile id (audit)
  actorHandle: string // janitor handle (banner)
}

export async function readImpersonation(): Promise<ImpersonationStash | null> {
  const raw = (await cookies()).get(IMPERSONATION_COOKIE)?.value
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<ImpersonationStash>
    if (v && typeof v.at === 'string' && typeof v.rt === 'string' && typeof v.actorId === 'string') {
      return v as ImpersonationStash
    }
  } catch {
    /* fall through */
  }
  return null
}

/** True when the current request is a janitor acting as a member. */
export async function isImpersonating(): Promise<boolean> {
  return (await readImpersonation()) !== null
}
