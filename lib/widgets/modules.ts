// The catalog of assignable page-LAYOUT modules (ADR-270, the module-assignment engine).
// METADATA ONLY — kept free of the React components (those live in registry.tsx) so the
// editor, the actions, and the resolver can import this without pulling server components.
// Adding a module = add a meta entry here + bind its component in registry.tsx.
//
// ROUTE-SCOPING (ADR-294): a module belongs to a route's module SET, not to every page.
// `ROUTE_MODULE_IDS` maps a scope key ('*', a section '/seg/*', or an exact route) to the
// ids that page offers; `moduleIdsForScope` resolves the set for any key (most-specific
// wins). The renderer + the editor both read through it, so a page only ever shows ITS OWN
// blocks (My Quest's gauges never leak onto the Leadership dashboard, and vice versa).

export interface LayoutModuleMeta {
  id: string
  label: string
  description: string
}

// The union of every known module's metadata (any route's blocks live here). `moduleMeta`
// looks an id up across the whole set; ROUTE_MODULE_IDS decides which subset a page offers.
export const LAYOUT_MODULES: readonly LayoutModuleMeta[] = [
  // ── Community blocks — the generic default set (the global '*' scope) ──
  { id: 'community-pulse', label: 'Community pulse', description: 'Member and active-circle counts at a glance.' },
  { id: 'newest-members', label: 'Newest members', description: 'The latest people to join.' },
  { id: 'popular-channels', label: 'Channels', description: 'The public channels to tune into.' },
  { id: 'top-circles', label: 'Active circles', description: 'Circles filling up across the community.' },

  // ── My Quest blocks (/crew) — the member's season home ──
  { id: 'quest-finish-celebration', label: 'Finish celebration', description: 'The rank-up moment that greets a member after they finish a Journey.' },
  { id: 'quest-intention', label: 'Season intention', description: "The season's theme in the operator's words. The orienting line for the page." },
  { id: 'quest-season-map', label: 'Season map', description: 'The four-Pillar gauges, rank, and season countdown.' },
  { id: 'quest-today', label: 'Today', description: 'The one time-aware next step. The single nudge for today.' },
  { id: 'quest-cta', label: 'Log a practice', description: 'The dominant primary action. Log a practice (pinned to the thumb zone on a phone).' },
  { id: 'quest-my-practices', label: 'My practices', description: "A compact glance at the member's adopted practices, linking to the Practices page." },
  { id: 'quest-journeys', label: 'Your Journeys', description: "The member's adopted and built Journeys, each with its progress." },
  { id: 'quest-next-gathering', label: 'Next gathering', description: 'The next event to show up to in person. The member’s RSVP, or the nearest community event.' },
  // PARKED: retired from My Quest (owner ask — see CREW_MODULE_IDS) and not offered on any
  // other surface today. Its meta + component stay defined so a future page can adopt it; it
  // is intentionally absent from every ROUTE_MODULE_IDS set until then.
  { id: 'quest-tasks', label: 'Tasks', description: 'Circle tasks plus the global task list members complete to earn Zaps.' },
  { id: 'quest-explore', label: 'Explore links', description: 'Quick links to Journeys, Practices, Challenges, and The Vault.' },
  { id: 'quest-leaderboard', label: 'Circle leaderboard', description: "The member's circle ranked by season Zaps." },

  // ── Menu Manager blocks (/admin/menu) — the DB-backed navigation editor, five blocks (ADR-359) ──
  { id: 'menu-surface', label: 'Surface picker', description: 'Pick which navigation surface to edit (Discover, Explore, the admin sub-header, the in-app left rail, or the marketing footer). The only block that sets the active surface; every other menu block scopes to it.' },
  { id: 'menu-groups', label: 'Groups & links', description: 'The bulk of the editor. Menu-level links plus groups and sub-groups with their links: add, edit, delete, drag within and across groups, and set per-item depth, modes, and the per-role visibility matrix, for the active surface.' },
  { id: 'menu-speed', label: 'Open & dwell speed', description: 'The global mega-menu timings (open delay, dwell, fade). Applies to every surface, so it has no surface dependency.' },
  { id: 'menu-layout', label: 'Layout & defaults', description: 'The column count for the active surface, plus the action to seed or reset that surface from the site defaults.' },
  { id: 'menu-rail-cards', label: 'Rail cards', description: 'The left and right featured cards beside the links, for the active surface.' },

  // ── Admin Practices blocks (/admin/content/practices) — the curation workspace ──
  { id: 'admin-practices-stats', label: 'Practice stats', description: 'Headline counts: library size, public, awaiting review, featured, and never-logged.' },
  { id: 'admin-practices-review', label: 'Review queue', description: 'Member-submitted practices waiting for an approve or reject decision, ordered by trust and near-duplicate signal.' },
  { id: 'admin-practices-merge', label: 'Merge duplicates', description: 'Practice pairs the library flagged as near-identical. Pick the one to keep, then fold the copy in, re-pointing every log and tag onto it.' },
  { id: 'admin-practices-attention', label: 'Needs attention', description: 'Public practices with a fixable gap (no Pillar, no image, never logged, going stale), worst quality first.' },
  { id: 'admin-practices-library', label: 'Practice library', description: 'The full faceted curation table. Filter by any signal, then tune what is public, a template, or featured. URL-driven, paginated.' },
  { id: 'admin-practices-tags', label: 'Tag governance', description: 'Promote a member tag to canonical, or merge synonyms into a canonical tag.' },
  { id: 'admin-practices-remix-levers', label: 'Most remixed', description: 'The originals the community has remixed most. A ranked list with each one’s remix count and creator, the lever for what to seed more of.' },
  { id: 'admin-practices-contributor-recognition', label: 'Contributors to celebrate', description: 'The members whose originals the community has remixed most, ranked. Who to thank for growing the library.' },

  // ── Admin Journeys blocks (/admin/content/journeys) — the curation surface ──
  { id: 'admin-journeys-stats', label: 'Journey stats', description: 'Headline counts: library size, awaiting review, official, and active adoptions.' },
  { id: 'admin-journeys-review', label: 'Review queue', description: 'Member-submitted Journeys waiting for an approve or reject decision.' },
  { id: 'admin-journeys-library', label: 'Journey library', description: 'The ranked public library with the official, feature, and restore controls.' },

  // ── Journeys blocks (/journeys) — the member browse + build page ──
  { id: 'journeys-start', label: 'Start a journey', description: 'The two ways in: build your own, or open this season’s official Quest.' },
  { id: 'journeys-mine', label: 'Your journeys', description: 'The journeys the viewer has kept or built.' },
  { id: 'journeys-library', label: 'Community library', description: 'The open library of public journeys to browse and adopt.' },

  // ── Practices blocks (/practices) — the personal sections above the fixed library ──
  { id: 'practices-stats', label: 'Practice stats', description: 'The headline band: your practices, days practiced, current and longest streak, and the library size.' },
  { id: 'practices-activity', label: 'Your activity', description: 'The member’s practice as a bar chart with Days, Weeks, and Months views.' },
  { id: 'practices-balance', label: 'Pillar balance', description: 'How the member’s adopted practices spread across the four Pillars.' },
  { id: 'practices-mine', label: 'Your practices', description: 'The member’s adopted and built practices, each with its log and edit controls.' },
  { id: 'practices-library', label: 'Practice library', description: 'The full, faceted community library, filterable by Pillar, tag, and search, paginated.' },

  // ── Friends blocks (/friends) — the assignable section of the people surface ──
  { id: 'friends-impact', label: 'Your impact', description: 'The member’s own private lead-funnel view: the people on Frequency because of them. Shows nothing until they’ve brought someone in.' },

  // ── Leaderboard blocks (/crew/leaderboard) — the consistency layer ──
  { id: 'leaderboard-consistency', label: 'Consistency', description: 'The daily practice streak (bounded forgiveness) and the weekly show-up rhythms. How the steady person wins, beneath the board.' },

  // ── Journal blocks (/journal) — the member’s captured-moments log ──
  { id: 'journal-entries', label: 'Journal entries', description: 'The member’s captured moments grouped by day, newest first. The feed as a journal.' },

  // ── Library review blocks (/library/review) — the leadership approval queue ──
  { id: 'library-review-queue', label: 'Review queue', description: 'Community submissions waiting to join the Library. Approve to publish, reject to send back (Host+ only).' },

  // ── The Vault blocks (/crew/store) — the member's earnings + the Vault Store ──
  { id: 'vault-standing', label: 'Standing hero', description: 'The four counts, Zaps · Rank · Streak · Gems, the one way a member’s standing renders.' },
  { id: 'vault-leaderboard', label: 'Standing link', description: 'A card linking to the cooperative leaderboard and streaks.' },
  { id: 'vault-summary', label: 'Your Vault', description: 'Amplitude (the lifetime layer), the Zaps & Gems ledger, and equipped winnings.' },
  { id: 'vault-trophies', label: 'Your Trophies', description: 'The lifetime Trophy Case. Every finished Journey, kept across seasons.' },
  { id: 'vault-awards', label: 'Your Awards', description: 'The badge collection, grouped by category, earned vs. secret.' },
  { id: 'vault-store', label: 'Vault Store', description: 'The redeemable categories: cosmetics, titles, badges, membership credits (paid-gated).' },

  // ── Practice detail blocks (/practices/<id>) — the arrangeable body of one practice ──
  { id: 'practice-detail-stats', label: 'Practice stats', description: 'The headline band: reward, cadence, time, practising now, and times logged.' },
  { id: 'practice-detail-about', label: 'Intro', description: 'The plain-language “what this is”, when it adds to the subtitle.' },
  { id: 'practice-detail-guide', label: 'The guide', description: 'The full write-up: why it works, how to do it, and logging it in The Quest.' },
  { id: 'practice-detail-tags', label: 'Tags', description: 'The practice’s tags.' },
  { id: 'practice-detail-usedin', label: 'Used in', description: 'The Journeys and Circles running this practice.' },
  { id: 'practice-detail-lineage', label: 'Remix lineage', description: 'Where this practice was remixed from, how many times it has been remixed, and the other remixes off the same original.' },

  // ── Channels blocks (/channels) — the pillar-grouped topical browse ──
  { id: 'channels-list', label: 'Channels', description: 'The four Pillars (Mind, Body, Spirit, Expression) with the Channels inside each, split into tuned-in and explore, plus the Pillars jump-nav.' },

  // ── Season Challenges blocks (/crew/challenges) — the season's bonus-zap challenges ──
  { id: 'challenges-season', label: 'Season Challenges', description: 'The season KPI band (progress, Zaps, remaining) over the challenges-by-difficulty grid.' },

  // ── Entity profile blocks (/spaces/<slug>/*) — the networked profile module set ──
  // (ENTITY-SPACES-BUILD §B.2). Each is a self-fetching RSC scoped to the ACTIVE Space
  // (lib/spaces/active-space.ts); it reads only that Space's own rows and renders kit primitives,
  // returning null when the Space has nothing.
  { id: 'entity-getting-started', label: 'Getting started', description: 'A single composite empty shown only while a brand-new profile has no content yet.' },
  { id: 'entity-about', label: 'About', description: 'The entity’s story, in plain prose.' },
  { id: 'entity-stats', label: 'Highlights', description: 'Live counts: sessions, offerings, practices, circles.' },
  { id: 'entity-offerings', label: 'Offerings', description: 'Upcoming sessions and events the entity hosts.' },
  { id: 'entity-practices', label: 'Practices & Journeys', description: 'The Practices and Journeys the entity shares.' },
  { id: 'entity-community', label: 'Community', description: 'The Circles the entity runs.' },
  { id: 'entity-team', label: 'Team', description: 'The people behind the entity.' },
  { id: 'entity-cta', label: 'Book', description: 'The primary action. Book a session at an open time.' },

  // ── Pages workspace blocks (/pages) — the operator's "find any page and edit it" surface ──
  { id: 'pages-in-app-member', label: 'In-app pages / Member', description: 'Every member-facing page, opened in place with edit mode on.' },
  { id: 'pages-in-app-focus', label: 'In-app pages / Focus surfaces', description: 'The focused in-app surfaces (boards, timers, scanner), opened in place with edit mode on.' },
  { id: 'pages-splash-funnels', label: 'Splash funnels', description: 'A card into the Splash Funnels library: the onboarding front door and its audience funnels (janitor only).' },
  { id: 'pages-marketing', label: 'Marketing pages', description: 'The public, editor-backed marketing pages with their publish status (janitor only).' },

  // ── Marketing analytics blocks (/admin/marketing/analytics) — read-models off the event backbone ──
  { id: 'marketing-analytics-northstar', label: 'North Star', description: 'The verified-practice north star: weekly active members, practices this week, activation, and new members.' },
  { id: 'marketing-analytics-retention', label: 'Practice retention', description: 'Weekly cohorts: the share of each cohort still logging a practice, the practice-retention (PMF) signal.' },
  { id: 'marketing-analytics-crm', label: 'CRM counts', description: 'Contacts, campaigns, and suppressed addresses at a glance, each linking into its workspace.' },
  { id: 'marketing-analytics-email', label: 'Email', description: 'The email log at a glance: sent, delivered, opened, clicked, bounced, and complained over the last 30 days.' },

  // ── Deliverability blocks (/admin/marketing/deliverability) — outbox health + dead-letter recovery ──
  { id: 'marketing-deliverability-health', label: 'Queue health', description: 'The outbox at a glance: the live send backlog and the dead-letter count.' },
  { id: 'marketing-deliverability-dead-letters', label: 'Dead-letter queue', description: 'Jobs that exhausted every retry, grouped by kind, with one-tap requeue once the cause is fixed.' },

  // ── Resonance Graph blocks (/admin/crm/graph) — the consent-first relationship + health view ──
  { id: 'crm-graph-metrics', label: 'Graph metrics', description: 'Consented members, live double-opt-in connections, and the mean resonance health at a glance.' },
  { id: 'crm-graph-connections', label: 'Strongest connections', description: 'The highest-resonance ties between consenting members, ranked, each with the plain reason behind it.' },

  // ── Playbooks blocks (/admin/crm/playbooks) — the saved Vera plays + their run history ──
  { id: 'crm-playbooks-stats', label: 'Playbook stats', description: 'The headline band: saved plays, runs this week, the platform autonomy default, and the circuit breaker.' },
  { id: 'crm-playbooks-registry', label: 'The registry', description: 'Every saved play, the signal that selects it, and how much it may do on its own.' },
  { id: 'crm-playbooks-runs', label: 'Recent runs', description: 'What ran lately, and how it landed. A wave-off teaches the next night’s ranking.' },

  // ── Community dashboard blocks (/admin/community) — the people and their spaces, as one operator home ──
  { id: 'community-structure', label: 'Structure & people', description: 'The shape of the live site and who is in it: circles, channels, events, regions, broadcasts, the roster, and the staff team, with cumulative membership growth.' },
  { id: 'community-trust-safety', label: 'Trust & safety', description: 'The live queue, led by what needs attention now: open reports, support tickets, partner verification, and recent moderation.' },
  { id: 'community-feed-reach', label: 'Feed reach', description: 'The open-feed switch: open the feed for a young community, or keep the reach gate on so a member sees their own circles and nearby posts.' },
  { id: 'community-manage', label: 'Manage', description: 'One card per working surface in Community, each with a live stat and a link straight to the surface that edits it.' },
  { id: 'community-related', label: 'Related areas', description: 'A cross-link strip to the neighboring workspaces the viewer can enter from here.' },

  // ── Gamification blocks (/admin/gamification) — achievements, challenges, and engagement ──
  { id: 'gamification-season', label: 'Season control', description: 'The current season, with the janitor-only control to end it and open the next.' },
  { id: 'gamification-rewards', label: 'Reward economy', description: 'The live Zap and Gem economy editor: tune what each action earns, add actions, or remove them (janitor only).' },
  { id: 'gamification-metrics', label: 'Economy metrics', description: 'The Rewards v2 health metrics, each against its target band: the North Star, streaks, completion, distribution, and sink rate.' },
  { id: 'gamification-stats', label: 'Engagement stats', description: 'The headline counts: achievements, times unlocked, season challenges, and challenges completed.' },
  { id: 'gamification-top-achievers', label: 'Top achievers', description: 'The five members with the most achievements, each with their Zaps and streak.' },
  { id: 'gamification-achievements', label: 'All achievements', description: 'The full achievements table by sort order, with tier, category, and Zap reward.' },
  { id: 'gamification-challenges', label: 'Season challenges', description: 'The active season challenges, with difficulty, target, and Zap reward.' },

  // ── Audit log blocks (/admin/audit) — the append-only security trail ──
  { id: 'audit-recent-actions', label: 'Recent actions', description: 'The 100 most recent sensitive platform actions, newest first: who did what, to whom.' },

  // ── Structure roster blocks (/admin/hubs, /admin/nexuses) — the editable network tables ──
  { id: 'admin-hubs-roster', label: 'Hub roster', description: 'The editable table of every hub with its nexus, guide, circle count, and status. Edit a row inline; the "no hubs yet" first-use empty leads when the table is empty.' },
  { id: 'admin-nexuses-roster', label: 'Nexus roster', description: 'The editable table of every nexus with its hub count, member cap, mentor, and status. Edit a row inline; the "no nexuses yet" first-use empty leads when the table is empty.' },

  // ── Moderation queue block (/admin/moderation) — the community report queue ──
  { id: 'admin-moderation-queue', label: 'Report queue', description: 'The pending community reports, newest first, each with its target preview and (for member reports) the prior-report count. The "queue is clear" empty leads when nothing is waiting.' },

  // ── Operations dashboard blocks (/admin/operations) — the platform machine as one operator home ──
  { id: 'operations-ai', label: 'AI & assistant', description: 'The AI master switch, the agent actions awaiting review, and the help gaps Vera could not answer. Assistant figures cover the last 7 days.' },
  { id: 'operations-platform', label: 'Platform', description: 'The platform keys: published pages, the audit trail, and whether demo content is present, over the last 7 days.' },
  { id: 'operations-manage', label: 'Manage', description: 'One card per working surface in Operations, each with a live stat and a link straight to the surface that edits it.' },
  { id: 'operations-related', label: 'Related areas', description: 'A cross-link strip to the neighboring workspaces the viewer can enter from here.' },

  // ── Growth dashboard blocks (/admin/growth) — the growth engine as one operator home ──
  { id: 'growth-funnel', label: 'Funnel & activation', description: 'New members joining, and how many reach the North-Star moment (a verified practice) within their first week, over the activation funnel.' },
  { id: 'growth-pipeline', label: 'Pipeline', description: 'Open prospects in the pipeline, their value, and the follow-ups due so nothing stalls.' },
  { id: 'growth-expansion', label: 'Expansion', description: 'Where local member density is crossing the threshold that justifies opening the next Lab.' },
  { id: 'growth-manage', label: 'Manage', description: 'One card per working surface across Acquisition, CRM, and Marketing, each with a live stat and a link to edit it.' },
  { id: 'growth-related', label: 'Related areas', description: 'A cross-link strip to the neighboring workspaces the viewer can enter from here.' },

  // ── Resonance CRM blocks (/admin/crm) — the Platform Resonance CRM cockpit (ADR-459) ──
  { id: 'crm-members', label: 'Members', description: 'The whole scored roster, most-recent first, with the hero sort and live search. Open anyone to see their roles, funnels, pipeline, and recent touches.' },
  { id: 'crm-cockpit-stats', label: 'Health cockpit', description: 'The computed verdict, the live health stat row, the who-needs-attention worklist, and the lifecycle funnel.' },
  { id: 'crm-rising', label: 'About to resonate', description: 'The overlooked pool worth a reach-out: members with room to move who are not yet resonant.' },
  { id: 'crm-trust', label: 'Score trustworthiness', description: 'A backtest of the churn risk calls against what actually happened, so you know whether to trust the scores.' },

  // ── Vera Today block (/admin/crm/today) — the person-plus-action inbox ──
  { id: 'crm-today', label: 'Today', description: 'Vera Today: the person-plus-action cards the model says matter most, each one tap, plus the you-are-at-zero empty.' },

  // ── Members roster block (/admin/crm/members) — the standalone member-viewer, keyed on the URL facet ──
  { id: 'crm-members-roster', label: 'Member roster', description: 'The standalone member roster: the whole scored list with the hero sort and live search. A tier or lifecycle link drills it; open anyone to see their roles, funnels, pipeline, and recent touches.' },

  // ── Leadership dashboard blocks (/lead) — a leader's consolidated home for what they steward ──
  { id: 'lead-stats', label: 'Leader stats', description: 'A glance at what you lead: circles, members reached, upcoming events, and networks.' },
  { id: 'lead-attention', label: 'What needs you', description: 'A short ranked list of the most useful next moves across your circles and events.' },
  { id: 'lead-circles', label: 'Circles you host', description: 'Every circle you host, guide, or mentor, with members and what is coming up.' },
  { id: 'lead-networks', label: 'Your networks', description: 'The hubs you guide and the nexuses you mentor.' },
  { id: 'lead-events', label: 'Upcoming events', description: 'The gatherings coming up across the circles you lead.' },
  { id: 'lead-journeys', label: 'Your Journeys', description: 'The Journeys you authored and the active runs in your circles.' },
  { id: 'lead-spaces', label: 'Spaces you run', description: 'The Spaces you own or admin, each opening its management console. Prompts you to create one if you have none.' },
  { id: 'lead-practices', label: 'Practices you authored', description: 'The Practices you created for the library. Prompts you to build one if you have none.' },
  { id: 'lead-coleaders', label: 'Your co-leaders', description: 'The people who help lead each of your circles, so the load is shared.' },
  { id: 'lead-dispatches', label: 'Messages & dispatches', description: 'The recent announcements and dispatches going out to your circles.' },
  { id: 'lead-recognition', label: 'People to celebrate', description: 'Members in your circles worth thanking or promoting.' },
  { id: 'lead-tools', label: 'Leadership tools', description: 'Crew tasks, Leader Training, and your role training in one place.' },

  // ── Circle detail blocks (/circles/<slug>) — the arrangeable body of one circle: the feed
  // (MAIN by default) plus the info-rail blocks (SIDE). Each self-fetches from the request-scoped
  // circle context (lib/circles/active-circle.ts) and self-hides when it doesn't apply.
  { id: 'circle-feed', label: 'Circle feed', description: "The circle's conversation: the composer (for members) and the post stream." },
  { id: 'circle-members', label: 'Members', description: 'The active members of this circle, host first.' },
  { id: 'circle-health', label: 'Circle health', description: 'Live signals for managers: Zaps earned here, active streaks, new members this week.' },
  { id: 'circle-momentum', label: 'Momentum', description: "The circle's weekly vital signs; hides when there's no signal." },
  { id: 'circle-practice', label: "This week's practice", description: 'The host-assigned practice, with a log button for members.' },
  { id: 'circle-events', label: 'Upcoming events', description: 'The next gatherings for this circle.' },
  { id: 'circle-map', label: 'Venue map', description: "A map of the circle's public meeting place; hides when there's no location." },
  { id: 'circle-meeting', label: 'How we meet', description: 'How and where the circle meets: in person or online, the area, and the time zone. Hides when there is nothing to say.' },
  { id: 'circle-challenges', label: 'Challenges', description: "The shared challenges the circle is taking on together, with the circle's collective progress. Hides when none are adopted." },
  { id: 'circle-invite', label: 'Invite a friend', description: 'Invite tools for the host (manager only).' },
  { id: 'circle-journey-run', label: 'Start a Journey Run', description: 'Start a Journey Run for the circle (manager only).' },
  { id: 'circle-text', label: 'Page text', description: 'A free rich-text note you can place anywhere on the page. Set per circle, with a network default.' },

  // ── Event detail blocks (/events/<slug>) — the FULL arrangeable interior of one event. The fixed
  // header (cover · title · badges · Edit/Manage) and the mobile action bar stay in the page; every
  // content section below — the Join box, warm proof, and facts that used to be a hardcoded aside,
  // plus the post area — is now a movable module. Each self-fetches from the request-scoped event
  // context (lib/events/active-event.ts) and self-hides when it doesn't apply.
  { id: 'event-join', label: 'Join / RSVP', description: 'The RSVP, ticket, check-in, and waitlist actions. Hidden on a cancelled event.' },
  { id: 'event-when-where', label: 'When it runs', description: 'The repeat cadence and the booking window (when RSVPs open and close). Hidden for a one-off with no window.' },
  { id: 'event-attendees', label: 'Waitlist', description: 'How many people are on the waitlist, with an invite to add your name. Hidden when no one is waiting.' },
  { id: 'event-checkin', label: 'Check-in', description: 'A check-in prompt shown only while the event is happening.' },
  { id: 'event-warm-proof', label: 'Warm proof', description: 'Who is going: the avatar pile and a warm line of real attendance numbers.' },
  { id: 'event-facts', label: 'Event facts', description: 'The when card, the capacity line, and the guest list.' },
  { id: 'event-location', label: 'Location & map', description: 'The venue line and the map: the exact spot when the event is geocoded, or the hosting circle’s city-level pin.' },
  { id: 'event-venue-map', label: 'Venue map', description: 'A full-width map of the venue, pinned at the bottom of the main column. Hidden when the event is online or has no location.' },
  { id: 'event-description', label: 'Description', description: "The event's description; host-editable inline." },
  { id: 'event-gallery', label: 'Photo gallery', description: 'The event photo strip with a full-screen lightbox. The header photo leads. Hidden until there are two or more photos.' },
  // Each poster-harvest section is its OWN movable block (no lumped "poster details"): an operator
  // moves or hides any one of them independently. Each renders only when the poster carried it.
  { id: 'event-lineup', label: 'Host', description: "The host's profile with a Message Host button. Hidden when the event has no host." },
  { id: 'event-schedule', label: 'Schedule', description: 'The run of show captured from the poster.' },
  { id: 'event-good-to-know', label: 'Good to know', description: 'The quick what-to-expect tags captured from the poster.' },
  { id: 'event-pricing', label: 'Pricing', description: 'The prices as printed on the poster.' },
  { id: 'event-links', label: 'Links', description: 'The links captured from the poster.' },
  { id: 'event-sponsors', label: 'Sponsors', description: 'The support / credits line from the poster.' },
  { id: 'event-details', label: 'Details', description: 'The other key-value details captured from the poster.' },
  { id: 'event-cohosts', label: 'Cohosts', description: 'The people helping host; the host adds or removes them.' },
  { id: 'event-sales', label: 'Ticket sales', description: 'Sold tickets and refunds for a paid event (host only).' },
  { id: 'event-dispatch', label: 'Post an update', description: 'Compose an Event Dispatch to the page (host or cohost only).' },
  { id: 'event-activity', label: 'Activity', description: 'Event Dispatches and guest comments, newest first.' },
  { id: 'event-recap', label: 'Recap album', description: 'Post-event photos, shown once the event has ended.' },
] as const

// ── Route module SETS (ADR-294) ────────────────────────────────────────────────
// The generic blocks any page can carry — the default everywhere ('*').
const COMMUNITY_MODULE_IDS = ['community-pulse', 'newest-members', 'popular-channels', 'top-circles'] as const

// The Leadership hub (/lead) — a community leader's consolidated home for everything they steward, in
// default render order. lead-stats is the DASHBOARD header (always renders). The CREATOR areas
// (lead-circles, lead-spaces, lead-journeys, lead-practices, lead-events) ALWAYS render too: if the
// leader has made nothing of that type they show a meaningful create prompt (LeadCreatePrompt) instead
// of self-hiding, so the hub reads as a complete dashboard and guides content creation. The remaining
// blocks (attention, networks, dispatches, recognition, co-leaders) still self-hide when empty. The
// generic community blocks are intentionally NOT here: /lead is about what YOU lead. Editable
// order/template via the on-page Settings → Layout panel (/lead is in lib/widgets/module-routes.ts).
const LEAD_MODULE_IDS = [
  'lead-stats',
  'lead-attention',
  'lead-circles',
  'lead-spaces',
  'lead-journeys',
  'lead-practices',
  'lead-events',
  'lead-networks',
  'lead-coleaders',
  'lead-dispatches',
  'lead-recognition',
  'lead-tools',
] as const

// My Quest's own blocks, in default render order (the order they appear when no layout is
// saved — unplaced modules append to the template's first slot in this order).
// Note: 'quest-tasks' was retired from My Quest (owner ask) — the page is the member's
// season home (orient → progress → act), and the global task list muddied that. Its module
// metadata + component stay defined for any future surface; it's just not offered here.
const CREW_MODULE_IDS = [
  'quest-finish-celebration',
  'quest-intention',
  'quest-season-map',
  'quest-today',
  'quest-cta',
  'quest-my-practices',
  'quest-journeys',
  'quest-next-gathering',
  'quest-explore',
  'quest-leaderboard',
] as const

// The Menu Manager page (/admin/menu), in default render order (ADR-359). The DB-backed navigation
// editor is FIVE independently-arrangeable blocks. The Surface picker (menu-surface) is the ONLY
// block that sets the active surface; the three surface-scoped blocks (menu-groups, menu-layout,
// menu-rail-cards) each re-resolve the active surface through the x-search seam (lib/menus/
// active-surface) and edit one independent slice, so they need no shared client state. The single
// auto-materialize-on-default lives ONLY in menu-groups (the primary editor); menu-layout and
// menu-rail-cards ensure the menu row lazily on their own first write, so they never race it.
const MENU_MODULE_IDS = [
  'menu-surface',
  'menu-groups',
  'menu-speed',
  'menu-layout',
  'menu-rail-cards',
] as const

// The admin Practices curation workspace (/admin/content/practices), in default render order:
// the stat band, the member-submission review queue, the quality "needs attention" panel, the
// faceted library table, then tag governance. The stats and the library are BOTH modules now
// (the recipe prefers stats AS a module); the library is URL-driven and reads the page's facets
// from the x-search request header (proxy.ts) via the shared context, so it converts cleanly to a
// module rather than staying hand-rendered. Each block self-fetches and returns null when empty.
const ADMIN_PRACTICES_MODULE_IDS = [
  'admin-practices-stats',
  'admin-practices-review',
  // Phase 2 "Clean" (ADR-438) merge worklist: surfaces the review queue's near-duplicate signal as
  // actionable merge pairs, placed right after the review queue (decide, then dedupe) and before
  // the quality "needs attention" panel.
  'admin-practices-merge',
  'admin-practices-attention',
  'admin-practices-library',
  'admin-practices-tags',
  // Phase 3 "Grow" (ADR-438): the remix levers + contributor recognition, appended AFTER the
  // existing five so the default order ends …tags → remix-levers → contributor-recognition.
  'admin-practices-remix-levers',
  'admin-practices-contributor-recognition',
] as const

// The admin Journeys curation surface, in default render order.
const ADMIN_JOURNEYS_MODULE_IDS = [
  'admin-journeys-stats',
  'admin-journeys-review',
  'admin-journeys-library',
] as const

// The Journeys member page (/journeys), in default render order.
const JOURNEYS_MODULE_IDS = ['journeys-start', 'journeys-mine', 'journeys-library'] as const

// The Friends page (/friends) blocks, in default render order. The bucket lists (incoming/outgoing
// requests, orbit, introductions) stay hand-composed in the page because they depend on the `mode`
// search param a nested module never receives; the trailing "Your impact" section is the assignable
// block, so the page renders it through <PageModules> like every other module-driven surface.
const FRIENDS_MODULE_IDS = ['friends-impact'] as const

// The Leaderboard page (/crew/leaderboard). Only the consistency layer is a module: the collective
// goal, the viewer's standing band, and the individual board all read the scope/track search params a
// nested module never receives, so they stay hand-composed in the page (mirroring how /practices keeps
// its facet toolbar and /friends keeps its mode buckets). The consistency block is keyed only on the
// viewer, so it converts cleanly.
const LEADERBOARD_MODULE_IDS = ['leaderboard-consistency'] as const

// The Journal page (/journal). The whole interior is one self-fetching block — the member's captured
// moments grouped by day (including the first-capture empty) — so it converts wholesale to one module.
const JOURNAL_MODULE_IDS = ['journal-entries'] as const

// The Library review queue (/library/review). The whole interior is one self-fetching, Host-gated
// block, so it converts wholesale. (The /library index itself stays hand-composed: its grid is a
// faceted, type/pillar search-param-driven view a nested module can't receive — like the /practices
// toolbar's facets, but with no x-search seam here.)
const LIBRARY_REVIEW_MODULE_IDS = ['library-review-queue'] as const

// The Practices page (/practices) blocks, in default render order. The faceted Practice Library is
// a module too (practices-library): it's URL-driven, so it reads the page's facets from the
// `x-search` request header (proxy.ts) rather than searchParams, which a nested module never gets.
const PRACTICES_MODULE_IDS = ['practices-stats', 'practices-activity', 'practices-balance', 'practices-mine', 'practices-library'] as const

// Every practice DETAIL page (/practices/<id>) shares one layout, keyed at the '/practices/*'
// section scope — the body sections below, in default order. The page header (title · image ·
// actions) stays fixed; only the body is arrangeable.
const PRACTICE_DETAIL_MODULE_IDS = [
  'practice-detail-stats',
  'practice-detail-about',
  'practice-detail-guide',
  'practice-detail-tags',
  'practice-detail-usedin',
  'practice-detail-lineage',
] as const

// The Vault (/crew/store), in default render order (the original hand-built order).
const VAULT_MODULE_IDS = [
  'vault-standing',
  'vault-leaderboard',
  'vault-summary',
  'vault-trophies',
  'vault-awards',
  'vault-store',
] as const

// The Marketing analytics page (/admin/marketing/analytics), in default render order — read-models
// off the one event backbone + the email log. Each block self-fetches; the CRM and email bands read
// the email stats independently (as the hand-built sections did), so there's no shared-fetch change.
// The marketing layout owns the capability gate, so the modules don't re-gate.
const MARKETING_ANALYTICS_MODULE_IDS = [
  'marketing-analytics-northstar',
  'marketing-analytics-retention',
  'marketing-analytics-crm',
  'marketing-analytics-email',
] as const

// The Deliverability page (/admin/marketing/deliverability), in default render order — outbox queue
// health then the dead-letter queue. The page keeps its own marketing-staff gate (it reads the admin
// client); the modules render only through that gated route.
const MARKETING_DELIVERABILITY_MODULE_IDS = [
  'marketing-deliverability-health',
  'marketing-deliverability-dead-letters',
] as const

// The Resonance Graph page (/admin/crm/graph), in default render order — the consent-first metric row
// then the ranked list of the strongest consented connections. Each block self-fetches (fail-safe) and
// reads only double-opt-in ties. The page keeps its own janitor/insights staff gate; the modules render
// only through that gated route, so they never re-gate.
const CRM_GRAPH_MODULE_IDS = ['crm-graph-metrics', 'crm-graph-connections'] as const

// The Playbooks page (/admin/crm/playbooks), in default render order — the stat band, the code-registry
// table, then the recent run history. Each block self-fetches (fail-safe); the stats and runs read the
// activity independently (as the hand-built sections did), so there's no shared-fetch change. The page
// keeps its own janitor gate (and its idempotent seedPlaybooks sync); the modules render only through it.
const CRM_PLAYBOOKS_MODULE_IDS = ['crm-playbooks-stats', 'crm-playbooks-registry', 'crm-playbooks-runs'] as const

// The Intelligence page (/admin/crm/intelligence) — the unified Resonance CRM surface that merges Vera
// Today, Playbooks, and the Resonance Graph into one operator page (owner merge). Default arrangement
// order: the two stat rows (Playbooks headline, then the Graph metric row) lead the full-width stats
// band, then Vera Today (MAIN) beside the saved plays + strongest-connections (SIDE). Each block is an
// existing self-fetching, fail-safe RSC, REUSED unchanged. This set documents the page's blocks; the
// page COMPOSES them directly (app/(main)/admin/crm/intelligence/page.tsx) rather than through
// <PageModules>, because the two Resonance Graph blocks carry an ADDITIONAL staff 'insights' gate the
// per-route engine can't express per block — so the page is intentionally NOT in module-routes.ts (no
// Layout editor) and every id here is already reachable via its own former route set.
const CRM_INTELLIGENCE_MODULE_IDS = [
  'crm-playbooks-stats',
  'crm-graph-metrics',
  'crm-today',
  'crm-playbooks-registry',
  'crm-playbooks-runs',
  'crm-graph-connections',
] as const

// The Community dashboard (/admin/community), in default render order — the Structure & people band,
// the live Trust & safety queue, the Feed reach switch, the Manage grid, then the Related areas strip.
// Each block self-fetches (fail-safe); the page keeps its host + community-staff gate, and every linked
// area keeps its own, so the modules render only through the gated route and never re-gate.
const COMMUNITY_ADMIN_MODULE_IDS = [
  'community-structure',
  'community-trust-safety',
  'community-feed-reach',
  'community-manage',
  'community-related',
] as const

// The Gamification page (/admin/gamification), in default render order — the season control, the
// janitor-only reward-economy editor, the Rewards v2 metrics, the stat band, the top-achievers
// leaderboard, then the achievements + season-challenges tables. Each block self-fetches (fail-safe);
// the page keeps its host + community-staff gate, and the reward editor self-gates further to the
// web_role janitor axis (the same axis its server actions enforce), so it renders null for a non-
// janitor. The modules render only through the gated route and never re-gate.
const GAMIFICATION_MODULE_IDS = [
  'gamification-season',
  'gamification-rewards',
  'gamification-metrics',
  'gamification-stats',
  'gamification-top-achievers',
  'gamification-achievements',
  'gamification-challenges',
] as const

// The Audit log (/admin/audit). The whole interior is one self-fetching security trail, keyed only on
// recency with no searchParams facet, so it converts wholesale to one module. The page keeps its
// admin gate; the module renders only through that gated route.
const AUDIT_MODULE_IDS = ['audit-recent-actions'] as const

// The Hubs admin page (/admin/hubs). The whole interior is one self-fetching roster (the editable hub
// table + its first-use empty). Its only page facet is the ?edit=<id> deep-link, which the module reads
// from the x-search request header (the admin-practices-library seam), so it converts wholesale to one
// module. The page keeps its guide + structure-staff gate.
const ADMIN_HUBS_MODULE_IDS = ['admin-hubs-roster'] as const

// The Nexuses admin page (/admin/nexuses). The whole interior is one self-fetching roster (the editable
// nexus table + its first-use empty), keyed only on the ?edit=<id> deep-link read from the x-search
// header, so it converts wholesale to one module. The page keeps its mentor + structure-staff gate.
const ADMIN_NEXUSES_MODULE_IDS = ['admin-nexuses-roster'] as const

// The Moderation admin page (/admin/moderation). The whole interior is one self-fetching report queue
// (the pending reports with their target previews + the "queue is clear" empty), keyed only on the
// pending status with no searchParams facet, so it converts wholesale to one module. The page keeps its
// host + community-staff gate; the module renders only through that gated route, so it never re-gates.
const ADMIN_MODERATION_MODULE_IDS = ['admin-moderation-queue'] as const

// The Operations dashboard (/admin/operations), in default render order — the AI & assistant KPIs, the
// platform/system-health stats, the Manage grid (one card per working sub-page), then the Related areas
// strip. Each block self-fetches (fail-safe); the page keeps its janitor + platform-staff gate, and
// every linked area keeps its own, so the modules render only through the gated route and never re-gate.
const OPERATIONS_MODULE_IDS = [
  'operations-ai',
  'operations-platform',
  'operations-manage',
  'operations-related',
] as const

// The Growth dashboard (/admin/growth), in default render order — the funnel & activation KPIs, the deal
// pipeline, expansion readiness, the Manage grid (one card per working sub-page across Acquisition, CRM,
// and Marketing), then the Related areas strip. Each block self-fetches (fail-safe); the page keeps its
// marketing-staff gate and every tool sub-route re-gates, so the modules render only through the gated
// route and never re-gate.
const GROWTH_MODULE_IDS = [
  'growth-funnel',
  'growth-pipeline',
  'growth-expansion',
  'growth-manage',
  'growth-related',
] as const

// The Vera Today page (/admin/crm/today). The whole interior is one self-fetching, janitor-gated block
// (the five person-plus-action cards + the you-are-at-zero empty), keyed only on the model's scores with
// no searchParams facet, so it converts wholesale to one module. The page keeps its janitor gate.
const CRM_TODAY_MODULE_IDS = ['crm-today'] as const

// The standalone Resonance CRM members page (/admin/crm/members). The whole interior is one self-
// fetching roster (the fully-featured member-viewer + its fail-safe empty), keyed only on the
// ?tier=/?stage= URL facet, which the module reads from the x-search request header (the admin-hubs /
// practices-library seam), so it converts wholesale to one module. The page keeps its requireAdmin
// gate; this is its OWN route (out of the /admin/crm cockpit set, whose crm-members block never leaks
// here and vice versa).
const CRM_MEMBERS_MODULE_IDS = ['crm-members-roster'] as const

// The Channels page (/channels). The whole pillar-grouped browse (the toc, the four Pillars with
// their Channels split tuned-in vs explore, and the Pillars jump-nav) derives from one viewer-scoped
// fetch with no searchParams facet, so the whole interior converts wholesale to one module.
const CHANNELS_MODULE_IDS = ['channels-list'] as const

// Season Challenges (/crew/challenges). The KPI band and the challenges-by-difficulty grid derive
// from one viewer-scoped fetch, so the whole interior is one module rather than a double-fetch.
const CHALLENGES_MODULE_IDS = ['challenges-season'] as const

// Every entity-profile block, in the Practitioner default order (ENTITY-SPACES-BUILD §B.3). This
// is the FAMILY palette for the '/spaces/*' section scope — the full set the layout editor offers
// on any profile tab. The route shell passes the per-TAB subset (the blueprint's tab.modules) to
// PageModules as `moduleIds`, so a tab renders only its own blocks; this set governs what an
// operator may arrange. New role blueprints reuse the same registry bindings (one change updates
// every profile of every type — the C3 guarantee).
const SPACE_MODULE_IDS = [
  'entity-getting-started',
  'entity-about',
  'entity-stats',
  'entity-offerings',
  'entity-practices',
  'entity-community',
  'entity-team',
  'entity-cta',
] as const

// The Pages workspace (/pages), in default render order — the one place to find any page and
// open it ready to edit. The two in-app blocks render for every operator (admin+); the splash
// and marketing blocks self-gate to janitor, so a Site Admin sees only the in-app areas. Order
// here is the default stack when no layout is saved; operators rearrange them in the Layout editor.
const PAGES_MODULE_IDS = [
  'pages-in-app-member',
  'pages-in-app-focus',
  'pages-splash-funnels',
  'pages-marketing',
] as const

// Every circle DETAIL page (/circles/<slug>) shares one layout, keyed at the '/circles/*' section
// scope — the arrangeable body in default render order (feed leads, then the info-rail blocks). The
// page header (cover · title · badges · Join/Settings) stays fixed; only the body is arrangeable.
const CIRCLE_DETAIL_MODULE_IDS = [
  'circle-feed',
  'circle-members',
  'circle-health',
  'circle-momentum',
  'circle-practice',
  'circle-challenges',
  'circle-events',
  'circle-map',
  'circle-meeting',
  'circle-invite',
  'circle-journey-run',
  'circle-text',
] as const

// Every event DETAIL page (/events/<slug>) shares one layout, keyed at the '/events/*' section
// scope — the FULL arrangeable interior in default render order. Only the fixed header (cover ·
// title · badges · Edit/Manage) and the mobile action bar stay in the page; everything else is
// module-driven, so an operator can move ANY block from the on-page Layout editor.
//
// The default interior layout (lib/page-settings/default-layouts.ts) places these in a Main + side
// grid: the post area (description → poster → activity → recap → location) leads MAIN, while the
// Join box, facts, and warm proof fill the SIDE column.
//
// CLEANUP (event page trim): four blocks were pulled from this set so they no longer render (a set
// member with no explicit placement is auto-appended to MAIN, so the ONLY way to stop a block is to
// drop it from the set — that also strips it from any saved layout, since the resolver filters a
// saved slot's order by this set):
//   • 'event-venue-map' — a bare second venue map; the ONE canonical venue block is 'event-location'
//     (address line + map), kept below.
//   • 'event-gallery'   — a duplicate photo strip; the primary hero gallery renders in the page.
//   • 'event-pricing'   — the poster "Pricing" box, and 'event-sales' — the host ticket-sales box.
//     Ticketing lives in the Join box; the sold count is folded onto the RSVP ticket card.
// Those four DEFINITIONS stay in LAYOUT_MODULES (and PARKED in modules.test.ts) so they compile.
//
// The 'event-dispatch' composer is NO LONGER a default block: the host "Post an update" composer is
// now folded INTO the activity module (event-activity renders it for hosts/cohosts, the say-hi
// composer for everyone else), so there is one composer, not two boxes. The 'event-details' block
// (the poster key-value details) is likewise out of the default set. Both module DEFINITIONS stay
// in LAYOUT_MODULES so an operator can re-add either from the Layout editor; they're just absent
// from the out-of-the-box layout.
const EVENT_DETAIL_MODULE_IDS = [
  // Post area (defaults to MAIN) — every poster section is its own movable block (no lumping).
  'event-description',
  'event-lineup',
  'event-schedule',
  'event-good-to-know',
  'event-links',
  'event-sponsors',
  'event-cohosts',
  'event-activity',
  'event-recap',
  // Former Join aside (defaults to SIDE).
  'event-join',
  'event-facts',
  // The ONE canonical venue block — the address line + its map — pinned at the bottom of MAIN by
  // the default layout (self-hides for an online event or with no address/geo).
  'event-location',
  // Spine-paired blocks (LP-EVENT): Place & Time → when/where; People → waitlist; Engage →
  // check-in. Each self-hides when it has nothing, so they cost one query and render nothing off
  // their window.
  'event-when-where',
  'event-attendees',
  'event-checkin',
  // Warm proof (social proof) fills the SIDE column. Its data is computed in active-event.ts and
  // its metadata says it belongs here, but it was missing from this set + the default layout, so
  // it could never render or be added from the Layout editor (site-audit BUG-1).
  'event-warm-proof',
] as const

/** Scope key → the module ids that page offers. A key is the global default ('*'), a section
 *  ('/seg/*'), or an exact route. Add a route's set here when you convert its page to
 *  `<PageModules>` (and list it in lib/widgets/module-routes.ts). */
export const ROUTE_MODULE_IDS: Record<string, readonly string[]> = {
  '*': COMMUNITY_MODULE_IDS,
  '/admin/menu': MENU_MODULE_IDS,
  '/lead': LEAD_MODULE_IDS,
  '/crew': CREW_MODULE_IDS,
  '/admin/content/practices': ADMIN_PRACTICES_MODULE_IDS,
  '/admin/content/journeys': ADMIN_JOURNEYS_MODULE_IDS,
  '/admin/marketing/analytics': MARKETING_ANALYTICS_MODULE_IDS,
  '/admin/marketing/deliverability': MARKETING_DELIVERABILITY_MODULE_IDS,
  '/admin/crm/graph': CRM_GRAPH_MODULE_IDS,
  '/admin/crm/playbooks': CRM_PLAYBOOKS_MODULE_IDS,
  '/admin/community': COMMUNITY_ADMIN_MODULE_IDS,
  '/admin/operations': OPERATIONS_MODULE_IDS,
  '/admin/growth': GROWTH_MODULE_IDS,
  // NOTE: '/admin/crm' (the master-detail Resonance home) is intentionally NOT a module route — it
  // composes its own kit directly (the roster + the compact stat row), and its former cockpit blocks
  // (verdict/worklist/funnel, rising-members, trust-backtest) were re-homed to /admin/crm/intelligence.
  // Registering it would make the on-page Layout editor offer blocks the page does not render.
  '/admin/crm/today': CRM_TODAY_MODULE_IDS,
  '/admin/crm/intelligence': CRM_INTELLIGENCE_MODULE_IDS,
  '/admin/crm/members': CRM_MEMBERS_MODULE_IDS,
  '/admin/gamification': GAMIFICATION_MODULE_IDS,
  '/admin/audit': AUDIT_MODULE_IDS,
  '/admin/hubs': ADMIN_HUBS_MODULE_IDS,
  '/admin/nexuses': ADMIN_NEXUSES_MODULE_IDS,
  '/admin/moderation': ADMIN_MODERATION_MODULE_IDS,
  '/journeys': JOURNEYS_MODULE_IDS,
  '/friends': FRIENDS_MODULE_IDS,
  '/crew/leaderboard': LEADERBOARD_MODULE_IDS,
  '/journal': JOURNAL_MODULE_IDS,
  '/library/review': LIBRARY_REVIEW_MODULE_IDS,
  '/practices': PRACTICES_MODULE_IDS,
  // Section scope: applies to every /practices/<id> detail page (shared layout).
  '/practices/*': PRACTICE_DETAIL_MODULE_IDS,
  '/crew/store': VAULT_MODULE_IDS,
  '/crew/challenges': CHALLENGES_MODULE_IDS,
  '/channels': CHANNELS_MODULE_IDS,
  // Section scope: every entity profile tab (/spaces/<slug>/<tab>) shares one family module set;
  // the shell narrows it to the active tab's blocks via the `moduleIds` override (ADR-294).
  '/spaces/*': SPACE_MODULE_IDS,
  '/pages': PAGES_MODULE_IDS,
  // Section scope: every circle detail page (/circles/<slug>) shares one layout.
  '/circles/*': CIRCLE_DETAIL_MODULE_IDS,
  // Section scope: every event detail page (/events/<slug>) shares one layout.
  '/events/*': EVENT_DETAIL_MODULE_IDS,
}

// The scope keys that can carry a module set for `key`, MOST-SPECIFIC FIRST: an exact route
// inherits its section then the global default; a section inherits the global default; '*' is
// itself. Mirrors the layout scope cascade (lib/page-settings/layout.ts) but stays self-
// contained so this file keeps zero dependencies.
//
// SPACE LAYER (Phase 0.5a): a per-entity profile route (e.g. '/spaces/<slug>/about') is a
// concrete route, so its chain already emits the route's own key, then the SPACE-SCOPED
// SECTION key ('/spaces/*' — the family default for every entity profile), and only THEN the
// global '*' fallback. So a space's profile tabs resolve their own module set before any
// global default, with no special-casing here once those '/spaces/*' sets are registered.
export function moduleScopeChain(key: string): string[] {
  if (key === '*') return ['*']
  if (key.endsWith('/*')) return [key, '*']
  const seg = key.split('/').filter(Boolean)[0]
  return seg ? [key, `/${seg}/*`, '*'] : ['*']
}

/** The module ids offered at a scope key (an exact route, a section '/seg/*', or '*'): the
 *  most-specific level in the chain that declares a set wins; else the global default. Both
 *  the renderer (PageModules) and the editor (page-settings/actions) resolve through this, so
 *  what an operator can arrange always matches what the page actually renders. */
export function moduleIdsForScope(key: string): readonly string[] {
  for (const k of moduleScopeChain(key)) {
    const ids = ROUTE_MODULE_IDS[k]
    if (ids) return ids
  }
  return ROUTE_MODULE_IDS['*'] ?? COMMUNITY_MODULE_IDS
}

export function moduleMeta(id: string): LayoutModuleMeta | undefined {
  return LAYOUT_MODULES.find((m) => m.id === id)
}
