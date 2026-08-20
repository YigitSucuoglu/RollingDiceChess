begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'multiplayer_matches_termination_reason_check'
      and pg_get_constraintdef(oid) like '%disconnect-forfeit%'
  ) then raise exception 'disconnect-forfeit termination reason is missing'; end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'prepare_authoritative_match_transition' and not tgisinternal
  ) then raise exception 'clock-rebase trigger is missing'; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'multiplayer_match_events'
  ) then raise exception 'match events are not in the Realtime publication'; end if;
  if has_table_privilege('anon', 'public.multiplayer_match_events', 'SELECT') then
    raise exception 'anonymous match event access must remain denied';
  end if;
end;
$$;

select
  has_table_privilege('authenticated', 'public.multiplayer_match_events', 'SELECT') as authenticated_can_select,
  not has_table_privilege('anon', 'public.multiplayer_match_events', 'SELECT') as anon_cannot_select,
  exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'multiplayer_match_events'
      and policyname = 'multiplayer_match_events_participant_select'
  ) as participant_policy_exists;

rollback;
