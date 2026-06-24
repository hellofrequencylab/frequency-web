-- =====================================================================
-- Starter Circles, part 2 of 3: seed the twelve blueprints.
-- =====================================================================
-- Twelve interest-based clubs, three per Pillar. Each leans one primary Pillar
-- and carries the other three inside it. Copy is authored in the brand voice
-- (plain sentences, proper nouns carry the magic, no em dashes, skeptic test).
-- Fixed UUIDs under the 'ce110000-' prefix so the set is easy to find and purge
-- (DELETE FROM circle_templates WHERE id::text LIKE 'ce110000-%'). Seeded active;
-- the global 'circle_templates_enabled' master switch (off by default) still
-- gates the whole member-facing surface until an operator turns it on.
-- Idempotent: ON CONFLICT (id) DO NOTHING never clobbers later operator edits.
-- =====================================================================

-- ── MIND ─────────────────────────────────────────────────────────────

INSERT INTO circle_templates (id, slug, name, primary_pillar, identity, audience, card, one_liner, pillars_inside, meetup, gathering, thread, format, size_label, agreements, recommended_journey_pillar, remix_options, is_active, display_order)
VALUES (
  'ce110000-0000-4000-8000-000000000001', 'the-reading-room', $$The Reading Room$$, 'mind',
  $$a book club for people who miss reading and miss good conversation.$$,
  $$readers who fell off, people who want smarter talk than the group chat offers, anyone rebuilding an attention span.$$,
  $$you miss reading and miss real conversation. Here's both.$$,
  $$For people who want to read more and talk to people who actually think. Pick a book, read on your own, meet to dig in. You leave with new ideas and new people.$$,
  jsonb_build_object(
    'mind', $$the book, the ideas, the discussion.$$,
    'body', $$meet over coffee, or run it as a walk-and-talk.$$,
    'spirit', $$stories that touch something real, talked about honestly.$$,
    'expression', $$writing reflections, leading a session, picking the next book.$$),
  jsonb_build_object('text', $$Discussion night. Open with a check-in, then dig into the reading, host guides with a few questions. In person at a cafe or home, or virtual.$$, 'length', $$75 to 90 minutes$$),
  jsonb_build_object('text', $$A bookstore crawl, a library visit, an author talk, or a longer reading-and-brunch session.$$),
  $$Quotes, reactions, what people are reading on the side, next-book votes.$$,
  $$In person is best for the conversation. Virtual works fully. Hybrid lets travelers and homebodies stay in.$$,
  $$5 to 10$$,
  jsonb_build_array($$read what you can, no shame if you didn't finish$$, $$everyone's read counts$$, $$no spoilers past the agreed chapter$$),
  'mind',
  jsonb_build_array($$a single-genre club (sci-fi, history, business)$$, $$a short-story or essay club for busy people$$, $$a "one article each" version$$, $$a classics club$$, $$a local-authors club$$),
  true, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO circle_templates (id, slug, name, primary_pillar, identity, audience, card, one_liner, pillars_inside, meetup, gathering, thread, format, size_label, agreements, recommended_journey_pillar, remix_options, is_active, display_order)
VALUES (
  'ce110000-0000-4000-8000-000000000002', 'compound', $$Compound$$, 'mind',
  $$a money club for figuring out personal finance with people instead of alone.$$,
  $$anyone stressed about money, saving for something, getting out of debt, learning to invest, or just tired of doing it in the dark.$$,
  $$money stresses you out alone. Figure it out with people.$$,
  $$For people who want to get a handle on money without the bro-finance noise. Learn the basics, set real goals, check in honestly. You leave clearer and less alone with it.$$,
  jsonb_build_object(
    'mind', $$the learning, the planning, the numbers.$$,
    'spirit', $$your relationship with money, what enough means, values behind spending.$$,
    'expression', $$sharing goals out loud, telling the group what you're working toward.$$,
    'body', $$the discipline of it, the habits that hold.$$),
  jsonb_build_object('text', $$A topic each time (budgeting, investing basics, debt, taxes), plus a check-in on personal goals. No financial advice given as a pro, just shared learning. In person or virtual.$$, 'length', $$60 to 75 minutes$$),
  jsonb_build_object('text', $$A longer workshop session, a guest who knows a thing, or a casual money and brunch goal-setting morning.$$),
  $$Articles, tools, wins, questions, accountability nudges.$$,
  $$Virtual works great for this one. In person builds the trust that makes money talk honest. Hybrid is ideal.$$,
  $$5 to 10$$,
  jsonb_build_array($$no judgment about anyone's number$$, $$no selling or pitching products$$, $$what's shared stays here$$, $$this is shared learning not professional advice$$),
  'mind',
  jsonb_build_array($$a FIRE and investing club$$, $$a debt-payoff support group$$, $$a side-income and entrepreneurship club$$, $$a money for creatives$$, $$a couples-and-money circle$$),
  true, 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO circle_templates (id, slug, name, primary_pillar, identity, audience, card, one_liner, pillars_inside, meetup, gathering, thread, format, size_label, agreements, recommended_journey_pillar, remix_options, is_active, display_order)
VALUES (
  'ce110000-0000-4000-8000-000000000003', 'game-night', $$Game Night$$, 'mind',
  $$a club built on board games, trivia, chess, and strategy. Easy plans, real people, no small talk.$$,
  $$people who want a low-pressure standing hang, the competitive-in-a-fun-way, anyone who hates forced mingling but loves a game.$$,
  $$easy plans, real people, no small talk. Just play.$$,
  $$For people who want a regular, no-pressure way to see people. Bring a game or learn one, play, talk trash, go home with friends. The game does the social work for you.$$,
  jsonb_build_object(
    'mind', $$strategy, problem-solving, learning new games.$$,
    'expression', $$the play, the banter, the table talk.$$,
    'spirit', $$showing up for the same faces, week after week.$$,
    'body', $$getting off the couch and into the room.$$),
  jsonb_build_object('text', $$Game night. Rotate board games, card games, trivia, or chess. Newcomers always welcome, someone always teaches. In person ideal.$$, 'length', $$2 hours$$),
  jsonb_build_object('text', $$A longer tournament, a trivia night out, a game cafe trip, or a big group game day.$$),
  $$What to bring, who's in, game recommendations, trivia questions of the day.$$,
  $$In person is the heart of it. A virtual version (online board games, video trivia) keeps it alive for remote folks and bad-weather weeks.$$,
  $$6 to 12$$,
  jsonb_build_array($$teach newcomers without sighing$$, $$competitive but kind$$, $$everyone gets dealt in$$, $$phones down during play$$),
  'mind',
  jsonb_build_array($$a board-game-only club$$, $$a trivia team$$, $$a chess circle$$, $$a tabletop RPG group$$, $$a poker night$$, $$a puzzle and escape-room club$$),
  true, 3)
ON CONFLICT (id) DO NOTHING;

-- ── BODY ─────────────────────────────────────────────────────────────

INSERT INTO circle_templates (id, slug, name, primary_pillar, identity, audience, card, one_liner, pillars_inside, meetup, gathering, thread, format, size_label, agreements, recommended_journey_pillar, remix_options, is_active, display_order)
VALUES (
  'ce110000-0000-4000-8000-000000000004', 'run-club', $$Run Club$$, 'body',
  $$a running club with group runs at a set time, all paces, coffee after.$$,
  $$runners who lose steam alone, beginners who need a reason to start, anyone who wants fitness and friends in the same hour.$$,
  $$you run better when someone's waiting. Show up, run, coffee.$$,
  $$For people who run better with company and want a standing reason to show up. Meet, run your pace, hang out after. The crew is the accountability and the reward.$$,
  jsonb_build_object(
    'body', $$the run, the miles, the consistency.$$,
    'mind', $$the headspace a run clears, the screen-free hour.$$,
    'spirit', $$the rhythm, the quiet, the steady breath.$$,
    'expression', $$the post-run hang, the shared routes and wins.$$),
  jsonb_build_object('text', $$A shorter weekday group run, set time and start point, all paces, regroup at the end. In person.$$, 'length', $$45 to 60 minutes including the hang$$),
  jsonb_build_object('text', $$The long run, a trail run, or a local race the group signs up for together, food after.$$),
  $$Routes, paces, who's running when, race plans, weather calls.$$,
  $$In person by nature. A virtual version (log your solo run, share it to the Thread) keeps far-flung members connected.$$,
  $$any size works, 5 to 20-plus$$,
  jsonb_build_array($$all paces welcome$$, $$no one runs alone unless they want to$$, $$we wait or loop back$$, $$safety first on routes and dark hours$$),
  'body',
  jsonb_build_array($$a beginner couch-to-5K club$$, $$a trail-running crew$$, $$a stroller-running parents group$$, $$a marathon-training cohort$$, $$a run-walk club for any fitness level$$),
  true, 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO circle_templates (id, slug, name, primary_pillar, identity, audience, card, one_liner, pillars_inside, meetup, gathering, thread, format, size_label, agreements, recommended_journey_pillar, remix_options, is_active, display_order)
VALUES (
  'ce110000-0000-4000-8000-000000000005', 'the-trailhead', $$The Trailhead$$, 'body',
  $$an outdoor club for people who feel better outside and want company doing it.$$,
  $$people who keep meaning to get outdoors, the new-to-an-area, the wired who go quiet in nature.$$,
  $$you feel better outside. This makes it a standing plan.$$,
  $$For anyone who calms down in nature and rarely makes the time. Hikes, walks, and outdoor days as a standing plan. You move, you breathe, you make friends on the trail.$$,
  jsonb_build_object(
    'body', $$the hikes, the walks, the miles.$$,
    'spirit', $$the views, the quiet, the smallness you feel outside.$$,
    'mind', $$planning routes, learning the local land, a screen-free reset.$$,
    'expression', $$trip photos, trail stories, a shared map of where the Circle has been.$$),
  jsonb_build_object('text', $$A short evening hang to plan the weekend route and check in. In person at a cafe or virtual.$$, 'length', $$45 to 60 minutes$$),
  jsonb_build_object('text', $$The hike or outdoor activity, the main event, in person, food after.$$),
  $$Trail finds, photos, gear talk, carpools, who's in for the weekend.$$,
  $$The Weekend Gathering is always in person, the outdoors is the point. The midweek planning runs virtual. Hybrid is ideal.$$,
  $$5 to 15$$,
  jsonb_build_array($$no one gets left behind on pace$$, $$all levels welcome$$, $$leave no trace$$, $$phones for photos and safety only$$),
  'body',
  jsonb_build_array($$a sunrise-walk version$$, $$a peak-bagging version for the serious$$, $$a families-and-kids nature club$$, $$a tide-pools-and-beach version$$, $$a city-parks version for people without a car$$),
  true, 5)
ON CONFLICT (id) DO NOTHING;

INSERT INTO circle_templates (id, slug, name, primary_pillar, identity, audience, card, one_liner, pillars_inside, meetup, gathering, thread, format, size_label, agreements, recommended_journey_pillar, remix_options, is_active, display_order)
VALUES (
  'ce110000-0000-4000-8000-000000000006', 'pickup', $$Pickup$$, 'body',
  $$a casual social-sport club, pickleball first, whatever the group's into. Low skill bar, high fun.$$,
  $$people who want to sweat without taking it too seriously, the social and competitive, anyone curious about pickleball or padel.$$,
  $$fun, sweat, zero pressure. Pick up a paddle and play.$$,
  $$For people who want movement that feels like play, not a workout. Show up, get matched, rally, laugh. No skill required and no one keeps real score unless you want to.$$,
  jsonb_build_object(
    'body', $$the sport, the movement, the sweat.$$,
    'expression', $$the play, the friendly trash talk.$$,
    'mind', $$the strategy, learning the game.$$,
    'spirit', $$the standing crew you sweat with.$$),
  jsonb_build_object('text', $$Open play. Rotate partners, mix skill levels, newcomers get taught. In person at a court or park.$$, 'length', $$60 to 90 minutes$$),
  jsonb_build_object('text', $$A longer session, a mini-tournament, or a court day plus food.$$),
  $$Court bookings, who's in, skill-up tips, ride shares.$$,
  $$In person by nature. Virtual is limited here, but the Thread keeps the crew warm between sessions.$$,
  $$6 to 16$$,
  jsonb_build_array($$beginners always welcome$$, $$mix up partners$$, $$fun over winning$$, $$share the courts and the gear$$),
  'body',
  jsonb_build_array($$a pickleball-only club$$, $$a padel club$$, $$a casual multi-sport pickup games club (basketball, soccer, volleyball)$$, $$a beginners-only league$$, $$a sport then beer social$$),
  true, 6)
ON CONFLICT (id) DO NOTHING;

-- ── SPIRIT ───────────────────────────────────────────────────────────

INSERT INTO circle_templates (id, slug, name, primary_pillar, identity, audience, card, one_liner, pillars_inside, meetup, gathering, thread, format, size_label, agreements, recommended_journey_pillar, remix_options, is_active, display_order)
VALUES (
  'ce110000-0000-4000-8000-000000000007', 'still', $$Still$$, 'spirit',
  $$a mindfulness club that turns sitting quietly into a standing plan, so it actually happens.$$,
  $$people who know stillness would help and never do it, the always-wired, the curious-but-skeptical.$$,
  $$you know sitting quietly would help. We do it together.$$,
  $$For people who mean to meditate and never do. Sit together for a bit, then talk if you want. The group is the reason it happens. Honest about what it is, easy to walk into.$$,
  jsonb_build_object(
    'spirit', $$the stillness, the practice, the inner quiet.$$,
    'mind', $$quieting the noise, the mental reset.$$,
    'body', $$the breath, the body settling.$$,
    'expression', $$the few words shared after, if anyone wants.$$),
  jsonb_build_object('text', $$A guided or silent sit, host keeps time, then an open few minutes to talk, no pressure to share. In person ideal, virtual works well.$$, 'length', $$45 to 60 minutes$$),
  jsonb_build_object('text', $$A longer session, a nature sit, a sound bath, a slow morning, or a half-day quiet retreat.$$),
  $$A daily nudge, what helped, short practices to try, no preachiness.$$,
  $$In person is calming and social. Virtual keeps the habit consistent. Hybrid suits busy weeks.$$,
  $$5 to 12$$,
  jsonb_build_array($$it's meditation, no mysticism required$$, $$no fixing each other$$, $$silence is welcome$$, $$come as you are$$),
  'spirit',
  jsonb_build_array($$a morning-sit-before-work version$$, $$a breathwork circle$$, $$a candlelit evening version$$, $$a walking-meditation version for people who can't sit still$$, $$a sober-and-still group$$),
  true, 7)
ON CONFLICT (id) DO NOTHING;

INSERT INTO circle_templates (id, slug, name, primary_pillar, identity, audience, card, one_liner, pillars_inside, meetup, gathering, thread, format, size_label, agreements, recommended_journey_pillar, remix_options, is_active, display_order)
VALUES (
  'ce110000-0000-4000-8000-000000000008', 'the-deep-end', $$The Deep End$$, 'spirit',
  $$a small, consistent circle for honest conversation and the kind of real friendship adults rarely get.$$,
  $$people doing okay on paper who have no one they talk to honestly. Runs as men's, women's, or mixed.$$,
  $$fine on paper, known by no one. This changes that.$$,
  $$For capable people who keep their real life to themselves. A small group, one real question at a time, honest talk and real listening. You leave less alone in your own head.$$,
  jsonb_build_object(
    'spirit', $$meaning, values, the bigger questions, what matters.$$,
    'mind', $$getting what's actually going on out of your head.$$,
    'body', $$a grounding practice, a walk or breath, to open or close.$$,
    'expression', $$saying the true thing out loud and being heard.$$),
  jsonb_build_object('text', $$The core. One real question or a check-in round, listening not fixing, host goes first to set the depth. In person ideal, virtual keeps it consistent.$$, 'length', $$75 to 90 minutes$$),
  jsonb_build_object('text', $$Something lighter and bonding, a meal, a walk, a low-key hang, so it's not all heavy.$$),
  $$A private space to check in between meetings.$$,
  $$In person is strongly recommended for trust. Virtual keeps it alive when adults get busy. Hybrid is the realistic answer.$$,
  $$5 to 8, capped small on purpose$$,
  jsonb_build_array($$what's said here stays here$$, $$listen without fixing$$, $$no one has to share$$, $$the host goes first$$),
  'spirit',
  jsonb_build_array($$a men's circle$$, $$a women's circle$$, $$a new-parents circle$$, $$a grief-and-change circle$$, $$a guys who actually talk version$$, $$a circle for a specific life stage$$),
  true, 8)
ON CONFLICT (id) DO NOTHING;

INSERT INTO circle_templates (id, slug, name, primary_pillar, identity, audience, card, one_liner, pillars_inside, meetup, gathering, thread, format, size_label, agreements, recommended_journey_pillar, remix_options, is_active, display_order)
VALUES (
  'ce110000-0000-4000-8000-000000000009', 'the-table', $$The Table$$, 'spirit',
  $$a supper club: cook, eat, and have one good conversation around a shared table.$$,
  $$people with a full phone and an empty calendar of real meals, the far-from-family, anyone who misses a regular table.$$,
  $$a full phone, an empty table. Pull up a chair.$$,
  $$For people who eat alone too often and miss a real table. Gather, share food, one conversation, no side-scrolling. The oldest form of community there is, on a standing schedule.$$,
  jsonb_build_object(
    'spirit', $$the ritual of the table, gratitude, belonging.$$,
    'body', $$the food, the nourishment, the slowing down.$$,
    'expression', $$the cooking, the hosting, the recipes shared.$$,
    'mind', $$stepping off the treadmill for an evening.$$),
  jsonb_build_object('text', $$A simpler shared meal or a cook-together, lower-key, midweek. In person.$$, 'length', $$90 minutes$$),
  jsonb_build_object('text', $$The main supper, potluck or cooked together, one long table, one question posed partway through to pull everyone into the same conversation, lingering on purpose.$$),
  $$Recipes, who's bringing what, dietary notes, photos of the spread.$$,
  $$In person by nature. A virtual cook-along version works for far members. Hybrid for hosts who rotate homes.$$,
  $$4 to 10 per table$$,
  jsonb_build_array($$phones away at the table$$, $$one conversation not five$$, $$everyone contributes something$$, $$all dietary needs welcome$$),
  'spirit',
  jsonb_build_array($$a potluck club$$, $$a we cook it together night$$, $$a seasonal supper tied to dates worth marking$$, $$a standing Sunday table for people far from family$$, $$a cuisine-of-the-month club$$),
  true, 9)
ON CONFLICT (id) DO NOTHING;

-- ── EXPRESSION (the capstone Pillar; runs the Quest through any Journey) ─

INSERT INTO circle_templates (id, slug, name, primary_pillar, identity, audience, card, one_liner, pillars_inside, meetup, gathering, thread, format, size_label, agreements, recommended_journey_pillar, remix_options, is_active, display_order)
VALUES (
  'ce110000-0000-4000-8000-000000000010', 'the-makers', $$The Makers$$, 'expression',
  $$a club for people who want to make things and never make the time, doing it in good company.$$,
  $$crafters, artists, hobbyists, anyone with a creative itch and no container, people who do their best work around others.$$,
  $$you keep meaning to make something. Bring it here.$$,
  $$For people with a creative thing they never get to. Bring your project, make it in the same room as other makers, show it when it's done. The company is what gets you to actually start.$$,
  jsonb_build_object(
    'expression', $$the making, and showing the work.$$,
    'mind', $$the focus, the craft, getting out of the feed and into flow.$$,
    'body', $$working with your hands, the physical act of making.$$,
    'spirit', $$the quiet satisfaction of a finished thing.$$),
  jsonb_build_object('text', $$A making session, everyone brings their own project, side by side, quiet or chatty. Virtual co-working works too.$$, 'length', $$90 minutes$$),
  jsonb_build_object('text', $$A bigger creative outing, a museum, a gallery, a craft fair, a group project, or a show-and-tell potluck.$$),
  $$Progress shots, feedback asks, finished pieces, materials and technique tips.$$,
  $$In person for the energy of the room. Virtual co-working sessions for consistency. Hybrid so remote makers join midweek and show up for weekend outings.$$,
  $$4 to 10$$,
  jsonb_build_array($$bring something to work on$$, $$feedback only when asked$$, $$no gatekeeping by skill level$$, $$share the mess$$),
  NULL,
  jsonb_build_array($$a writers' room$$, $$a fiber-and-craft circle$$, $$a pottery group$$, $$a paint-and-sip$$, $$a finish-your-side-project night$$, $$a kids-and-parents art club$$),
  true, 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO circle_templates (id, slug, name, primary_pillar, identity, audience, card, one_liner, pillars_inside, meetup, gathering, thread, format, size_label, agreements, recommended_journey_pillar, remix_options, is_active, display_order)
VALUES (
  'ce110000-0000-4000-8000-000000000011', 'sound', $$Sound$$, 'expression',
  $$a music club for players and deep listeners. Jam, share, go see live music together.$$,
  $$people who play alone and want others to play with, listeners who miss talking about music, anyone learning an instrument.$$,
  $$you love music and play alone. Bring it to the room.$$,
  $$For people who play, want to play, or just love music deeply. Jam, swap what you're into, go see shows. The room turns a solo habit into a shared one.$$,
  jsonb_build_object(
    'expression', $$the playing, the sharing, the making of sound.$$,
    'spirit', $$the feeling music gets at that words don't.$$,
    'body', $$the physical act of playing, moving, listening loud.$$,
    'mind', $$the craft, the theory, the discovery.$$),
  jsonb_build_object('text', $$A jam session for players, or a listening-and-share night where people bring tracks. In person ideal.$$, 'length', $$90 minutes$$),
  jsonb_build_object('text', $$Live music out, an open mic, a jam, an album listen-through, or a group trip to a show.$$),
  $$Song shares, playlists, gear talk, who's going to which show.$$,
  $$In person for jams and shows. A virtual listening-and-share version works for the non-players. Hybrid covers both.$$,
  $$4 to 12$$,
  jsonb_build_array($$all skill levels welcome$$, $$no gatekeeping by taste$$, $$everyone gets a turn$$, $$listen as generously as you play$$),
  NULL,
  jsonb_build_array($$a jam band$$, $$a songwriters circle$$, $$a vinyl listening club$$, $$a choir or singing group$$, $$a learn-an-instrument-together cohort$$, $$a concert-going crew$$),
  true, 11)
ON CONFLICT (id) DO NOTHING;

INSERT INTO circle_templates (id, slug, name, primary_pillar, identity, audience, card, one_liner, pillars_inside, meetup, gathering, thread, format, size_label, agreements, recommended_journey_pillar, remix_options, is_active, display_order)
VALUES (
  'ce110000-0000-4000-8000-000000000012', 'the-writers-room', $$The Writers' Room$$, 'expression',
  $$a writing club for people who keep meaning to write, riding the analog-page revival.$$,
  $$would-be writers, journalers, anyone with a story or a project who never makes the time, people who write better around others.$$,
  $$you keep meaning to write. This is the standing time.$$,
  $$For people with something to write and no habit of writing it. Show up, write in the same room, share when you're ready. The standing time and the witnesses are what get the words out.$$,
  jsonb_build_object(
    'expression', $$the writing, the sharing, the voice.$$,
    'mind', $$the clarity writing brings, the focus.$$,
    'spirit', $$the reflection, the honesty on the page.$$,
    'body', $$the ritual of pen and paper, or hands on keys.$$),
  jsonb_build_object('text', $$A writing session. Quick prompt or check-in, then quiet writing time together, optional share at the end. In person or virtual co-writing.$$, 'length', $$90 minutes$$),
  jsonb_build_object('text', $$A longer write-in, a reading night where people share work, a bookstore or library outing, or a guest on craft.$$),
  $$Prompts, drafts for feedback, word-count check-ins, what people finished.$$,
  $$In person for the focused-room effect. Virtual co-writing works fully. Hybrid keeps everyone writing.$$,
  $$4 to 10$$,
  jsonb_build_array($$write badly first$$, $$feedback only when asked$$, $$what's shared stays here$$, $$no one has to read aloud$$),
  NULL,
  jsonb_build_array($$a journaling circle$$, $$a novel-writing cohort$$, $$a poetry group$$, $$a memoir or life-story circle$$, $$a screenwriting room$$, $$a morning-pages-before-work group$$),
  true, 12)
ON CONFLICT (id) DO NOTHING;
