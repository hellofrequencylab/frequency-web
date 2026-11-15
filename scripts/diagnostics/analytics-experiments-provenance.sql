select jsonb_build_object(
 'nameMatches',coalesce(name,'')='analytics_experiments',
 'statementType',coalesce(jsonb_typeof(to_jsonb(m)->'statements'),'absent'),
 'statementCount',case when jsonb_typeof(to_jsonb(m)->'statements')='array' then jsonb_array_length(to_jsonb(m)->'statements') else null end,
 'singleStatementSha256',case when jsonb_typeof(to_jsonb(m)->'statements')='array' then case when jsonb_array_length(to_jsonb(m)->'statements')=1 then encode(sha256(convert_to((to_jsonb(m)->'statements')->>0,'UTF8')),'hex') else null end else null end
) as provenance from supabase_migrations.schema_migrations m where version='20270346050000'
