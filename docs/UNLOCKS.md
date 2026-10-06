# Unlocks

GENERATED from `lib/unlocks.ts` by `pnpm unlocks:doc`. Do not edit by hand: change the map and
regenerate. `lib/unlocks.test.ts` fails when this file and the map disagree.

Which feature wakes up when. Stages come from `lib/member-progress.ts` (ADR-146) and reveal
surfaces, never nav. Role floors are the community trust ladder (`lib/core/roles.ts`).

Stages, in order: Newcomer, Finding your feet, Regular, Established, Anchor.

| Feature | What | Where | Wakes up at |
|---|---|---|---|
| `feed.resource-doors` | The "Keep exploring" doors on the practice board | Feed | stage Regular |
| `feed.pillar-balance` | Pillar balance on the practice board | Feed | stage Established |
| `quest.leaderboard` | The Circle leaderboard | My Quest | stage Regular |
| `rail.leaderboard` | The leaderboard panel (also needs Crew standing) | Right rail | stage Regular |
| `profile.achievements` | The full Achievements grid on your own profile | Your profile | stage Finding your feet |
| `lead.outreach` | Outreach: message the members you steward | Lead tools, /outreach | role host and up |
| `lead.inbox` | The group inbox | Lead tools | role host and up |
| `view-as` | View as: preview the app as a lower role | Header | role host and up |
| `profile.member-support` | The member support panel on someone else's profile | Profiles | role host and up |
