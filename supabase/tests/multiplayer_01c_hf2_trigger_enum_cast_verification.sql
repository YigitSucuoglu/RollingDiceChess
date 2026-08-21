-- Run after 202608210002_multiplayer_01c_hf2_trigger_enum_cast_fix.sql.
begin;

do $$
declare function_definition text;
begin
  if 'technical-abort'::public.multiplayer_match_status is null
      or 'closed'::public.multiplayer_lobby_status is null then
    raise exception 'expected multiplayer status enum labels are unavailable';
  end if;
  select pg_get_functiondef(
    'private.release_terminal_multiplayer_membership()'::regprocedure)
    into function_definition;
  if function_definition not like '%new.status::text in (''terminal'', ''technical-abort'')%'
      or function_definition not like '%new.status::text = ''closed''%' then
    raise exception 'shared cleanup trigger still performs cross-enum literal coercion';
  end if;
  if not exists (
      select 1 from pg_trigger
      where tgname = 'release_terminal_match_membership' and not tgisinternal)
      or not exists (
        select 1 from pg_trigger
        where tgname = 'release_closed_lobby_membership' and not tgisinternal) then
    raise exception 'membership cleanup triggers are missing';
  end if;
end;
$$;

select
  'technical-abort'::public.multiplayer_match_status::text = 'technical-abort'
    as match_terminal_literal_valid,
  'closed'::public.multiplayer_lobby_status::text = 'closed'
    as lobby_closed_literal_valid,
  position(
    'new.status::text' in pg_get_functiondef(
      'private.release_terminal_multiplayer_membership()'::regprocedure)) > 0
    as shared_trigger_uses_text_comparison;

rollback;
