select
  has_function_privilege('anon', 'private.multiplayer_match_service_snapshot(private.multiplayer_matches)', 'execute') = false
    as anon_snapshot_denied,
  has_function_privilege('authenticated', 'private.multiplayer_match_service_snapshot(private.multiplayer_matches)', 'execute') = false
    as authenticated_snapshot_denied,
  pg_get_functiondef('private.multiplayer_match_service_snapshot(private.multiplayer_matches)'::regprocedure)
    like '%private.rating_settlements%'
    as settlement_ledger_is_snapshot_source,
  pg_get_functiondef('private.multiplayer_match_service_snapshot(private.multiplayer_matches)'::regprocedure)
    like '%match_row.mode = ''ranked''%'
    as unranked_feedback_excluded;
