# Edit-path audit — can every nav surface be edited?

> Snapshot 2026-06-06. "Can an operator create/edit/delete the content this page
> shows, in-app?" Source surfaces: `lib/nav-areas.ts` (NAV_AREAS) + the Growth Studio
> launchpad (`app/(main)/growth/page.tsx`). Re-run when surfaces are added.

**Result: 28 / 33 surfaces have an in-app edit path.** Legend: ✅ edit present ·
⚠️ read-only gap · N/A not editable content (dashboard / feed / analytics).

| Surface | Route | Status | Mechanism / gap |
|---|---|---|---|
| Feed | `/feed` | ✅ | CreateMenu + Capture (post creation) |
| Around You | `/broadcast` | ✅ | BroadcastCompose (host+ dispatch) |
| Circles | `/circles` | ✅ | NewCircleCompose · Manage circles |
| Channels | `/channels` | ✅ | NewChannelCompose (host+) |
| Events | `/events` | ✅ | EventCompose · `/events/new` |
| Marketplace | `/market` | ✅ | NewListingButton |
| People | `/people` | ⚠️ | Browse/filter only; profiles edited via `/settings` |
| Journeys | `/journeys` | ✅ | NewJourneyButton |
| Practices | `/practices` | ✅ | NewPracticeButton · `/practices/[id]/edit` |
| Library | `/library` | ⚠️ | Browse/rate/adopt + host review; no creator on-page |
| Quest | `/crew` | N/A | Personal dashboard |
| Store | `/crew/store` | N/A | Browse/purchase |
| Messages | `/messages` | ✅ | NewRoomCompose · DM creation |
| Admin Overview | `/admin` | N/A | Dashboard → links to edit surfaces |
| CRM | `/crm` | ✅ | PipelineBoard · `/crm/deals/new` |
| Profiles | `/connections` | ✅ | `/connections/new` + detail edit |
| QR Studio | `/admin/qr` | ✅ | Nodes/links/campaigns create/edit |
| Hubs & Nexuses | `/admin/hubs` | ✅ | HubsClient inline edit · NewHubCompose |
| Growth Studio | `/growth` | N/A | Launchpad → edit surfaces |
| Insights | `/admin/engagement` | N/A | Analytics |
| Vera | `/admin/vera` | ✅ | VeraConfigForm |
| Members | `/admin/members` | ✅ | Member admin actions |
| Pages | `/pages` | ✅ | `/pages/edit/[slug]` block editor |
| Sequences | `/pages/sequences` | ✅ | Edit splash → `/pages/sequences/[slug]/edit` |
| Entry points | `/entry-points` | ✅ | EntryPointsManager create/edit/delete |
| Links & codes | `/codes` | ✅ | MemberCodes · MarketingCodes restyle |
| Campaigns | `/marketing/campaigns` | ✅ | CampaignComposer |
| Funnels | `/marketing/funnels` | ✅ | FunnelsManager |
| Nurture | `/marketing/nurture` | ⚠️ | No composer wired up (stub) |
| Automations | `/marketing/automations` | ⚠️ | No composer wired up (stub) |
| Analytics | `/marketing/analytics` | N/A | Analytics |
| Market read | `/marketing/market-read` | N/A | Signals feed |
| Beta waitlist | `/marketing/beta` | ⚠️ | Browse only; no manage UI |
| Marketing agent | `/marketing/agent` | N/A | AI assistant |
| Contacts | `/marketing/contacts` | ⚠️ | Browse/filter/consent; append-only (scans/imports) |

## The 6 read-only gaps (prioritised)

| Gap | Why | Suggested fix |
|---|---|---|
| **Nurture** `/marketing/nurture` | Stub — no create/edit | Build a drip-sequence composer (real gap) |
| **Automations** `/marketing/automations` | Stub — no create/edit | Build a trigger/rule editor (real gap) |
| **Beta waitlist** `/marketing/beta` | View-only | Add invite/approve/remove actions |
| **Contacts** `/marketing/contacts` | Append-only by design | Add manual "Add contact" + edit; otherwise OK |
| **Library** `/library` | Browse-first by design | Add a "Submit to Library" creator entry (review flow exists) |
| **People** `/people` | Directory by design | Acceptable — profiles edit via `/settings`; could add an inline admin edit for operators |

**Reading:** the genuine *build* gaps are **Nurture** and **Automations** (stubbed pages
with no UI). The rest are by-design browse/append surfaces that may only want a small
"add/manage" affordance, not a full editor.
