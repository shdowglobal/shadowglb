-- ShadowGLB store-table lockdown (data preserving)
--
-- Apply only after the new production frontend is deployed and confirmed to
-- read through /api/store. This removes the retired browser's direct access
-- without deleting or rewriting the existing store row.

begin;

alter table public.shadowgbl_store enable row level security;

do $$
declare policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'shadowgbl_store'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

revoke all on table public.shadowgbl_store from public, anon, authenticated;
grant select, insert, update, delete on table public.shadowgbl_store to service_role;

commit;
