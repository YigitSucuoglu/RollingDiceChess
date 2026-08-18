begin;

alter table public.players
  add column public_discriminator text,
  add column username_onboarding_required boolean not null default false;

create or replace function private.allocate_public_discriminator(
  forced_candidates text[] default null
) returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  candidate text;
  random_bytes bytea;
  candidate_index integer := 1;
  character_index integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('roulettechess-public-discriminator', 0));
  loop
    if forced_candidates is not null and candidate_index <= cardinality(forced_candidates) then
      candidate := upper(forced_candidates[candidate_index]);
      candidate_index := candidate_index + 1;
    else
      random_bytes := extensions.gen_random_bytes(5);
      candidate := '';
      for character_index in 0..4 loop
        candidate := candidate || substr(alphabet, (get_byte(random_bytes, character_index) % 36) + 1, 1);
      end loop;
    end if;
    if candidate !~ '^[A-Z0-9]{5}$' then
      raise exception 'invalid forced discriminator candidate' using errcode='22023';
    end if;
    if not exists (
      select 1 from public.players where public_discriminator=candidate
    ) then return candidate; end if;
  end loop;
end;
$$;

do $$
declare existing_player record;
begin
  for existing_player in
    select player_id from public.players where public_discriminator is null order by player_id for update
  loop
    update public.players set
      public_discriminator=private.allocate_public_discriminator(),
      username_onboarding_required=(ownership_kind='account')
      where player_id=existing_player.player_id;
  end loop;
end;
$$;

alter table public.players
  alter column public_discriminator set not null,
  add constraint players_public_discriminator_format_check
    check (public_discriminator ~ '^[A-Z0-9]{5}$'),
  add constraint players_public_discriminator_unique unique (public_discriminator);

create or replace function private.enforce_player_public_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    if new.public_discriminator is null then
      new.public_discriminator := private.allocate_public_discriminator();
    end if;
    if new.ownership_kind='account' then
      new.username_onboarding_required := true;
    end if;
  else
    if new.public_discriminator is distinct from old.public_discriminator then
      raise exception 'public discriminator is immutable' using errcode='23514';
    end if;
    if old.ownership_kind='guest' and new.ownership_kind='account'
        and new.display_name ~* '^Guest[0-9]{4}$' then
      new.username_onboarding_required := true;
    end if;
    if old.ownership_kind='guest' and new.ownership_kind='guest'
        and new.display_name is distinct from old.display_name then
      new.display_name := old.display_name;
    end if;
  end if;
  return new;
end;
$$;

create trigger roulettechess_enforce_player_public_identity
before insert or update of public_discriminator, ownership_kind, display_name on public.players
for each row execute function private.enforce_player_public_identity();

create or replace function public.rename_current_player(requested_name text)
returns public.players language plpgsql security definer set search_path = '' as $$
declare result public.players;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then
    raise exception 'account rename required' using errcode='42501';
  end if;
  if char_length(btrim(requested_name)) not between 2 and 24
      or requested_name ~ '[<>/\\]' or requested_name ~ '[[:cntrl:]]' then
    raise exception 'invalid display name' using errcode='22023';
  end if;
  if regexp_replace(btrim(requested_name), '\s+', ' ', 'g') ~* '^Guest[0-9]{4}$' then
    raise exception 'reserved guest display name' using errcode='22023';
  end if;
  update public.players set
    display_name=regexp_replace(btrim(requested_name), '\s+', ' ', 'g'),
    username_onboarding_required=false,
    updated_at=now()
    where player_id=private.current_player_id()
      and lifecycle='active' and ownership_kind='account'
    returning * into result;
  if result.player_id is null then
    raise exception 'active account player not found' using errcode='P0002';
  end if;
  return result;
end;
$$;

create or replace function private.current_player_profile_json()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'playerId', p.player_id,
    'displayName', p.display_name,
    'publicDiscriminator', p.public_discriminator,
    'usernameOnboardingRequired', p.username_onboarding_required,
    'ownershipKind', p.ownership_kind,
    'lifecycle', p.lifecycle,
    'createdAt', p.created_at,
    'progression', to_jsonb(g) - 'player_id' - 'updated_at',
    'pieceStatistics', coalesce((
      select jsonb_object_agg(s.piece_type, jsonb_build_object(
        'rolls', s.rolls, 'moves', s.moves, 'captures', s.captures
      )) from public.player_piece_statistics s where s.player_id=p.player_id
    ), '{}'::jsonb),
    'rating', jsonb_build_object(
      'multiplayerRating', r.multiplayer_rating,
      'ratedGames', r.rated_games,
      'ratingVersion', r.rating_version
    ),
    'bootstrapApplied', exists(
      select 1 from public.local_profile_bootstraps b where b.player_id=p.player_id
    )
  )
  from public.players p
  join public.player_progression g using(player_id)
  join public.player_ratings r using(player_id)
  where p.player_id=private.current_player_id() and p.lifecycle='active';
$$;

revoke all on function private.allocate_public_discriminator(text[]) from public, anon, authenticated;
revoke all on function private.enforce_player_public_identity() from public, anon, authenticated;
revoke all on function private.current_player_profile_json() from public, anon, authenticated;
revoke all on function public.rename_current_player(text) from public, anon, authenticated;
grant execute on function public.rename_current_player(text) to authenticated;

commit;
