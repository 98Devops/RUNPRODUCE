-- U6 chunk 7 · public.engine_snapshot: one engine read is one statement (D25, AD-90).
--
-- Everything `loadEngineInput` maps to `EngineInput`, as one jsonb document read
-- in one snapshot, so a correction committing mid-read cannot pair day numbers
-- from one placement date with records checked against another.
--
-- - SECURITY INVOKER: RLS applies to every read below. The explicit role check
--   comes first and keeps both layers (AD-87).
-- - "Not permitted" and "not found" are one refusal (AD-88).
-- - The parameter set in force is chosen here, once: the latest effective_from
--   on or before p_as_of, then the highest revision (D7, D10). No set is RP002.
-- - Nothing else is filtered by p_as_of. The engine filters records and draws
--   itself and reads forward orders on purpose (cash.ts).
-- - Money and bags are text (AD-91). Lists arrive ordered.
-- - `cash` is AD-67's section: current openings, and current transactions dated
--   before placement that are not linked to this batch.
--
-- The contract is pinned in apps/web/tests/repositories/snapshot-fixture.ts.

create function public.engine_snapshot(p_batch_id uuid, p_as_of date) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_batch record;
  v_set record;
  v_curve record;
begin
  -- Role first. Read as the caller, an invisible batch and a missing one are
  -- both "no row", so both get the same refusal.
  select b.* into v_batch from public.batches b where b.id = p_batch_id;
  if not found or not private.has_role(v_batch.org_id, array['OWNER', 'MANAGER']) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  select s.* into v_set
    from public.parameter_sets s
   where s.org_id = v_batch.org_id and s.effective_from <= p_as_of
   order by s.effective_from desc, s.revision desc
   limit 1;
  if not found then
    raise exception 'no parameter set in force on %', p_as_of using errcode = 'RP002';
  end if;

  select c.id, c.source into v_curve from public.breed_curves c where c.id = v_batch.breed_curve_id;

  return jsonb_build_object(
    'batch', jsonb_build_object(
      'id', v_batch.id,
      'org_id', v_batch.org_id,
      'code', v_batch.code,
      'breed_curve_id', v_batch.breed_curve_id,
      'placement_date', v_batch.placement_date,
      'chick_count', v_batch.chick_count,
      'extra_chick_count', v_batch.extra_chick_count,
      'chick_price_cents', v_batch.chick_price_cents::text,
      'closed_on', v_batch.closed_on),

    'parameter_set', jsonb_build_object(
      'id', v_set.id,
      'effective_from', v_set.effective_from,
      'revision', v_set.revision,
      'mortality_base_rate_bp_daily', v_set.mortality_base_rate_bp_daily,
      'mortality_ramp_start_day', v_set.mortality_ramp_start_day,
      'mortality_ramp_rate_bp_daily', v_set.mortality_ramp_rate_bp_daily,
      'slaughter_target_g', v_set.slaughter_target_g,
      'gate_pricing_basis', v_set.gate_pricing_basis,
      'gate_price_cents_per_bird', v_set.gate_price_cents_per_bird::text,
      'gate_price_cents_per_kg', v_set.gate_price_cents_per_kg::text,
      'gate_capacity_per_day', v_set.gate_capacity_per_day,
      'abattoir_fee_cents', v_set.abattoir_fee_cents::text,
      'transport_cents_per_bird', v_set.transport_cents_per_bird::text,
      'delivery_mode', v_set.delivery_mode,
      'feed_terms_days', v_set.feed_terms_days,
      'delivery_cents_per_tonne', v_set.delivery_cents_per_tonne::text,
      'reserve_floor_cents', v_set.reserve_floor_cents::text,
      'dressing_yield_pct', v_set.dressing_yield_pct,
      'calibration_trailing_days_min', v_set.calibration_trailing_days_min,
      'placement_step_birds', v_set.placement_step_birds,
      'max_placement_birds', v_set.max_placement_birds,
      'overhead_lines', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'key', l.key, 'label', l.label, 'basis', l.basis, 'timing', l.timing,
                 'amount_cents', l.amount_cents::text, 'measured_at_flock_size', l.measured_at_flock_size,
                 'confidence', l.confidence, 'source', l.source) order by l.position), '[]'::jsonb)
          from public.overhead_lines l where l.parameter_set_id = v_set.id),
      'planning_bulk_bands', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'dressed_floor_g', b.dressed_floor_g,
                 'price_cents_per_bird', b.price_cents_per_bird::text) order by b.dressed_floor_g), '[]'::jsonb)
          from public.planning_bulk_bands b where b.parameter_set_id = v_set.id),
      'feed_prices', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'phase', f.phase, 'price_per_bag_cents', f.price_per_bag_cents::text, 'bag_kg', f.bag_kg)
                 order by array_position(array['STARTER', 'GROWER', 'FINISHER'], f.phase)), '[]'::jsonb)
          from public.feed_prices f where f.parameter_set_id = v_set.id)),

    'curve', jsonb_build_object(
      'id', v_curve.id,
      'source', v_curve.source,
      'points', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'day_number', p.day_number, 'weight_g', p.weight_g, 'feed_g', p.feed_g, 'phase', p.phase)
                 order by p.day_number), '[]'::jsonb)
          from public.breed_curve_points p where p.curve_id = v_curve.id),
      'phases', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'phase', ph.phase, 'first_day', ph.first_day, 'last_day', ph.last_day)
                 order by ph.first_day), '[]'::jsonb)
          from public.breed_curve_phases ph where ph.curve_id = v_curve.id)),

    'daily_records', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'record_date', r.record_date,
               'mortality_cumulative', r.mortality_cumulative, 'cull_cumulative', r.cull_cumulative,
               'feed_starter_g', r.feed_starter_g, 'feed_grower_g', r.feed_grower_g,
               'feed_finisher_g', r.feed_finisher_g,
               'avg_weight_g', r.avg_weight_g, 'weight_sample_size', r.weight_sample_size)
               order by r.record_date), '[]'::jsonb)
        from public.daily_records r where r.batch_id = v_batch.id),

    'feed_draws', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'collection_date', d.collection_date, 'phase', d.phase, 'bags', d.bags::text,
               'feed_g', d.feed_g, 'price_per_bag_cents', d.price_per_bag_cents::text,
               'terms_days', d.terms_days)
               order by d.collection_date, d.created_at), '[]'::jsonb)
        from public.feed_draws d where d.batch_id = v_batch.id),

    'sales_orders', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'channel', o.channel, 'order_date', o.order_date, 'bird_count', o.bird_count,
               'avg_live_weight_g', o.avg_live_weight_g, 'avg_dressed_weight_g', o.avg_dressed_weight_g,
               'pricing_basis', o.pricing_basis,
               'price_cents_per_bird', o.price_cents_per_bird::text,
               'price_cents_per_kg', o.price_cents_per_kg::text,
               'terms_days', o.terms_days, 'bands', o.bands)
               order by o.order_date, o.created_at), '[]'::jsonb)
        from public.sales_orders o where o.batch_id = v_batch.id),

    'cash', jsonb_build_object(
      'accounts', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id', a.id, 'opening_date', a.opening_date,
                 'opening_balance_cents', a.opening_balance_cents::text)
                 order by a.opening_date, a.created_at), '[]'::jsonb)
          from public.cash_accounts a where a.org_id = v_batch.org_id),
      'transactions', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id', t.id, 'account_id', t.account_id, 'txn_date', t.txn_date,
                 'direction', t.direction, 'amount_cents', t.amount_cents::text,
                 'category', t.category, 'batch_id', t.batch_id)
                 order by t.txn_date, t.created_at), '[]'::jsonb)
          from public.cash_transactions t
         where t.org_id = v_batch.org_id
           and t.txn_date < v_batch.placement_date
           and t.batch_id is distinct from v_batch.id))
  );
end;
$$;

-- AD-89: authenticated may execute; anon may not. Supabase's default privileges
-- grant EXECUTE on new public functions to anon, so revoke it explicitly.
revoke execute on function public.engine_snapshot(uuid, date) from public, anon;
grant execute on function public.engine_snapshot(uuid, date) to authenticated, service_role;

comment on function public.engine_snapshot(uuid, date) is
  'U6 D25 / AD-90: the one engine read. SECURITY INVOKER, so RLS applies; the OWNER/MANAGER role check runs first.
Money and bags are text (AD-91). Contract: apps/web/tests/repositories/snapshot-fixture.ts.';
