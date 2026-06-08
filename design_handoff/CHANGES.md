# CHANGES.md — DAWN sync (Quest icon set)

> **▶ Paste this into Claude Code (in your repo):**
> *"sync DAWN"* — or spelled out: *"Read `design_handoff/SYNC.md` and
> `design_handoff/CHANGES.md`, apply the Quest icon set per the mapping, create a
> `design-sync/quest-icons` branch, build, and open a PR. Do not merge or deploy."*

This round adds the **canonical Quest icon set**: one `lucide-react` glyph per
Quest concept, so every Quest surface uses the same mark. Reference design:
`quest-icons.card.html` (in this folder). **Icons are Lucide** — no new asset
files; this is glyph-name wiring only.

> ⚠️ If you have NOT yet synced the earlier palette round (Signal emerald-teal /
> Broadcast robin's-egg / Agent→olive), those `app/globals.css` token edits are
> still pending — ask for that change set again or pull it from `colors.css` here.

---

## 1. Canonical Quest concept → `lucide-react` icon

Use these names everywhere a Quest concept renders. Import from `lucide-react`
(PascalCase, e.g. `import { Zap, Gem } from 'lucide-react'`).

| Concept | lucide name | Import |
|---|---|---|
| Zaps (currency) | `zap` | `Zap` |
| Gems (currency) | `gem` | `Gem` |
| The Vault | `vault` | `Vault` |
| Store | `store` | `Store` |
| Earn log | `receipt` | `Receipt` |
| Merch trade | `gift` | `Gift` |
| Verified practice | `circle-check-big` | `CircleCheckBig` |
| Check-in | `footprints` | `Footprints` |
| QR node | `qr-code` | `QrCode` |
| NFC node | `nfc` | `Nfc` |
| Ghost node | `ghost` | `Ghost` |
| Invite | `user-plus` | `UserPlus` |
| The Quest | `compass` | `Compass` |
| Season | `sun` | `Sun` |
| Journey | `route` | `Route` |
| Arc | `waypoints` | `Waypoints` |
| Practice | `sparkles` | `Sparkles` |
| Streak | `flame` | `Flame` |
| Challenge | `target` | `Target` |
| Achievement | `award` | `Award` |
| Endorsed | `badge-check` | `BadgeCheck` |
| Season trophy | `trophy` | `Trophy` |
| Leaderboard | `list-ordered` | `ListOrdered` |
| Luminary | `crown` | `Crown` |

**Treatment:** render in the amber chip when standing alone (`bg-primary-bg
text-primary-strong`, `rounded-xl`, ~22px glyph) — see the reference card.

---

## 2. Reconcile `components/layout/nav-icons.ts`

The nav `AREA_ICONS` map already covers some of these. Align the Quest-related
areas to the canonical set:

| Area key | Current | Change to | Why |
|---|---|---|---|
| `quests` | `Map` | `Compass` | The Quest = compass (Map now reads as geography). |
| `vault` | `Gem` | `Vault` | The vault gets its own mark; `Gem` stays the currency. |
| `journeys` | `Route` | `Route` | ✓ already correct. |
| `practices` | `Sparkles` | `Sparkles` | ✓ already correct. |
| `crew` | `Zap` | `Zap` | ✓ keep (zaps = the Quest energy). |
| `store` | `Store` | `Store` | ✓ already correct. |

(If `quests`/`vault` icons are load-bearing elsewhere, change only the import +
the map entry; the rest is automatic.)

---

## 3. (Optional) add a shared `quest-icons.ts` constant

For the non-nav Quest concepts (currencies, nodes, rewards), add one source of
truth so components don't re-pick glyphs ad hoc — e.g. `lib/quest-icons.ts`:

```ts
import {
  Zap, Gem, Vault, Store, Receipt, Gift, CircleCheckBig, Footprints, QrCode,
  Nfc, Ghost, UserPlus, Compass, Sun, Route, Waypoints, Sparkles, Flame,
  Target, Award, BadgeCheck, Trophy, ListOrdered, Crown,
} from 'lucide-react'

export const QUEST_ICONS = {
  zaps: Zap, gems: Gem, vault: Vault, store: Store, earnLog: Receipt, merch: Gift,
  verifiedPractice: CircleCheckBig, checkIn: Footprints, qrNode: QrCode,
  nfcNode: Nfc, ghostNode: Ghost, invite: UserPlus, theQuest: Compass,
  season: Sun, journey: Route, arc: Waypoints, practice: Sparkles, streak: Flame,
  challenge: Target, achievement: Award, endorsed: BadgeCheck, trophy: Trophy,
  leaderboard: ListOrdered, luminary: Crown,
} as const
```

---

## Verify
- `npm run dev`; check the left nav (`quests`, `vault`) and any Quest surfaces.
- Confirm icons import from `lucide-react` (no new SVG/asset files needed).
- Open a PR titled **"DAWN sync: Quest icon set"**. Do not deploy.
