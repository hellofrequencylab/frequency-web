import 'server-only'

// CLAIM-ON-SIGN-IN, THE TICKET LEG — the moment a paid ticket stops being an orphan.
//
// ── WHY A THIRD DOOR ─────────────────────────────────────────────────────────────────────────────
// A guest ticket (`event_tickets` with `buyer_profile_id` NULL and `guest_email` set) is a real
// payment attached to nothing. It is invisible to "my events", it cannot be checked in, and its
// buyer reads as a stranger to every surface that keys on a profile id. Its RSVP sibling has had a
// door for this since ADR-1033 (lib/events/guest-seat-claim.ts) and its CRM sibling since
// lib/crm/convert-leads-on-sign-in.ts. This is the same seam for the same reason, for the one
// artifact of the three that somebody paid money for.
//
// ── WHY SIGN-IN, AND WHY THE SESSION CLIENT ──────────────────────────────────────────────────────
// Sign-in is where both facts `claim_guest_tickets()` requires become true at once: `auth.uid()` is
// the caller, and `auth.users.email_confirmed_at` has just been stamped by the link they clicked.
// The function takes NO arguments on purpose. Stripe COLLECTED an address at checkout and did not
// PROVE one, so a typed address keys nothing (ADR-854); the function reads the PROVEN address out
// of auth.users server-side and attaches every unclaimed ticket that matches it.
//
// 🔴 THAT MECHANISM IS ALSO WHY THIS RUNS ON THE SESSION CLIENT AND NEVER THE ADMIN ONE. The RPC
// proves ownership with `auth.uid()`. Under the service-role client `auth.uid()` is NULL, it matches
// nobody, and it returns a perfectly healthy 0 having attached nothing. The bypass would not be a
// shortcut here, it would be a silent no-op — and the failure mode is the worst kind, because the
// number it returns looks like success. The same trap is documented on both sibling modules.
//
// ── BEST-EFFORT, AND NOT A LANDING ───────────────────────────────────────────────────────────────
// Swallowed by its caller: attaching a ticket is bookkeeping, never a blocker on authentication.
// Deliberately narrower than `claimGuestSeatsOnSignIn`, which returns a destination — this returns
// nothing and must not influence where anyone lands. The seat claim already owns that decision, and
// two modules competing to redirect one sign-in is how a person ends up somewhere neither intended.
//
// Idempotent by construction: the SQL only touches UNCLAIMED tickets, so a second sign-in attaches
// nothing and is not an error.

/**
 * The narrow structural handle this module needs from the SESSION-scoped Supabase client. Untyped
 * (ADR-246): `claim_guest_tickets` postdates the generated lib/database.types.ts, and `rpc()` is
 * typed from that same generated file, so the caller casts once at the call site. Mirrors the
 * `SessionClient` handles in lib/crm/convert-leads-on-sign-in.ts and lib/events/guest-seat-claim.ts.
 */
export type SessionClient = {
  /** supabase-js resolves `{ error }` and never throws, so the RPC's outcome is READ, not caught. */
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error?: { message?: string } | null } | null | void>
}

/**
 * Attach every unclaimed guest ticket held by this member's PROVEN address.
 *
 * Returns nothing, on every path including failure. A thrown RPC (transport, PostgREST unreachable)
 * and an `{ error }` reply (a permission denial, a missing function after migration drift) are both
 * logged and swallowed: the caller is the auth callback, and an unattached ticket is recoverable on
 * the next sign-in while a failed login is not.
 *
 * @param session the SESSION-scoped Supabase client — see the note above on why the admin client
 *                would attach nothing while reporting success.
 */
export async function claimGuestTicketsOnSignIn(session: SessionClient): Promise<void> {
  try {
    // No arguments: the function takes none. The address it acts on is the one auth.users has
    // already proven, which is the entire reason it is safe to grant to `authenticated`.
    const result = await session.rpc('claim_guest_tickets')
    const error = result && typeof result === 'object' && 'error' in result ? result.error : null
    if (error) {
      // Logged rather than ignored: a fail-safe nobody can see fired is an invisible regression,
      // and this one is standing between somebody and a ticket they paid for.
      console.error('[guest-ticket-claim] claim_guest_tickets failed', { message: error.message })
    }
  } catch (e) {
    console.error('[guest-ticket-claim] claim_guest_tickets threw', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
