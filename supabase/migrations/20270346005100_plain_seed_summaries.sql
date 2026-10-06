-- LIVE-794 (ADR-1715): seeded practice, tier and demo copy stops speaking in nervous-system terms.
--
-- CONTENT-VOICE §5 bans "nervous system regulation" as surface wellness jargon ("calm down fast"
-- instead) and §10 bans health claims ("stay relational"). Five early seed migrations wrote it into
-- live rows anyway: practice descriptions, summaries and bodies, Journey tier bodies, a demo Circle's
-- about line, two demo bios and a demo post. Applied migrations are never edited, so this one
-- rewrites the live rows in place.
--
-- Data only. Exact-substring replace(), so a row an operator has since rewritten is left alone and a
-- re-run is a no-op. practice_tiers is optional (dropped in production); every other column exists.

do $$
declare
  pair record;
begin
  for pair in
    select * from (values
      ('A short, intentional breathing round to settle the nervous system.', 'A short, intentional breathing round for when everything is too loud.'),
      ('A guided breathing round to settle the nervous system.', 'A guided breathing round for when everything is too loud.'),
      ('Your breath is the one lever on the nervous system you can pull on demand.', 'Your breath is the one thing you can slow down on demand.'),
      ('Cold water, movement, and a horizon line first thing resets your whole nervous system.', 'Cold water, movement, and a horizon line first thing make the rest of the day feel smaller.'),
      ('The cold trains your nervous system to stay calm under stress.', 'Choosing a little cold makes the rest of the day easier to meet.'),
      ('Give your nervous system a runway.', 'Give yourself a runway.'),
      ('It is rest that asks nothing of you and gives back a steadier nervous system.', 'It is rest that asks nothing of you.'),
      ('let the nervous system find the off-ramp.', 'let the day wind down.'),
      ('Weekly conscious-breathing sessions — down-regulate, reset the nervous system, share a cup of tea after.', 'Weekly breathing sessions, then a cup of tea after.'),
      ('The nervous-system reset is real.', 'I keep coming back.'),
      ('Two-minute plunges and a whole new nervous system.', 'Two-minute plunges, most mornings.'),
      ('Same problem, totally different nervous system.', 'Same problem, totally different me.')
    ) as v(old_text, new_text)
  loop
    update public.practices set description = replace(description, pair.old_text, pair.new_text)
      where strpos(description, pair.old_text) > 0;
    update public.practices set summary = replace(summary, pair.old_text, pair.new_text)
      where strpos(summary, pair.old_text) > 0;
    update public.practices set body = replace(body, pair.old_text, pair.new_text)
      where strpos(body, pair.old_text) > 0;
    -- practice_tiers was dropped after its seed, so only touch it where it still exists.
    if to_regclass('public.practice_tiers') is not null then
      execute 'update public.practice_tiers set body = replace(body, $1, $2) where strpos(body, $1) > 0'
        using pair.old_text, pair.new_text;
    end if;
    update public.circles set about = replace(about, pair.old_text, pair.new_text)
      where strpos(about, pair.old_text) > 0;
    update public.profiles set bio = replace(bio, pair.old_text, pair.new_text)
      where is_demo and strpos(bio, pair.old_text) > 0;
    update public.posts set body = replace(body, pair.old_text, pair.new_text)
      where is_demo and strpos(body, pair.old_text) > 0;
  end loop;
end
$$;
