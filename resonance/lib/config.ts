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
