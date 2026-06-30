// ╔══════════════════════════════════════════════════════════════════════════════════════╗
// ║  OPERATOR-IDENTITY CONTEXT — FRAMING ONLY. NEVER AN AUTHORIZATION INPUT.                ║
// ╠══════════════════════════════════════════════════════════════════════════════════════╣
// ║  One person can wear three hats at once: a platform admin (web_role staff), the OWNER/  ║
// ║  operator of a Space, and a personal member of other circles/spaces. This "context" is  ║
// ║  a lightweight, PRESENTATIONAL signal of WHICH HAT they are currently wearing — so the  ║
// ║  business identity (the "Daniel Tyack" SPACE) reads distinctly from the person of the   ║
// ║  same name. It lives in its OWN cookie (`freq-context`), separate from the view-as       ║
// ║  system (`freq-view-as`), which it must never touch.                                     ║
// ║                                                                                          ║
// ║  THE INVARIANT (read twice): the context value is FRAMING ONLY. It MUST NEVER be read   ║
// ║  in ANY authorization / capability / gate decision. It cannot grant or change any power. ║
// ║   • Being in "operator" context for Space X confers NOTHING — the user can only manage  ║
// ║     X because the EXISTING /spaces/X/manage gate (resolveSpaceManageAccess) re-checks    ║
// ║     their REAL role. The context just frames + routes; the gate decides.                 ║
// ║   • Being in "admin" context confers NOTHING — requireAdmin / isStaff still decide.      ║
// ║   • The cookie is NEVER trusted: `resolveOperatorContext` RE-DERIVES the available       ║
// ║     contexts from the DB on every read and fails an out-of-set value safe to `personal`. ║
// ║  The ONLY readers of this value are PRESENTATIONAL/shell code: the account chip, the      ║
// ║  context badge, the default-landing redirect, and the "Spaces you run" hub. If you find  ║
// ║  yourself importing this into a gate, STOP — you have a bug.                              ║
// ╚══════════════════════════════════════════════════════════════════════════════════════╝
//
// CLIENT-SAFE by design: this module is the PURE parse/validate/serialize core + the shared types
// and constants, so the account chip + context switcher (client components) can import it. It holds
// NO `server-only` import, NO `next/headers`, and NO DB read. The server resolver that reads the
// cookie + re-derives authority lives in the sibling server-only module `lib/context/resolve-context.ts`
// (Next refuses a client import of a server-only module, so the split keeps the chip compilable).

import { type WebRole } from '@/lib/core/roles'

/** The cookie that carries the operator-identity context. SEPARATE from `freq-view-as` (the
 *  downgrade-only role preview) on purpose — this axis never touches roles or capabilities. */
export const CONTEXT_COOKIE = 'freq-context'

/** The prefix that marks the OPERATOR context, naming a specific Space, e.g. `operator:9f3c…`.
 *  The `personal` / `admin` values carry no prefix, so the axes can never collide in one cookie. */
const OPERATOR_PREFIX = 'operator:'

/** A plausible Space-id payload: a non-empty token of id-safe characters (uuids + slug-ish ids),
 *  bounded so a forged value can never carry anything strange. SHAPE check only — the authoritative
 *  "does the caller actually run THIS Space" check is re-derived from the DB in
 *  `resolveOperatorContext` (an id the caller no longer admins fails safe to `personal`). */
const SPACE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/

/**
 * An operator-identity context — the hat the person is currently wearing:
 *   - `{ kind: 'personal' }` — the member identity (the default; the personal home is /feed).
 *   - `{ kind: 'operator', spaceId }` — running a SPECIFIC Space they own/admin (the Space's
 *     manage console is its home). FRAMING only — it grants nothing; the manage gate still decides.
 *   - `{ kind: 'admin' }` — the platform-staff hat (the admin workspace is its home). FRAMING only —
 *     requireAdmin / isStaff still decide.
 */
export type OperatorContext =
  | { kind: 'personal' }
  | { kind: 'operator'; spaceId: string }
  | { kind: 'admin' }

/** The default context — what an absent / invalid cookie resolves to. Personal is always available. */
export const PERSONAL_CONTEXT: OperatorContext = { kind: 'personal' }

// ── The pure parse / validate / serialize core (no IO; unit-tested) ───────────────────────

/**
 * Parse a raw cookie string into a SHAPE-valid context, or null when unrecognized. This is a wire-
 * format check ONLY — it never proves the caller may USE the context; the authoritative re-derivation
 * lives in `resolveOperatorContext`. `operator:<spaceId>` is accepted only when the payload is a
 * shape-valid Space id; `personal` / `admin` are the two unprefixed literals.
 */
export function parseContextCookie(value: string | undefined | null): OperatorContext | null {
  if (!value) return null
  if (value === 'personal') return { kind: 'personal' }
  if (value === 'admin') return { kind: 'admin' }
  if (value.startsWith(OPERATOR_PREFIX)) {
    const spaceId = value.slice(OPERATOR_PREFIX.length)
    return SPACE_ID_RE.test(spaceId) ? { kind: 'operator', spaceId } : null
  }
  return null
}

/** Serialize a context back to its cookie string (the inverse of `parseContextCookie`). */
export function serializeContext(context: OperatorContext): string {
  switch (context.kind) {
    case 'operator':
      return `${OPERATOR_PREFIX}${context.spaceId}`
    case 'admin':
      return 'admin'
    case 'personal':
    default:
      return 'personal'
  }
}

/** Two contexts are the same hat (same kind, and same Space for operator). PURE. */
export function sameContext(a: OperatorContext, b: OperatorContext): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'operator' && b.kind === 'operator') return a.spaceId === b.spaceId
  return true
}

// ── The available-context catalog + the server resolver (re-derived, fail-safe) ───────────

/** One context the caller may switch into — the selectable rows the chip renders + the action
 *  validates against. Each carries its own default-landing `href`, so the switcher + the redirect
 *  never hand-roll a route. PRESENTATIONAL — the option set is re-derived from real authority. */
export type AvailableContext =
  | { kind: 'personal'; label: string; href: string }
  | {
      kind: 'operator'
      /** The Space id this option targets (matched against the cookie). */
      spaceId: string
      /** The Space's brand display name (so the chip reads "Daniel Tyack" the business). */
      label: string
      /** The Space's manage console (its default landing). */
      href: string
      /** Operator-supplied logo URL, or null (the chip falls back to an icon chip). */
      logoUrl: string | null
    }
  | { kind: 'admin'; label: string; href: string }

/** The minimal caller shape the resolver needs: their profile id + real staff axis. Passing the
 *  fields (not the whole profile) keeps this decoupled from lib/auth's shape. */
export interface ContextCaller {
  id: string
  /** The caller's REAL staff web_role — `admin` is only offered when this is staff (admin/janitor). */
  webRole: WebRole
}

/** The personal home — where the member identity lands. Matches the logo / Home target in the shell. */
export const PERSONAL_HOME = '/feed'
/** The admin workspace — where the platform-staff hat lands. */
export const ADMIN_HOME = '/admin'
/** The "Spaces you run" hub — the operator's front door, linked from the switcher's Operator section. */
export const OPERATING_HUB = '/spaces/operating'

/** The resolved result the shell consumes: the EFFECTIVE (re-validated) context + the full set of
 *  contexts available to this caller (so the chip only ever offers real ones). Produced by the
 *  server resolver in `lib/context/resolve-context.ts`; the shape lives here so both halves + the
 *  client chip share one type. */
export interface ResolvedContext {
  /** The effective context AFTER re-validating the cookie against real authority. Fails safe to
   *  `personal` whenever the cookie names a Space the caller no longer runs, or `admin` for a
   *  non-staff caller, or on any error. */
  context: OperatorContext
  /** Every context the caller may switch into (Personal always; one Operator per owned/admin Space;
   *  Admin only when staff). The validated catalog the switcher + the set-context action read. */
  available: AvailableContext[]
}

/**
 * Is a requested context present in the caller's real available set? PURE — the validation rule the
 * resolver AND the set-context action both run, so the cookie can never hold an unavailable context.
 * `personal` is always available; `admin` only when an admin option is present; `operator:<id>` only
 * when an operator option for exactly that Space id is present.
 */
export function isContextAvailable(
  context: OperatorContext,
  available: AvailableContext[],
): boolean {
  switch (context.kind) {
    case 'personal':
      return true
    case 'admin':
      return available.some((a) => a.kind === 'admin')
    case 'operator':
      return available.some((a) => a.kind === 'operator' && a.spaceId === context.spaceId)
    default:
      return false
  }
}

/** The default-landing href for a context, given the resolved available set (each option carries its
 *  own href). Falls back to the personal home when the context isn't in the set (defence in depth). */
export function landingHrefFor(
  context: OperatorContext,
  available: AvailableContext[],
): string {
  switch (context.kind) {
    case 'admin': {
      const opt = available.find((a) => a.kind === 'admin')
      return opt?.href ?? ADMIN_HOME
    }
    case 'operator': {
      const opt = available.find(
        (a): a is Extract<AvailableContext, { kind: 'operator' }> =>
          a.kind === 'operator' && a.spaceId === context.spaceId,
      )
      return opt?.href ?? PERSONAL_HOME
    }
    case 'personal':
    default:
      return PERSONAL_HOME
  }
}
