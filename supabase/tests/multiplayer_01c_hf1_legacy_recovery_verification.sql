select
  has_function_privilege('authenticated', 'public.get_current_multiplayer_context()', 'EXECUTE') as context_available,
  not has_function_privilege('authenticated', 'public.trusted_recover_legacy_multiplayer_match(uuid,uuid)', 'EXECUTE') as client_cannot_recover,
  has_function_privilege('service_role', 'public.trusted_recover_legacy_multiplayer_match(uuid,uuid)', 'EXECUTE') as service_can_recover;
