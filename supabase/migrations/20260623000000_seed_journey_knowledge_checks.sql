-- =============================================================================
-- Seed interactive knowledge-checks on the 4 official seasonal Journeys (build item
-- §11.1 #2, ADR-252; docs/JOURNEYS-DESIGN.md §2e). Each Journey's Week-1 `check` block
-- gets a `settings.check` = { question, options, answer, explanation } that the player
-- renders as a multiple-choice question with instant feedback + retries. Low-stakes:
-- it never gates completion (the testing effect comes from the act of retrieving).
--
-- IDEMPOTENT: re-running just re-sets the same settings. Targets the single `check`
-- block per named Journey. Member journeys are untouched.
-- =============================================================================

BEGIN;

update public.journey_plan_items
   set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('check', $json$
     {"question": "What's the goal of Week 1?",
      "options": ["Cut your screen time in half", "Just notice where your attention goes", "Delete your most-used apps", "Hit a focus streak"],
      "answer": 1,
      "explanation": "Week 1 is only noticing. The cutting comes later, once you can see the pattern."}
   $json$::jsonb)
 where block_type = 'check'
   and plan_id = (select id from public.journey_plans where slug = 'official-1-mind');

update public.journey_plan_items
   set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('check', $json$
     {"question": "What matters most in Week 1?",
      "options": ["One hard session a week", "A short walk you actually take", "Hitting a step target every day", "Training to failure"],
      "answer": 1,
      "explanation": "Consistency beats intensity. A short walk you take beats a perfect workout you skip."}
   $json$::jsonb)
 where block_type = 'check'
   and plan_id = (select id from public.journey_plans where slug = 'official-1-body');

update public.journey_plan_items
   set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('check', $json$
     {"question": "Your mind wanders during stillness. What does that mean?",
      "options": ["You're doing it wrong", "You should try harder to empty your mind", "Noticing it and coming back is the practice", "Stillness isn't for you"],
      "answer": 2,
      "explanation": "Noticing the wander and coming back is the practice itself."}
   $json$::jsonb)
 where block_type = 'check'
   and plan_id = (select id from public.journey_plans where slug = 'official-1-spirit');

update public.journey_plan_items
   set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('check', $json$
     {"question": "Do your Broadcast reps need an audience to count?",
      "options": ["Yes, post everything", "No, the reps are for you", "Only if you want Zaps", "Only finished work counts"],
      "answer": 1,
      "explanation": "The reps are for you. Sharing is optional, every time."}
   $json$::jsonb)
 where block_type = 'check'
   and plan_id = (select id from public.journey_plans where slug = 'official-1-expression');

COMMIT;
