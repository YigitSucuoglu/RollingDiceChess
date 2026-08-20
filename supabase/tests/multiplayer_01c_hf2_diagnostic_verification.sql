select
  has_function_privilege('service_role', 'public.trusted_diagnose_multiplayer_reconciliation(uuid)', 'EXECUTE') as service_can_diagnose,
  not has_function_privilege('authenticated', 'public.trusted_diagnose_multiplayer_reconciliation(uuid)', 'EXECUTE') as browser_cannot_diagnose,
  not has_function_privilege('anon', 'public.trusted_diagnose_multiplayer_reconciliation(uuid)', 'EXECUTE') as anonymous_cannot_diagnose;
