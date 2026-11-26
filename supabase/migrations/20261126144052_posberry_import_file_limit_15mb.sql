-- Expand the file-size metadata limit without touching catalog or history rows.
set local lock_timeout = '5s';

alter table public.market_catalog_imports
  drop constraint market_catalog_imports_file_size_check,
  add constraint market_catalog_imports_file_size_check check (file_size between 1 and 15728640);

create or replace function public.market_apply_catalog_import(
  p_expected_revision bigint,
  p_products jsonb,
  p_actor uuid,
  p_actor_email text,
  p_kind text,
  p_file_name text,
  p_file_hash text,
  p_file_size integer,
  p_sheet_name text,
  p_stats jsonb,
  p_changes jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_revision bigint;
  v_import_id uuid := gen_random_uuid();
begin
  if not exists (select 1 from public.market_admin_users where user_id = p_actor) then
    raise exception 'market_import_unauthorized' using errcode = 'P0001';
  end if;
  if p_kind not in ('stock', 'price')
    or jsonb_typeof(p_products) <> 'array'
    or jsonb_typeof(p_stats) <> 'object'
    or jsonb_typeof(p_changes) <> 'array'
    or jsonb_array_length(p_changes) = 0
    or p_file_hash !~ '^[a-f0-9]{64}$'
    or p_file_size not between 1 and 15728640
    or length(p_file_name) not between 1 and 180
    or length(p_sheet_name) not between 1 and 180
    or length(p_actor_email) not between 3 and 320 then
    raise exception 'market_import_invalid' using errcode = 'P0001';
  end if;

  update public.market_catalog_state
     set revision = revision + 1,
         products = p_products,
         updated_at = now(),
         updated_by = p_actor
   where id = 1 and revision = p_expected_revision
   returning revision into v_revision;
  if v_revision is null then
    raise exception 'market_revision_conflict' using errcode = 'P0001';
  end if;

  insert into public.market_catalog_imports (
    id, kind, file_name, file_hash, file_size, sheet_name, actor, actor_email,
    base_revision, applied_revision, stats, changes
  ) values (
    v_import_id, p_kind, p_file_name, p_file_hash, p_file_size, p_sheet_name,
    p_actor, lower(p_actor_email), p_expected_revision, v_revision, p_stats, p_changes
  );

  insert into public.market_catalog_audit (revision, actor, action, details)
  values (
    v_revision,
    p_actor,
    'import:' || p_kind,
    jsonb_build_object(
      'import_id', v_import_id,
      'file_name', p_file_name,
      'file_hash', p_file_hash,
      'modified', jsonb_array_length(p_changes)
    )
  );
  return v_revision;
exception
  when unique_violation then
    raise exception 'market_duplicate_import' using errcode = 'P0001';
end
$$;
