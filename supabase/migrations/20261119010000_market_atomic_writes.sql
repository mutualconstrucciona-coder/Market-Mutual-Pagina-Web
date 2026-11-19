create or replace function public.market_commit_catalog(p_expected_revision bigint, p_products jsonb, p_families jsonb, p_flyers jsonb, p_actor uuid, p_action text)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare v_revision bigint;
begin
 if jsonb_typeof(p_products) <> 'array' or jsonb_typeof(p_families) <> 'array' or jsonb_typeof(p_flyers) <> 'array' or length(p_action)>80 then
   raise exception 'invalid catalog payload';
 end if;
 update public.market_catalog_state set revision=revision+1, products=p_products, families=p_families, flyers=p_flyers, updated_at=now(), updated_by=p_actor
 where id=1 and revision=p_expected_revision returning revision into v_revision;
 if v_revision is null then raise exception 'market_revision_conflict' using errcode='P0001'; end if;
 insert into public.market_catalog_audit(revision,actor,action) values(v_revision,p_actor,p_action);
 return v_revision;
end $$;
revoke all on function public.market_commit_catalog(bigint,jsonb,jsonb,jsonb,uuid,text) from PUBLIC,anon,authenticated;
grant execute on function public.market_commit_catalog(bigint,jsonb,jsonb,jsonb,uuid,text) to service_role;
revoke execute on function public.rls_auto_enable() from PUBLIC,anon,authenticated;
