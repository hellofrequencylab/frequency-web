-- pgTAP guard for SCAN-709 (migration 20270346000710): the member-facing write policies on
-- commerce_reviews and commerce_disputes are gone, so no authenticated caller can insert a review
-- or rewrite a dispute through PostgREST. The app writes both tables through the service role,
-- behind the verified-purchase, not-the-seller and hidden-review gates. The read and the author
-- delete policies stay, and this pins that too, so the drop cannot quietly take the wrong ones.

begin;
select plan(4);

select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'public' and tablename = 'commerce_reviews'
       and cmd in ('INSERT', 'UPDATE') $$,
  'no insert or update policy on commerce_reviews: a member cannot write a review directly'
);

select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'public' and tablename = 'commerce_disputes'
       and cmd in ('INSERT', 'UPDATE') $$,
  'no insert or update policy on commerce_disputes: a buyer cannot rewrite a dispute directly'
);

select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'commerce_reviews'
            and policyname = 'commerce_reviews_public_read'),
  'the public review read policy stays'
);

select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'commerce_disputes'
            and policyname = 'commerce_disputes_party_read'),
  'the dispute party read policy stays'
);

select * from finish();
rollback;
