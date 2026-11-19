# Profile style map

Reference only. This page maps every place a member can change how their profile looks: where the value is stored,
what writes it, what shows it, and how much it is used. It tracks no status (that is
[`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json)). Written 2026-11-19 from main `5e43ee5e` and a read-only count on
production (79 profiles), after a cohesion audit asked whether old "random styles" behavior was still live.

**Answer first.** Nothing here generates or accepts a random or free-form style. Every control picks from a fixed
list, and an unknown stored value falls back to the default. The only `Math.random()` in the profile builder makes row
ids.

**Owner ruling, 2026-11-19 05:39Z (Daniel):** retire nothing yet; this map is the whole deliverable. Do not remove a
surface or a column below without asking again.

| Surface | Stored in | Allowed values | Written by | Shown by | In use (production) |
|---|---|---|---|---|---|
| Vault border | `profiles.profile_border` | `BORDER_RENDERS` in `lib/store/cosmetics.ts`: indigo, amber, emerald, violet, gradient, waveform | Vault redeem and equip, `app/(main)/crew/store/actions.ts` (service client) | `CosmeticBorder` on `app/(main)/people/[handle]/page.tsx`; Vault summary | 0 members |
| Vault flair | `profiles.profile_flair` | `FLAIR_RENDERS`: flame, star, gem, crown, zap | same | `CosmeticFlair` on the profile page; Vault summary | 1 member (`star`) |
| Vault title | `profiles.custom_title` | The title text of the store item, at most 24 characters | same | `CosmeticTitle` on the profile page; Vault summary | 1 member |
| Spotlight skin | `profiles.profile_theme` | `PROFILE_SKINS` in `lib/theme/profile-skins.ts` (the selectable skins; Crew themes need Crew) | `updateProfileTheme` in `lib/profile/profile-theme-actions.ts` (owner check, allowlist, Crew gate); an admin reset in `app/(main)/admin/members/spotlight-actions.ts` sets it to null | `resolveProfileSkin` in `app/spotlight/[handle]/page.tsx` and `components/spotlight/spotlight-shell.tsx` | 1 member off the default |
| Block appearance | The per-block style bag validated by `lib/entity-blocks/block-content.ts` | Text color tokens, text shadow none, soft or strong, fixed height, column and alignment steps, a card background switch | The block editor (`components/entity-blocks/block-edit-panel.tsx`, `profile-page-builder.tsx`); the sanitizer walks its own allowlist, so an unknown key is dropped on write | Registered block renderers, through token classes | Not counted |

## Notes for whoever changes this next

- **A stored skin that is no longer offered.** The one non-default `profile_theme` in production is a skin the picker
  stopped offering. `resolveProfileSkin` maps a value outside the offered set to `default`, so that page renders the
  default look today and the stored value is inert. It is not an error and needs no data change.
- **The Vault cosmetics are sold, so removing them is a refund question, not a cleanup.** `redeemItem` refuses a sale
  the registry cannot paint, and `scripts/check-cosmetic-renders.mjs` measures the shelf against the registry.
- **Fallbacks.** An unknown border or flair value has no entry in the registry to paint; an unknown skin
  renders the default.
- [`docs/PROFILE-STUDIO-PLAN.md`](PROFILE-STUDIO-PLAN.md) describes planned profile cosmetics. It is a plan, not the
  contract; this page and the code are what is live.
