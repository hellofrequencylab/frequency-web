-- EMAIL-022: the Space inbox address table is service-only, one address per Space, bounded states.
begin;
select plan(8);
insert into public.entities(id,key,name,kind) select gen_random_uuid(),'labs','Labs','for_profit'
 where not exists(select 1 from public.entities where key='labs');
insert into public.spaces(id,slug,name,type,entity_id,status,visibility) values
 ('00000000-0000-4000-c022-000000000001','inbox-a','Inbox A','business',(select id from public.entities where key='labs' limit 1),'active','network'),
 ('00000000-0000-4000-c022-000000000002','inbox-b','Inbox B','business',(select id from public.entities where key='labs' limit 1),'active','network');
set local role authenticated;
select throws_ok($$select * from public.space_inbox_addresses$$,'42501',null,'authenticated cannot read provider ids or DNS evidence');
select throws_ok($$insert into public.space_inbox_addresses(space_id,domain) values('00000000-0000-4000-c022-000000000001','inbox-a.test')$$,'42501',null,'authenticated cannot claim an address');
set local role anon;
select throws_ok($$update public.space_inbox_addresses set state='verified'$$,'42501',null,'anonymous cannot flip verification');
set local role service_role;
select lives_ok($$insert into public.space_inbox_addresses(space_id,domain,provider_domain_id,dns_records)
 values('00000000-0000-4000-c022-000000000001','inbox-a.test','prov-a','[{"type":"MX","name":"inbox-a","value":"inbound.test"}]'::jsonb)$$,'service can provision an address');
select throws_ok($$insert into public.space_inbox_addresses(space_id,domain) values('00000000-0000-4000-c022-000000000001','inbox-a-again.test')$$,'23505','duplicate key value violates unique constraint "space_inbox_addresses_space_id_key"','one address per Space');
select throws_ok($$insert into public.space_inbox_addresses(space_id,domain) values('00000000-0000-4000-c022-000000000002','inbox-a.test')$$,'23505',null,'one Space per domain');
select throws_ok($$update public.space_inbox_addresses set state='live' where domain='inbox-a.test'$$,'23514',null,'state stays in the bounded set');
select lives_ok($$insert into public.space_email_reply_quarantine(reason,recipient_fingerprint,message_fingerprint)
 values('inbox_address_unverified',repeat('c',64),repeat('d',64))$$,'inbox quarantine reasons are admitted');
select * from finish();
rollback;
