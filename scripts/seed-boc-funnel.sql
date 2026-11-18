-- The Business of Community workshop Funnel (LIVE-2354). Apply by hand; this PR writes no database rows.
--
-- The "Save your seat" door on /courses/business-of-community links /join?seq=business-of-community.
-- This row makes that link a real audience Funnel (docs/FUNNELS.md): Vera's beats in the hot register
-- (docs/AI-VERA.md section 2), the cohort tag beta_business_of_community (registered in
-- lib/traits/registry.ts in the same PR, stored beta_ prefix per ADR-1090), and a DIRECT completion
-- destination: finishing sign-up lands the new member on the Week 1 event of the live workshop, where they
-- RSVP (owner 2026-11-17: no self-paced course; the workshop runs several times a year). Already-onboarded members
-- who follow the link are sent straight to the same destination (app/join/(induction)/page.tsx).
--
-- Until this row exists, the link still works, but it runs the default flow with a generic copy and
-- lands on the default post-sign-up page instead of the event.
--
-- Idempotent: re-running replaces the row's content. Edit later in the Funnels manager (/pages/sequences).
insert into sequence_overrides (slug, audience, splash, data, updated_at)
values (
  'business-of-community',
  'The Business of Community 101',
  '{
    "eyebrow": "Live workshop · Free",
    "headline": "People showed up once. Here’s how they come back.",
    "body": "Four Thursdays on Zoom, four simple meetings on the PULSE rhythm. Free. The launch Run starts January 7.",
    "cta": "Save your seat",
    "image": "/sites/new-world/photos/backyard-class.webp",
    "imageAlt": "A teacher leads a stretching class on mats and rugs on a sunny backyard patio",
    "statement": "Count who came *back.*"
  }'::jsonb,
  '{
    "audience": "The Business of Community 101",
    "marketingTag": "beta_business_of_community",
    "status": "published",
    "splash": {
      "eyebrow": "Live workshop · Free",
      "headline": "People showed up once. Here’s how they come back.",
      "body": "Four Thursdays on Zoom, four simple meetings on the PULSE rhythm. Free. The launch Run starts January 7.",
      "cta": "Save your seat",
      "image": "/sites/new-world/photos/backyard-class.webp",
      "imageAlt": "A teacher leads a stretching class on mats and rugs on a sunny backyard patio",
      "statement": "Count who came *back.*"
    },
    "vera": {
      "intro": {
        "eyebrow": "The Business of Community 101",
        "heading": "Gather people who *come back.*",
        "body": "Frequency’s free live workshop for anyone who gathers people. Four simple meetings, all on PULSE, four Thursdays on Zoom.",
        "cta": "Save your seat"
      },
      "identity": {
        "heading": "Put a name to the host",
        "body": "Your people will know you by this. A real name and a photo make the first hello easy."
      },
      "place": {
        "heading": "Where do you gather?",
        "body": "Tell us your town. The workshop works anywhere, and we will show you who is near you.",
        "intentLabel": "What do you run right now?",
        "intentPlaceholder": "A weekly sound bath, a dance night, a craft table. Say it plainly."
      },
      "tour": {
        "eyebrow": "How it works",
        "heading": "Four weeks. *Four meetings.*",
        "body": "The weekly sit-down, the opening, the full gathering and the money hour. Ninety minutes live each Thursday, an overview and a lesson to read before, and homework after.",
        "cta": "Next"
      },
      "enter": {
        "eyebrow": "Last step",
        "heading": "Your seat is *waiting.*",
        "body": "Confirm your email and you land on the Week 1 session. RSVP there and the Zoom link comes to you.",
        "cta": "Save your seat"
      }
    },
    "slide2Features": [
      { "title": "Classes and workshops", "blurb": "Yoga, breathwork and the rooms you mostly run yourself.", "icon": "learning" },
      { "title": "Sound and circles", "blurb": "Sound baths and circles in studios, homes and parks.", "icon": "heart" },
      { "title": "Meetups and nights out", "blurb": "Dance nights, open mics and the regular thing people plan around.", "icon": "users" },
      { "title": "A house or small venue", "blurb": "A living room, a backyard or a small room that hosts others.", "icon": "map" }
    ],
    "slide3Core": [
      { "title": "Stop carrying everything", "blurb": "A weekly 30-minute sit-down, three things at a time.", "art": { "kind": "render", "render": "crm" } },
      { "title": "Open the room well", "blurb": "Your purpose, three agreements and a check-in, every time.", "art": { "kind": "render", "render": "circles" } },
      { "title": "See who came back", "blurb": "Mark who came to each Event, so you know who came back and who to text.", "art": { "kind": "render", "render": "checkin" } }
    ],
    "destination": { "mode": "direct", "url": "/events/business-of-community-pilot-session-1" }
  }'::jsonb,
  now()
)
on conflict (slug) do update set
  audience = excluded.audience,
  splash = excluded.splash,
  data = excluded.data,
  updated_at = now();
