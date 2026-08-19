begin;

do $$
declare
  default_expression text;
  settlement_definition text;
begin
  select pg_get_expr(ad.adbin, ad.adrelid) into default_expression
  from pg_attribute attribute
  join pg_attrdef ad on ad.adrelid = attribute.attrelid and ad.adnum = attribute.attnum
  where attribute.attrelid = 'public.player_ratings'::regclass
    and attribute.attname = 'multiplayer_rating';
  if default_expression <> '1000' then
    raise exception 'multiplayer_rating default changed: %', default_expression;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.player_ratings'::regclass
      and conname = 'player_ratings_multiplayer_rating_nonnegative'
      and convalidated
  ) then
    raise exception 'non-negative rating constraint is missing or unvalidated';
  end if;

  select pg_get_functiondef(
    'private.settle_ranked_match(uuid,text,uuid,uuid,uuid,text)'::regprocedure
  ) into settlement_definition;
  if position('for update' in lower(settlement_definition)) = 0
      or position('pg_advisory_xact_lock' in settlement_definition) = 0 then
    raise exception 'settlement concurrency locks are missing';
  end if;
  if position('private.rating_settlements' in settlement_definition) = 0 then
    raise exception 'settlement idempotency ledger is not used';
  end if;
end;
$$;

insert into public.players (player_id, display_name, ownership_kind) values
  ('f1000000-0000-4000-8000-000000000001', 'Guest9001', 'guest'),
  ('f1000000-0000-4000-8000-000000000002', 'Guest9002', 'guest');
insert into public.player_ratings (player_id) values
  ('f1000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000002');

do $$
declare
  first_result record;
  replay_result record;
  contradictory_replay_rejected boolean := false;
  rating_a public.player_ratings%rowtype;
  rating_b public.player_ratings%rowtype;
begin
  select * into first_result from private.settle_ranked_match(
    'f1000000-0000-4000-8000-000000000010', 'multiplayer-ranked',
    'f1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001', 'normal'
  );
  select * into replay_result from private.settle_ranked_match(
    'f1000000-0000-4000-8000-000000000010', 'multiplayer-ranked',
    'f1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001', 'normal'
  );
  if first_result.nominal_movement <> 15
      or first_result.player_a_delta <> 15 or first_result.player_b_delta <> -15
      or replay_result.player_a_rating_after <> 1015
      or replay_result.player_b_rating_after <> 985 then
    raise exception 'equal-rating settlement or idempotent replay is incorrect';
  end if;

  begin
    perform private.settle_ranked_match(
      'f1000000-0000-4000-8000-000000000010', 'multiplayer-ranked',
      'f1000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000002',
      'f1000000-0000-4000-8000-000000000002', 'normal'
    );
  exception when unique_violation then
    contradictory_replay_rejected := true;
  end;
  if not contradictory_replay_rejected then
    raise exception 'contradictory settlement replay was not rejected';
  end if;

  select * into rating_a from public.player_ratings
    where player_id = 'f1000000-0000-4000-8000-000000000001';
  select * into rating_b from public.player_ratings
    where player_id = 'f1000000-0000-4000-8000-000000000002';
  if rating_a.multiplayer_rating <> 1015 or rating_b.multiplayer_rating <> 985
      or rating_a.rated_games <> 1 or rating_b.rated_games <> 1
      or rating_a.rating_version <> 2 or rating_b.rating_version <> 2 then
    raise exception 'duplicate settlement changed authoritative rating state';
  end if;
  if (select count(*) from private.rating_settlements
      where match_id = 'f1000000-0000-4000-8000-000000000010') <> 1 then
    raise exception 'settlement ledger did not enforce exactly-once match id';
  end if;
end;
$$;

do $$
declare
  difference integer;
  favorite integer;
  underdog integer;
begin
  for difference, favorite, underdog in
    select * from (values
      (0, 15, 15), (25, 14, 16), (50, 13, 18), (75, 11, 19),
      (100, 10, 20), (150, 8, 23), (200, 5, 25), (500, 5, 25)
    ) expected(difference, favorite, underdog)
  loop
    if round((15 - least(difference, 200) / 20.0)::numeric)::integer <> favorite
        or round((15 + least(difference, 200) / 20.0)::numeric)::integer <> underdog then
      raise exception 'rating formula mismatch at difference %', difference;
    end if;
  end loop;
end;
$$;

do $$
begin
  if has_function_privilege(
      'anon', 'private.settle_ranked_match(uuid,text,uuid,uuid,uuid,text)', 'EXECUTE')
      or has_function_privilege(
      'authenticated', 'private.settle_ranked_match(uuid,text,uuid,uuid,uuid,text)', 'EXECUTE') then
    raise exception 'browser role can execute trusted rating settlement';
  end if;
  if not has_function_privilege(
      'service_role', 'private.settle_ranked_match(uuid,text,uuid,uuid,uuid,text)', 'EXECUTE') then
    raise exception 'trusted service role cannot execute rating settlement';
  end if;
  if has_table_privilege('anon', 'private.rating_settlements', 'INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated', 'private.rating_settlements', 'INSERT,UPDATE,DELETE') then
    raise exception 'browser role can mutate the rating settlement ledger';
  end if;
  if has_table_privilege('anon', 'public.player_ratings', 'INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated', 'public.player_ratings', 'INSERT,UPDATE,DELETE') then
    raise exception 'browser role has direct rating mutation privileges';
  end if;
end;
$$;

select
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'player_ratings'
      and column_name = 'multiplayer_rating') as rating_default,
  not has_function_privilege(
    'authenticated', 'private.settle_ranked_match(uuid,text,uuid,uuid,uuid,text)', 'EXECUTE'
  ) as browser_settlement_denied,
  has_function_privilege(
    'service_role', 'private.settle_ranked_match(uuid,text,uuid,uuid,uuid,text)', 'EXECUTE'
  ) as trusted_settlement_enabled,
  (select count(*) from private.rating_settlements) as settlement_count;

rollback;
