-- Widen practice_sessions.mode CHECK to accept every mode completeSession actually writes.
--
-- Bug (constraint vs code drift): app/(main)/on-air/actions.ts writes practice_sessions.mode as the
-- SessionMode for a Mindless sit (timer | breath | journal | stillness | ritual | log), and as
-- `movement:<walk|run|yoga|strength|stretch|play>` for a Movement (Get Moving) sit. The old CHECK
-- allowed only ('timer','breath','log'), so 'journal' / 'stillness' / 'ritual' and EVERY movement
-- sit violated it. completeSession inserts the session row best-effort ("errors never block the
-- log"), so those inserts were SILENTLY swallowed: the economy + Zaps still ran, but the
-- practice_sessions HISTORY (airtime / depth stats) was missing every movement and
-- stillness/ritual/journal sit. This widens the constraint so history records correctly.
--
-- Context: the timer merge (ADR-360) unified everything under one "Mindless" timer with Be Still /
-- Get Moving modes, so recording movement history correctly matters more now. The `movement:%`
-- pattern keeps it future-proof for new movement sub-modes without another migration.

alter table public.practice_sessions drop constraint if exists practice_sessions_mode_check;

alter table public.practice_sessions
  add constraint practice_sessions_mode_check
  check (
    mode in ('timer', 'breath', 'journal', 'stillness', 'ritual', 'log')
    or mode like 'movement:%'
  );
