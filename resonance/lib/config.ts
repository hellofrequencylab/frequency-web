/**
 * Single source of truth for this app's identity.
 *
 * The codename "Resonance" is a placeholder (ADR-001). Renaming the app later is
 * a change to `name` here, plus one schema-rename migration. Nothing else in the
 * codebase hardcodes the name.
 */
export const APP = {
  name: "Resonance",
  slug: "resonance",

  /**
   * The Postgres schema that contains 100% of this app's data. Nothing this app
   * owns ever lives outside it, and it holds no foreign keys into any other
   * schema. This is what makes `pg_dump -n resonance` a clean lift-out.
   * See docs/ISOLATION.md.
   */
  dbSchema: "resonance",
} as const;

/**
 * Is standalone anonymous identity available on the Supabase project this
 * deployment points at?
 *
 * 🔴 THIS IS A PROJECT-LEVEL AUTH SETTING, NOT APP CODE, AND THAT IS THE WHOLE
 * REASON THIS FLAG EXISTS. `signInAnonymously()` only works when the *project*
 * has "Anonymous sign-ins" turned on. Today this app runs inside the SHARED
 * Frequency Supabase project (ADR-008), where that setting is deliberately OFF
 * and stays off: Frequency never calls `signInAnonymously`, and turning it on
 * would widen the live platform's auth surface for a sub-app that is parked.
 * See ADR-019 here and ADR-1054 in Frequency's `docs/DECISIONS.md`.
 *
 * So the app must not ASSUME a capability the host project does not grant. It
 * asks. Default is OFF (opt-in, exact string "true"), which matches the shared
 * project. Set `NEXT_PUBLIC_RESONANCE_ANONYMOUS_AUTH=true` only when the env
 * points at a project that actually has the setting enabled, i.e. after the
 * breakout in docs/ISOLATION.md.
 *
 * Embedded mode never needs this: the host signs a federated JWT (ADR-017).
 *
 * A function, not a module constant, so a build that inlines
 * `process.env.NEXT_PUBLIC_*` still reads the value at the call site.
 */
export function standaloneAnonymousAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_RESONANCE_ANONYMOUS_AUTH === "true";
}
