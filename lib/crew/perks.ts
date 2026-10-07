// CREW PERKS BEYOND HOSTING (LIVE-757, ADR-1709). The later Phase 4 row: profile themes, flair and
// early access to new features, as one registry and one check, so a perk is switched on in one place
// and every surface that offers or enforces it reads the same answer.
//
// 🔴 A PERK IS ADVERTISED ONLY WHEN SOMETHING IS BEHIND IT. `live` is false until a Crew member can
// actually use the perk, and /upgrade lists only live perks. Today:
//   · themes: the seam is wired (the profile theme writer refuses a Crew theme to a non-Crew member,
//     and the appearance rail hides it), but CREW_THEME_SKINS is empty. The one extra skin, Midnight,
//     was taken out of members' hands by the owner on 2026-08-04 (lib/theme/skins.ts), and a perk must
//     not re-open it. Add a skin id here when a Crew theme is authored.
//   · flair: not built. The Vault Store sells flair for Gems, so a Crew flair needs its own render
//     value first (lib/store/cosmetics.ts FLAIR_RENDERS), never a free copy of a bought one.
//   · early_access: not built. No feature is in an early-access window yet.
//
// Who holds the perks: the REAL effective tier (effectiveTierFor, lib/billing/crew-grants.ts: the
// billed column union an active Space-membership grant), never the Beta grant, the same rule caps and
// the Crew Boost use. The callers read it; this module stays PURE because the profile skin list that
// imports it is also imported by client components.

type CrewPerk = 'themes' | 'flair' | 'early_access'

/** Every Crew perk beyond hosting, in the order /upgrade lists them. */
export const CREW_PERKS: readonly { key: CrewPerk; label: string; live: boolean }[] = [
  { key: 'themes', label: 'Crew themes for your profile', live: false },
  { key: 'flair', label: 'Crew flair beside your name', live: false },
  { key: 'early_access', label: 'Early access to new features', live: false },
]

/** Profile skins only Crew may pick. Empty until a Crew theme is authored (see the header). */
const CREW_THEME_SKINS: ReadonlySet<string> = new Set<string>()

/** Is this profile skin a Crew theme? PURE. */
export function isCrewTheme(skinId: string): boolean {
  return CREW_THEME_SKINS.has(skinId)
}
