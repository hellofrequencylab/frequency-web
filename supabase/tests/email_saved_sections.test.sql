-- EMAIL-042: the saved email sections table is service-only and bounded.
begin;
select plan(6);
set local role authenticated;
select throws_ok($$select * from public.email_saved_sections$$,'42501',null,'authenticated cannot read the library');
select throws_ok($$insert into public.email_saved_sections(name,block_type) values('x','button')$$,'42501',null,'authenticated cannot write the library');
reset role;
set local role anon;
select throws_ok($$select * from public.email_saved_sections$$,'42501',null,'anonymous cannot read the library');
reset role;
select lives_ok($$insert into public.email_saved_sections(name,block_type,content) values('Footer cta','button','{"label":"Join"}')$$,'service can save a section');
select throws_ok($$insert into public.email_saved_sections(name,block_type) values('   ','button')$$,'23514',null,'a blank name is refused');
select throws_ok($$insert into public.email_saved_sections(name,block_type,content) values('x','button','[]')$$,'23514',null,'content must be an object');
select * from finish();
rollback;
