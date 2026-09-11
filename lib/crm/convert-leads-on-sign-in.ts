import 'server-only'

// CONVERT-ON-SIGN-IN — the moment a proto-profile becomes a person.
//
// ── WHY A SEPARATE DOOR ──────────────────────────────────────────────────────────────────────────
// `public.signup_leads` holds addresses that are not yet members: someone part-way through
// induction, someone who RSVP'd to a public event while signed out (the guest RSVP form captures one
// beside the seat, app/(main)/events/guest-rsvp-actions.ts). A lead row carries
// `converted_profile_id` + `converted_at`, and until they are stamped the row is a stranger: it
// cannot be joined to the member, so the funnel it belongs to reports an arrival and never an
// outcome, and the same human reads as two records forever.
//
// Nothing the guest's BROWSER carries can close that gap. `capture_signup_lead` mints a claim token
// for the tab that created the row, but the sign-in happens days later and routinely on another
// device — a phone that RSVP'd, a laptop that opened the emailed link. So the join has to be made
// from something that outlives the browser, and the only such thing is the address itself, PROVEN.
//
// ── WHY SIGN-IN, AND WHY THE SESSION CLIENT ──────────────────────────────────────────────────────
// Sign-in is where the two facts `convert_signup_leads_for_me()` requires become true at once:
// `auth.uid()` is the caller, and `auth.users.email_confirmed_at` has just been stamped by the link
// they clicked. The function takes NO arguments on purpose — a typed address keys nothing (ADR-854);
// it reads the proven one out of auth.users server-side.
//
// That mechanism is also why this must run on the SESSION-scoped client and never the admin one:
// the function resolves the caller's profile from `auth.uid()`, so under the service-role client
// `auth.uid()` is null, it matches no profile, and it silently converts nothing while returning a
// perfectly healthy 0. The bypass would not be a shortcut here, it would be a no-op.
//
// ── BEST-EFFORT, AND NOT A LANDING ───────────────────────────────────────────────────────────────
// Everything here is swallowed by its caller: a conversion is bookkeeping, never a blocker on
// authentication. It is also deliberately narrower than its neighbour `claimGuestSeatsOnSignIn`,
// which returns a destination — this one returns nothing and must not influence where anyone lands.
// A CRM stamp is not a reason to move somebody's page out from under them.
//
// Idempotent by construction (the SQL only touches unconverted rows), so a second sign-in converts
// nothing and is not an error.

/**
 * The narrow structural handle this module needs from the SESSION-scoped Supabase client. Untyped
 * (ADR-246): `convert_signup_leads_for_me` postdates the generated lib/database.types.ts, and
 * `rpc()` is typed from that same generated file, so the caller casts once at the call site.
 * Mirrors the `SessionClient` handle in lib/events/guest-seat-claim.ts.
 */
export type SessionClient = {
  /** supabase-js resolves `{ error }` and never throws, so the RPC's outcome is READ, not caught. */
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error?: { message?: string } | null } | null | void>
}

/**
 * Stamp every unconverted `signup_leads` row held by this member's PROVEN address as converted.
 *
 * Returns nothing, on every path including failure. A thrown RPC (transport, PostgREST unreachable)
 * and an `{ error }` reply (a permission denial, a missing function after migration drift) are both
 * logged and swallowed: the caller is the auth callback, and a CRM join is never worth failing a
 * login for.
 *
 * @param session the SESSION-scoped Supabase client — see the note above on why the admin client
 *                would convert nothing.
 */
export async function convertLeadsOnSignIn(session: SessionClient): Promise<void> {
  try {
    // No arguments: the function takes none. The address it acts on is the one auth.users has
    // already proven, which is the entire reason this is safe to expose to `authenticated`.
    const result = await session.rpc('convert_signup_leads_for_me')
    const error = result && typeof result === 'object' && 'error' in result ? result.error : null
    if (error) {
      // Logged rather than ignored: a fail-safe nobody can see fired is an invisible regression.
      console.error('[convert-leads] convert_signup_leads_for_me failed', { message: error.message })
    }
  } catch (e) {
    console.error('[convert-leads] convert_signup_leads_for_me threw', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
