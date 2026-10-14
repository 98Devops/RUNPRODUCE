-- U8 chunk 5: proves the cleanup left nothing behind on DEV. Read-only: run on the
-- read-only connection after window B closes. In the first result every count
-- must be 0, and all 17 append-only triggers must be enabled ('O'). D7 adds a
-- check constraint, not a trigger, so 17 is still the number.
select
  (select count(*) from auth.users)                                   as auth_users,
  (select count(*) from auth.identities)                              as auth_identities,
  (select count(*) from auth.sessions)                                as auth_sessions,
  (select count(*) from auth.refresh_tokens)                          as auth_refresh_tokens,
  (select count(*) from public.organizations)                         as organizations,
  (select count(*) from private.memberships)                          as memberships,
  (select count(*) from public.breed_curves)                          as breed_curves,
  (select count(*) from public.breed_curve_phases)                    as breed_curve_phases,
  (select count(*) from public.breed_curve_points)                    as breed_curve_points,
  (select count(*) from public.parameter_sets)                        as parameter_sets,
  (select count(*) from facts.batches)                                as batches,
  (select count(*) from facts.batch_placement_versions)               as placements,
  (select count(*) from facts.daily_record_versions)                  as daily_records,
  (select count(*) from facts.feed_draw_versions)                     as feed_draws,
  (select count(*) from facts.sales_order_versions)                   as sales_orders,
  (select count(*) from facts.cash_accounts)                          as cash_accounts,
  (select count(*) from pg_trigger
    where tgname like '%\_immutable' and not tgisinternal and tgenabled = 'O') as immutable_triggers_enabled,
  (select count(*) from pg_trigger
    where tgname like '%\_immutable' and not tgisinternal and tgenabled <> 'O') as immutable_triggers_not_enabled;

-- The second result is what STAYS: D7's guards, which cleanup never undoes.
-- Expected: code_shape_check 1, farm_zone_functions 2.
select
  (select count(*) from pg_constraint where conname = 'batches_code_shape')      as code_shape_check,
  (select count(*) from pg_proc
    where proname in ('record_batch', 'record_batch_placement')
      and prosrc like '%Africa/Harare%')                                          as farm_zone_functions;
