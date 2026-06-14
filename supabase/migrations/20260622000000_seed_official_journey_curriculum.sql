-- =============================================================================
-- Seed the v2 curriculum + covers for the 4 named official seasonal Journeys, and
-- retire the 4 bare duplicate "quest-1-*" plans (ADR-252, JOURNEYS.md §2/§5).
--
-- Context: the live library held 8 official journey_plans on the same Quest — four
-- NAMED seasonal Journeys (Clear Channel · Strong Signal · Tune In · Broadcast, one
-- per Pillar) and four BARE duplicates ("Mind/Body/Spirit/Expression", no emoji /
-- intro), all with zero adoptions and no v2 structure (practice-only trees, no covers).
--
-- This migration:
--   1. Retires the 4 bare quest-1-* duplicates (unlisted + unofficial) so only the
--      named Journeys surface in the public library. Reversible (no delete).
--   2. Gives the 4 named Journeys a 16:9 cover (seeded picsum, the project's allowlisted
--      demo-image host) + turns on the completion certificate.
--   3. Authors a real Phase -> Module -> Lesson curriculum on each named Journey
--      (reading / reflection / exercise / check lessons, on the Frequency voice), and
--      RE-HOMES each Journey's existing real Practice items into the modules — which
--      also fixes the bare-"Untitled" practice-title bug by backfilling the linked
--      practice's name onto the item.
--
-- IDEMPOTENT: covers update only where null; the retire re-sets the same values; the
-- curriculum builder is a no-op on any plan that already has a 'phase' item. A temp
-- (pg_temp) helper holds the build logic for the run only. Safe to re-run.
-- =============================================================================

BEGIN;

-- 1. Retire the 4 bare duplicate plans. ---------------------------------------
update public.journey_plans
   set official = false, visibility = 'unlisted'
 where slug in ('quest-1-mind', 'quest-1-body', 'quest-1-spirit', 'quest-1-expression');

-- 2. Covers (16:9, seeded picsum) + certificate on the 4 named Journeys. -------
update public.journey_plans
   set cover_image = coalesce(cover_image, 'https://picsum.photos/seed/' || slug || '/1280/720'),
       certificate_enabled = true
 where slug in ('official-1-mind', 'official-1-body', 'official-1-spirit', 'official-1-expression');

-- 3. Curriculum builder: turns a JSONB spec into a Phase -> Module -> Lesson tree
--    and re-homes the plan's existing Practice items (in order) wherever the spec
--    has a {"type":"practice"} leaf. No-op if the plan already has phases.
create or replace function pg_temp.seed_journey_curriculum(p_slug text, p_spec jsonb)
returns void as $fn$
declare
  v_plan   uuid;
  v_phase  uuid;
  v_module uuid;
  v_prac   uuid;
  prac     uuid[];
  prac_idx int := 1;
  phase  jsonb;
  module jsonb;
  lesson jsonb;
  ph_sort int := 0;
  md_sort int;
  ls_sort int;
begin
  select id into v_plan from public.journey_plans where slug = p_slug;
  if v_plan is null then return; end if;
  if exists (select 1 from public.journey_plan_items where plan_id = v_plan and block_type = 'phase') then
    return; -- already built
  end if;

  select array_agg(id order by sort_order)
    into prac
    from public.journey_plan_items
   where plan_id = v_plan and block_type = 'practice';

  for phase in select * from jsonb_array_elements(p_spec) loop
    ph_sort := ph_sort + 1;
    insert into public.journey_plan_items (plan_id, block_type, parent_id, sort_order, title, body)
      values (v_plan, 'phase', null, ph_sort, phase->>'title', phase->>'intro')
      returning id into v_phase;

    md_sort := 0;
    for module in select * from jsonb_array_elements(phase->'modules') loop
      md_sort := md_sort + 1;
      insert into public.journey_plan_items (plan_id, block_type, parent_id, sort_order, title, body)
        values (v_plan, 'module', v_phase, md_sort, module->>'title', module->>'intro')
        returning id into v_module;

      ls_sort := 0;
      for lesson in select * from jsonb_array_elements(module->'lessons') loop
        ls_sort := ls_sort + 1;
        if (lesson->>'type') = 'practice' then
          -- re-home the next existing Practice under this module
          if prac is not null and prac_idx <= coalesce(array_length(prac, 1), 0) then
            v_prac := prac[prac_idx];
            update public.journey_plan_items jpi
               set parent_id = v_module,
                   sort_order = ls_sort,
                   title = coalesce(nullif(jpi.title, ''),
                                    (select pr.title from public.practices pr where pr.id = jpi.practice_id),
                                    'Daily practice'),
                   body  = coalesce(nullif(jpi.body, ''),
                                    'Your real-world practice for this session. Do it today, then mark it complete.')
             where jpi.id = v_prac;
            prac_idx := prac_idx + 1;
          end if;
        else
          insert into public.journey_plan_items
            (plan_id, block_type, parent_id, sort_order, title, body, est_minutes, required)
            values (v_plan, lesson->>'type', v_module, ls_sort, lesson->>'title', lesson->>'body',
                    (lesson->>'min')::int, coalesce((lesson->>'required')::boolean, true));
        end if;
      end loop;
    end loop;
  end loop;

  -- Any practices the spec did not place: append to the last module so none are orphaned.
  if prac is not null then
    while prac_idx <= coalesce(array_length(prac, 1), 0) loop
      update public.journey_plan_items jpi
         set parent_id = v_module, sort_order = 90 + prac_idx,
             title = coalesce(nullif(jpi.title, ''),
                              (select pr.title from public.practices pr where pr.id = jpi.practice_id),
                              'Daily practice')
       where jpi.id = prac[prac_idx];
      prac_idx := prac_idx + 1;
    end loop;
  end if;
end;
$fn$ language plpgsql;

-- 3a. Clear Channel (Mind) — reclaim your attention. --------------------------
select pg_temp.seed_journey_curriculum('official-1-mind', $json$
[
  {"title": "Week 1 · See the noise",
   "intro": "Before you change anything, just watch where your attention actually goes. Notice, do not judge.",
   "modules": [{"title": "Notice where it goes", "lessons": [
     {"type": "reading", "min": 4, "title": "Attention is the whole game",
      "body": "Your attention is the rarest thing you own, and almost everything around you is built to take it. This week is not about cutting anything yet. It is about seeing where your attention goes, honestly, so you have something real to work with."},
     {"type": "reflection", "min": 5, "title": "Where does it go?",
      "body": "Write down the three things that pulled your attention most today. No fixing, no judging. Just name them so they are out of your head and on the page."},
     {"type": "practice"},
     {"type": "check", "min": 2, "title": "Quick check",
      "body": "Ask yourself: is the goal this week to cut my screen time in half? Then check: no. This week is only noticing. The cutting comes later, once you can see the pattern."}
   ]}]},
  {"title": "Week 2 · Cut the interference",
   "intro": "You do not need a perfect day. You need one protected block, guarded well.",
   "modules": [{"title": "Protect one block", "lessons": [
     {"type": "reading", "min": 3, "title": "One clean block beats a tidy day",
      "body": "Trying to focus all day fails. One protected hour does not. Pick the block that matters most, guard it like it is the only one you get, and let the rest of the day be messy."},
     {"type": "exercise", "min": 10, "title": "Build tomorrow's block",
      "body": "Choose tomorrow's one task, the time it happens, and the place. Write it where you will see it first thing in the morning. Phone in another room before you start."},
     {"type": "practice"}
   ]}]},
  {"title": "Week 3 · Make it stick",
   "intro": "Keep the one thing that worked. Make it the default, so it survives a busy week.",
   "modules": [{"title": "Set your default", "lessons": [
     {"type": "reflection", "min": 5, "title": "What changed in the room",
      "body": "Think of one moment this week you were fully present with a person or a task. What made it possible? Write one thing you want to keep doing."},
     {"type": "exercise", "min": 8, "title": "Your default setting",
      "body": "Pick the single practice from these three weeks that did the most. Decide exactly when it happens by default, so it needs no decision to start."},
     {"type": "practice"},
     {"type": "practice"}
   ]}]}
]
$json$);

-- 3b. Strong Signal (Body) — keep the carrier wave strong. --------------------
select pg_temp.seed_journey_curriculum('official-1-body', $json$
[
  {"title": "Week 1 · Get moving",
   "intro": "Not about getting fit. About moving a little, every day, on purpose.",
   "modules": [{"title": "Move every day", "lessons": [
     {"type": "reading", "min": 3, "title": "The body carries everything",
      "body": "Every clear thought rides on a body that moves. This week is not about a program or a personal best. It is about moving a little, daily, so the rest of your signal comes through clean."},
     {"type": "reflection", "min": 4, "title": "How do you feel after?",
      "body": "After you move today, write one line on how the rest of the day went. Energy, mood, sleep. Numbers or words, your call. You are building evidence, not a habit yet."},
     {"type": "practice"},
     {"type": "check", "min": 2, "title": "Quick check",
      "body": "Ask yourself: what beats a perfect workout you skip? Then check: a short walk you actually take. Consistency beats intensity every week of this Journey."}
   ]}]},
  {"title": "Week 2 · Add a little load",
   "intro": "A body that can carry things stays useful for decades. A few sets is enough to start.",
   "modules": [{"title": "Borrowed time", "lessons": [
     {"type": "reading", "min": 3, "title": "Strength is borrowed time",
      "body": "A body that can lift, push, and carry stays useful for a long time. A few sets, a few times a week, is enough to start. Add a little over time and let it compound."},
     {"type": "exercise", "min": 5, "title": "Pick your minimum",
      "body": "Choose the smallest strength session you will not skip. Ten minutes of bodyweight counts. Write down when it happens this week, then keep that promise."},
     {"type": "practice"}
   ]}]},
  {"title": "Week 3 · Take it outside",
   "intro": "Daylight, green, and a bit of distance do quiet work on a wound-up day.",
   "modules": [{"title": "Outside is a multiplier", "lessons": [
     {"type": "reading", "min": 3, "title": "Outside is a multiplier",
      "body": "Daylight, green, and a little distance do quiet work on a busy head. Move your practice outdoors when you can this week and notice what is different by the end of it."},
     {"type": "reflection", "min": 4, "title": "Where do you feel best?",
      "body": "Name the outdoor spot within reach where your head clears fastest. Plan one real visit before this Phase ends, and put it in the calendar."},
     {"type": "practice"},
     {"type": "practice"}
   ]}]}
]
$json$);

-- 3c. Tune In (Spirit) — the season's stillness practice. ---------------------
select pg_temp.seed_journey_curriculum('official-1-spirit', $json$
[
  {"title": "Week 1 · Sit down",
   "intro": "The one Journey that asks you to do less, more deliberately. Start with a few quiet minutes.",
   "modules": [{"title": "Do less, on purpose", "lessons": [
     {"type": "reading", "min": 3, "title": "Doing less, on purpose",
      "body": "Tune In is the quiet centre of the season. It asks you to do less, more deliberately. Start with a few minutes of stillness before the inputs of the day begin."},
     {"type": "reflection", "min": 4, "title": "What is loud right now?",
      "body": "Name the one thing taking up the most space in your head today. You are not solving it. You are setting it down for a few minutes and seeing what is underneath."},
     {"type": "practice"},
     {"type": "check", "min": 2, "title": "Quick check",
      "body": "Ask yourself: if my mind wanders during stillness, am I doing it wrong? Then check: no. Noticing the wander and coming back is the practice itself."}
   ]}]},
  {"title": "Week 2 · Use the breath",
   "intro": "Long, slow exhales are the quickest way to calm down fast.",
   "modules": [{"title": "The fastest lever", "lessons": [
     {"type": "reading", "min": 3, "title": "The fastest lever you own",
      "body": "Long, slow exhales are the quickest way to calm down fast. A few rounds is enough when a day gets away from you. You carry this lever everywhere."},
     {"type": "exercise", "min": 5, "title": "Find your reset",
      "body": "Pick a cue that happens daily: the kettle, a red light, the lift. Tie three slow breaths to it for the rest of the week, so the reset finds you instead of the other way round."},
     {"type": "practice"}
   ]}]},
  {"title": "Week 3 · Give thanks, look back",
   "intro": "The specific kind of gratitude, the actual moment, is the part that lands.",
   "modules": [{"title": "Close the loop", "lessons": [
     {"type": "reading", "min": 3, "title": "Gratitude, the specific kind",
      "body": "Vague gratitude does little. The specific kind, the actual moment and exactly why it mattered, is the part that lands. Name the real thing, not the category."},
     {"type": "reflection", "min": 4, "title": "Close the loop",
      "body": "Before sleep, write one honest line on how the day went. What landed, what you are letting go of. Close the loop, then rest."},
     {"type": "practice"},
     {"type": "practice"}
   ]}]}
]
$json$);

-- 3d. Broadcast (Expression) — put your frequency into the world. -------------
select pg_temp.seed_journey_curriculum('official-1-expression', $json$
[
  {"title": "Week 1 · Make a mark",
   "intro": "A signal received is half of it. This week is about the half you send.",
   "modules": [{"title": "Send, do not just receive", "lessons": [
     {"type": "reading", "min": 3, "title": "Send, do not just receive",
      "body": "A signal received is only half of it. Broadcast is about the half you send: a mark, a voice, a sound, a movement, every day. No audience required and no polish demanded."},
     {"type": "reflection", "min": 4, "title": "What wants out?",
      "body": "Name one thing you have wanted to make or say lately. Do not start it yet. Just write it down so it stops nagging and you can see it plainly."},
     {"type": "practice"},
     {"type": "check", "min": 2, "title": "Quick check",
      "body": "Ask yourself: does Broadcast need an audience to count? Then check: no. The reps are for you. Sharing is optional, every single time."}
   ]}]},
  {"title": "Week 2 · Keep the channel open",
   "intro": "Quality comes from quantity here. A daily rough rep beats one perfect piece a month.",
   "modules": [{"title": "Reps beat polish", "lessons": [
     {"type": "reading", "min": 3, "title": "Reps beat polish",
      "body": "Here, quality comes from quantity. A daily rough rep keeps the channel open far better than one perfect piece a month. Lower the bar so you actually show up."},
     {"type": "exercise", "min": 5, "title": "Pick your medium",
      "body": "Choose the one form you will practice daily this week: photo, voice, sound, or movement. Decide when it happens, and keep each rep small enough to never skip."},
     {"type": "practice"}
   ]}]},
  {"title": "Week 3 · Make it yours",
   "intro": "Find the thread that sounds like you, and decide how it survives a busy week.",
   "modules": [{"title": "Follow the thread", "lessons": [
     {"type": "reflection", "min": 4, "title": "What sounds like you?",
      "body": "Look back at this week's reps. Note the one that felt most like you, and why. That thread is the one worth following past this season."},
     {"type": "exercise", "min": 8, "title": "Your standing rep",
      "body": "Pick the creative rep you want to keep after this Journey ends. Decide its time and place now, so it survives the first busy week that tests it."},
     {"type": "practice"},
     {"type": "practice"}
   ]}]}
]
$json$);

COMMIT;
