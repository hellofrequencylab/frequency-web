-- =====================================================================
-- Demo v2 — cross-memberships weave
-- =====================================================================
-- A community is not 12 sealed boxes. ~40 members belong to a SECOND circle
-- (the surfer who also plunges, the newcomer who found three homes, the founder
-- who makes things on Cedros). They join the secondary circle as a plain member
-- (volunteer_role NULL) — they only lead in their primary circle.
--
-- member_count is maintained by the membership trigger, so these naturally make
-- the overlapping circles read a little fuller. Idempotent: ON CONFLICT on the
-- (profile_id, circle_id) unique key. All rows reference profiles/circles seeded
-- by 20260605000101–112.
--
--   profiles  f1000000-…-0000000000NN   circles  f2000000-…-00000000000C
-- =====================================================================

BEGIN;

INSERT INTO memberships (profile_id, circle_id, status, volunteer_role)
SELECT ('f1000000-0000-0000-0000-0000000000' || p)::uuid,
       ('f2000000-0000-0000-0000-00000000000' || c)::uuid,
       'active'::membership_status, NULL
FROM (VALUES
 -- movement crossover (surf / run / hike circles).  c = single-hex circle code
 ('03','a'), ('05','7'), ('0c','c'), ('0e','8'),
 ('bd','1'), ('c0','8'), ('c3','c'), ('95','c'), ('98','1'),
 ('e8','8'), ('eb','a'), ('ee','1'),
 -- holistic crossover (sound bath / cold plunge / mindfulness)
 ('18','7'), ('1b','5'), ('7f','2'), ('82','5'), ('85','2'),
 ('56','2'), ('59','7'),
 -- creative crossover (Leucadia makers / Cedros creatives)
 ('2e','9'), ('31','9'), ('a9','3'), ('ac','3'),
 -- founders who also make things
 ('42','9'), ('45','3'), ('48','6'),
 -- newcomers branching out into the circles they discovered (the front door)
 ('6a','1'), ('6c','8'), ('70','2'), ('73','c'), ('76','5'),
 ('79','9'), ('7b','7'),
 -- coast keepers overlap with the water circles
 ('d2','1'), ('d5','7'), ('d8','a'), ('db','2'),
 -- cottonwood sitters who also cold-plunge; cedros folks who hike
 ('5c','7'), ('b0','c'), ('b3','8')
) AS x(p, c)
-- guard: never duplicate a member's own primary circle row
ON CONFLICT (profile_id, circle_id) DO NOTHING;

COMMIT;
