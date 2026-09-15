-- U6 chunk 5 follow-up: pin rls_auto_enable out of client reach, and record on
-- each SECURITY DEFINER write function why authenticated may execute it.

-- public.rls_auto_enable() is a Supabase platform default (fired by the
-- ensure_rls event trigger), not our code. No client calls it directly.
-- Migration 5's sweep already leaves authenticated without EXECUTE; this makes
-- that explicit so a platform default grant on a fresh database cannot restore it.
revoke execute on function public.rls_auto_enable() from authenticated;

-- The Supabase advisor flags each of these as
-- authenticated_security_definer_function_executable. That is intended.
comment on function public.my_memberships() is
  'Intended: authenticated may EXECUTE this SECURITY DEFINER function (AD-88, AD-89).
Tables carry no client write grant; these RPCs are the client path, and each checks the caller''s membership and role.';
comment on function public.capture_batches() is
  'Intended: authenticated may EXECUTE this SECURITY DEFINER function (AD-88, AD-89).
Tables carry no client write grant; these RPCs are the client path, and each checks the caller''s membership and role.';
comment on function public.create_parameter_set(jsonb) is
  'Intended: authenticated may EXECUTE this SECURITY DEFINER function (AD-88, AD-89).
Tables carry no client write grant; these RPCs are the client path, and each checks the caller''s membership and role.';
comment on function public.create_breed_curve(jsonb) is
  'Intended: authenticated may EXECUTE this SECURITY DEFINER function (AD-88, AD-89).
Tables carry no client write grant; these RPCs are the client path, and each checks the caller''s membership and role.';
comment on function public.record_batch(jsonb) is
  'Intended: authenticated may EXECUTE this SECURITY DEFINER function (AD-88, AD-89).
Tables carry no client write grant; these RPCs are the client path, and each checks the caller''s membership and role.';
comment on function public.record_batch_placement(jsonb) is
  'Intended: authenticated may EXECUTE this SECURITY DEFINER function (AD-88, AD-89).
Tables carry no client write grant; these RPCs are the client path, and each checks the caller''s membership and role.';
comment on function public.record_batch_closure(jsonb) is
  'Intended: authenticated may EXECUTE this SECURITY DEFINER function (AD-88, AD-89).
Tables carry no client write grant; these RPCs are the client path, and each checks the caller''s membership and role.';
comment on function public.record_daily_records(uuid, jsonb) is
  'Intended: authenticated may EXECUTE this SECURITY DEFINER function (AD-88, AD-89).
Tables carry no client write grant; these RPCs are the client path, and each checks the caller''s membership and role.';
comment on function public.record_feed_draw(jsonb) is
  'Intended: authenticated may EXECUTE this SECURITY DEFINER function (AD-88, AD-89).
Tables carry no client write grant; these RPCs are the client path, and each checks the caller''s membership and role.';
comment on function public.record_sales_order(jsonb) is
  'Intended: authenticated may EXECUTE this SECURITY DEFINER function (AD-88, AD-89).
Tables carry no client write grant; these RPCs are the client path, and each checks the caller''s membership and role.';
comment on function public.record_cash_account(jsonb) is
  'Intended: authenticated may EXECUTE this SECURITY DEFINER function (AD-88, AD-89).
Tables carry no client write grant; these RPCs are the client path, and each checks the caller''s membership and role.';
comment on function public.record_cash_transaction(jsonb) is
  'Intended: authenticated may EXECUTE this SECURITY DEFINER function (AD-88, AD-89).
Tables carry no client write grant; these RPCs are the client path, and each checks the caller''s membership and role.';
