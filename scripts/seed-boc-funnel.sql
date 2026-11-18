-- The Business of Community course Funnel (LIVE-2350). Apply by hand; this PR writes no database rows.
--
-- The "Start the course" door on /courses/business-of-community links /join?seq=business-of-community.
-- This row makes that link a real audience Funnel (docs/FUNNELS.md): Vera's beats in the hot register
-- (docs/AI-VERA.md section 2), the cohort tag beta_business_of_community (registered in
-- lib/traits/registry.ts in the same PR, stored beta_ prefix per ADR-1090), and a DIRECT completion
-- destination: finishing sign-up lands the new member on the course itself. Already-onboarded members
-- who follow the link are sent straight to the same destination (app/join/(induction)/page.tsx).
--
-- Until this row exists, the link still works, but it runs the default flow with a generic copy and
-- lands on the default post-sign-up page instead of the course.
--
-- Idempotent: re-running replaces the row's content. Edit later in the Funnels manager (/pages/sequences).
insert into sequence_overrides (slug, audience, splash, data, updated_at)
values (
  'business-of-community',
  'The Business of Community 101',
  '{
    "eyebrow": "Free course",
    "headline": "A full room. A night that still didn’t pay.",
    "body": "A free four-week course for people who already gather others. About an hour a week.",
    "cta": "Start the course",
    "image": "/sites/new-world/photos/backyard-class.webp",
    "imageAlt": "A teacher leads a stretching class on mats and rugs on a sunny backyard patio",
    "statement": "Count who came *back.*"
  }'::jsonb,
  '{
    "audience": "The Business of Community 101",
    "marketingTag": "beta_business_of_community",
    "status": "published",
    "splash": {
      "eyebrow": "Free course",
      "headline": "A full room. A night that still didn’t pay.",
      "body": "A free four-week course for people who already gather others. About an hour a week.",
      "cta": "Start the course",
      "image": "/sites/new-world/photos/backyard-class.webp",
      "imageAlt": "A teacher leads a stretching class on mats and rugs on a sunny backyard patio",
      "statement": "Count who came *back.*"
    },
    "vera": {
      "intro": {
        "eyebrow": "The Business of Community 101",
        "heading": "You already gather people. Now make it *last.*",
        "body": "Four weeks, about an hour each. What a night costs you, what to charge, who came back, and who to text next week. Free.",
        "cta": "Start the course"
      },
      "identity": {
        "heading": "Put a name to the host",
        "body": "Your people will know you by this. A real name and a photo make the first hello easy."
      },
      "place": {
        "heading": "Where do you gather?",
        "body": "Tell us your town. The course works anywhere, and we will show you who is near you.",
        "intentLabel": "What do you run right now?",
        "intentPlaceholder": "A weekly sound bath, a dance night, a craft table. Say it plainly."
      },
      "tour": {
        "eyebrow": "How it works",
        "heading": "Four weeks. *One idea each.*",
        "body": "The Engine, The Container, The Gathering, The Exchange. Five short lessons a week. The build steps happen in your own Space.",
        "cta": "Next"
      },
      "enter": {
        "eyebrow": "Last step",
        "heading": "Week one is *waiting.*",
        "body": "Confirm your email and you land on the course. Start with The Engine.",
        "cta": "Start week one"
      }
    },
    "slide2Features": [
      { "title": "Classes and workshops", "blurb": "Yoga, breathwork and the rooms you mostly run yourself.", "icon": "learning" },
      { "title": "Sound and circles", "blurb": "Sound baths and circles in studios, homes and parks.", "icon": "heart" },
      { "title": "Meetups and nights out", "blurb": "Dance nights, open mics and the regular thing people plan around.", "icon": "users" },
      { "title": "A house or small venue", "blurb": "A living room, a backyard or a small room that hosts others.", "icon": "map" }
    ],
    "slide3Core": [
      { "title": "Know what a night costs", "blurb": "Rent, gear, your hours. One number you can trust.", "art": { "kind": "render", "render": "crm" } },
      { "title": "Hold the room", "blurb": "Say the rules out loud before the loudest guest makes them.", "art": { "kind": "render", "render": "circles" } },
      { "title": "See who came back", "blurb": "Mark who came to each Event, so you know who came back and who to text.", "art": { "kind": "render", "render": "checkin" } }
    ],
    "destination": { "mode": "direct", "url": "/journeys/the-business-of-community-101" }
  }'::jsonb,
  now()
)
on conflict (slug) do update set
  audience = excluded.audience,
  splash = excluded.splash,
  data = excluded.data,
  updated_at = now();
