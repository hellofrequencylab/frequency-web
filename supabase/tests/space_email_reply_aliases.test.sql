-- Behavioral service-only routing and exact-tenant FK consequences. NOT RUN until local replay available.
begin;
select plan(8);
insert into public.entities(id,key,name,kind) select gen_random_uuid(),'labs','Labs','for_profit'
 where not exists(select 1 from public.entities where key='labs');
insert into public.spaces(id,slug,name,type,entity_id,status,visibility) values
 ('00000000-0000-4000-c013-000000000001','email-alias-a','Alias A','business',(select id from public.entities where key='labs' limit 1),'active','network'),
 ('00000000-0000-4000-c013-000000000002','email-alias-b','Alias B','business',(select id from public.entities where key='labs' limit 1),'active','network');
insert into public.comms_conversations(id,ref,space_id,subject,subject_id) values
 ('00000000-0000-4000-d013-000000000001',990013001,'00000000-0000-4000-c013-000000000001','Alias test','00000000-0000-4000-c013-000000000001');
select throws_ok($$insert into public.space_email_reply_aliases(alias_key,space_id,conversation_id,conversation_ref,local_prefix,receiving_domain)
 values('aaaaaaaaaaaaaaaaaaaa','00000000-0000-4000-c013-000000000002','00000000-0000-4000-d013-000000000001','990013001','alias','reply.test')$$,'23503',null,'composite FK prevents cross-Space route');
set local role authenticated;
select throws_ok($$select * from public.space_email_reply_aliases$$,'42501',null,'authenticated cannot enumerate routing secrets');
select throws_ok($$insert into public.space_email_reply_quarantine(reason,recipient_fingerprint,message_fingerprint)
 values('malformed_alias',repeat('a',64),repeat('b',64))$$,'42501',null,'authenticated cannot forge quarantine evidence');
set local role anon;
select throws_ok($$select * from public.space_email_reply_quarantine$$,'42501',null,'anonymous cannot inspect quarantine');
select throws_ok($$update public.space_email_reply_aliases set revoked_at=null$$,'42501',null,'anonymous cannot restore revoked routes');
set local role service_role;
select lives_ok($$insert into public.space_email_reply_aliases(alias_key,space_id,conversation_id,conversation_ref,local_prefix,receiving_domain)
 values('aaaaaaaaaaaaaaaaaaaa','00000000-0000-4000-c013-000000000001','00000000-0000-4000-d013-000000000001','990013001','alias','reply.test')$$,'service can create exact-tenant route');
select lives_ok($$update public.space_email_reply_aliases set revoked_at=now() where alias_key='aaaaaaaaaaaaaaaaaaaa'$$,'service can revoke routing');
select lives_ok($$insert into public.space_email_reply_quarantine(reason,recipient_fingerprint,message_fingerprint)
 values('unknown_or_revoked_alias',repeat('a',64),repeat('b',64))$$,'service can persist bounded quarantine evidence');
select * from finish();
rollback;
