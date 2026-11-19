-- Grant the trusted Next.js backend the minimum database privileges.
-- No permissions for anon or authenticated clients; their RLS restrictions remain.
grant select, update on table public.market_catalog_state to service_role;
grant select on table public.market_admin_users to service_role;
grant insert, select on table public.market_catalog_audit to service_role;
grant usage, select on sequence public.market_catalog_audit_id_seq to service_role;
