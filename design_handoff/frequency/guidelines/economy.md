# Economy reference: what actions earn
Source: `hellofrequencylab/frequency-web`, from `content/help/the-quest/zaps-and-gems.md`, `content/help/membership/the-gem-store.md` and `lib/gems.ts` (configured amounts live in the `gem_config` table). Synced 2026-10-13. Use these numbers in every design; never invent others.

**The rule:** real-world showing up earns **Zaps ⚡**; online care earns **Gems 💎**.

**Tuning:** the live values are in `assets/economy/economy.json`, and every design reads them from there. The tables below mirror that file as it stands today.

## Zaps ⚡ (real world, seasonal score)
| Action | Zaps | Notes |
|---|---|---|
| Found or start a Circle | 100 | |
| Finish a Journey | 75 | plus a Trophy |
| Host an event | 60 | |
| Expression Challenge, in person at a Circle | 50 | |
| Verified event check-in | 25 | |
| Outreach task (a flyer or QR code) | 20 | |
| Log a practice | 10 / 15 / 25 | set by how often the practice is meant to be done: daily / three times a week / weekly |

- Logging a practice is never capped. A few other actions have a daily limit.
- Zaps reset each season. At season end they convert to Gems at a flat **5 to 1**.
- Zaps feed **Amplitude**, the lifetime total that never resets. Hosting-class acts count double toward it: hosting an event, running a program, founding or activating a Circle.
- **Rank comes from finishing Journeys, not from Zaps.** It's shown as "Adept · 14,200", meaning rank · Amplitude.

## Gems 💎 (online, spendable, never reset)
| Action | Gems | Daily cap |
|---|---|---|
| Welcome a newcomer | 5 | once per newcomer |
| RSVP to an event | 5 | |
| Join a Circle | 5 | |
| Post | 3 | 5 a day |
| Comment or reply | 2 | 8 a day |
| Share | 2 | 5 a day |
| Daily presence | 2 | once a day |
| React | 1 | 8 a day |

- **Creation rewards:** a small Gem token when you publish a Journey, event or practice. The real payout, in both Zaps and Gems, arrives when another member uses it.
- **Two numbers:** the **earned** total only goes up, and the **spendable** balance is earned minus spent.
- **Gifting:** Gems can be gifted to another member. Gifting moves only the spendable balance; the earned total and Amplitude don't change.

## The Vault Store (what Gems buy)
- **Items for sale:** profile cosmetics (borders, flair icons), custom titles, collectible badges, and membership credits (free months).
- **Item limits:** some items are limited stock and some are season exclusives. A few need a rank first; the Founders' Table seat needs Adept or above.
- **Prices:** per-item prices live in the store config, not in the docs. Show them from data and never hard-code them in designs.
