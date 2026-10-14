-- U7 chunk 3 · Feed provenance on daily records (D20; the D3 addition, AD-99,
-- AD-102, AD-103).
--
-- Three nullable columns say how a day's feed was entered and which phase it
-- was written under. Null on each is "not recorded" (a row from before the
-- capture form), never a default, so there is no backfill (invariant 5).
--
-- - Every check is row-local and reads no curve (D5): a curve-reading check
--   would tie stored facts to one placement date. Whether the phase is the
--   right one for the day is the server's to derive, not the database's to
--   re-derive (AD-103).
-- - record_daily_records requires the three keys on every non-void row, null
--   allowed ("present even when null"), compares them for its no-op, and stores
--   them. A void copies the head row, provenance included.
-- - public.daily_records appends them; public.daily_records_history is
--   recreated, because its v.* was expanded when it was created.
-- - engine_snapshot carries them on each record. Contract:
--   apps/web/tests/repositories/snapshot-fixture.ts.
--
-- Local only until U7 chunk 5's dev window (D17).

alter table facts.daily_record_versions
  add column feed_entry_source text
    constraint daily_record_versions_feed_entry_source_values
      check (feed_entry_source in ('MEASURED', 'STANDARD_CONFIRMED')),
  add column feed_phase text
    constraint daily_record_versions_feed_phase_values
      check (feed_phase in ('STARTER', 'GROWER', 'FINISHER')),
  add column feed_phase_source text
    constraint daily_record_versions_feed_phase_source_values
      check (feed_phase_source in ('FROM_CURVE', 'EXTRAPOLATED_BEYOND_CURVE')),
  -- AD-99: the phase and how it was set are recorded together or not at all.
  add constraint daily_record_versions_phase_with_source
    check ((feed_phase is null) = (feed_phase_source is null)),
  -- AD-99: the day's feed is all of the day's phase; the other two columns are 0.
  add constraint daily_record_versions_feed_under_phase
    check (feed_phase is null
           or (feed_phase = 'STARTER' and feed_grower_g = 0 and feed_finisher_g = 0)
           or (feed_phase = 'GROWER' and feed_starter_g = 0 and feed_finisher_g = 0)
           or (feed_phase = 'FINISHER' and feed_starter_g = 0 and feed_grower_g = 0)),
  -- AD-102: a standard exists only on the curve's days, and only for a phase.
  -- Written with "is not distinct from" so a missing source refuses: a CHECK
  -- whose expression is NULL passes.
  add constraint daily_record_versions_standard_from_curve
    check (feed_entry_source is distinct from 'STANDARD_CONFIRMED'
           or feed_phase_source is not distinct from 'FROM_CURVE');

create or replace view public.daily_records with (security_invoker = true) as
select v.id, v.org_id, v.batch_id, v.record_date, v.mortality_cumulative, v.cull_cumulative,
       v.feed_starter_g, v.feed_grower_g, v.feed_finisher_g, v.avg_weight_g, v.weight_sample_size, v.notes,
       v.created_at, v.created_by,
       v.feed_entry_source, v.feed_phase, v.feed_phase_source
  from facts.daily_record_versions v
 where not v.voided
   and not exists (select 1 from facts.daily_record_versions s where s.supersedes_id = v.id);

drop view public.daily_records_history;
create view public.daily_records_history with (security_invoker = true) as
select v.*, (not v.voided and s.id is null) as is_current, s.created_at as superseded_at
  from facts.daily_record_versions v
  left join facts.daily_record_versions s on s.supersedes_id = v.id;
grant select on public.daily_records_history to authenticated;

-- Same body as U6 migration 5, plus the three provenance keys. The signature is
-- unchanged, so its grants and AD-89 comment stay.
create or replace function public.record_daily_records(p_batch_id uuid, p_rows jsonb) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_org uuid := private.batch_org(p_batch_id);
  v_is_manager boolean;
  v_placement date;
  v_row jsonb;
  v_crid uuid;
  v_date date;
  v_void boolean;
  v_supersedes uuid;
  v_head facts.daily_record_versions;
  v_new facts.daily_record_versions;
  v_ids uuid[] := '{}';
  v_id uuid;
begin
  if v_org is null or not private.has_role(v_org, array['OWNER', 'MANAGER', 'WORKER']) then
    perform private.deny();
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows must be an array' using errcode = '22023';
  end if;
  v_is_manager := private.has_role(v_org, array['OWNER', 'MANAGER']);
  v_placement := (private.current_placement(p_batch_id)).placement_date;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_crid := private.payload_text(v_row, 'client_request_id')::uuid;
    select id into v_id from facts.daily_record_versions where client_request_id = v_crid and batch_id = p_batch_id;
    if found then
      v_ids := v_ids || v_id;
      continue;
    end if;

    v_date := private.payload_text(v_row, 'record_date')::date;
    v_void := coalesce((v_row ->> 'voided')::boolean, false);
    v_head := null;
    select v.* into v_head from facts.daily_record_versions v
     where v.batch_id = p_batch_id and v.record_date = v_date
       and not exists (select 1 from facts.daily_record_versions s where s.supersedes_id = v.id);

    v_supersedes := (v_row ->> 'supersedes_id')::uuid;
    if v_supersedes is not null and v_head.id is distinct from v_supersedes then
      perform private.stale(format('Day %s''s record', v_date - v_placement + 1));
    end if;
    if v_head.id is null and v_void then
      raise exception 'Day %: there is no record to void', v_date - v_placement + 1 using errcode = '22023';
    end if;

    if v_void then
      v_new := v_head;
    else
      v_new.mortality_cumulative := private.payload_text(v_row, 'mortality_cumulative')::integer;
      v_new.cull_cumulative := private.payload_text(v_row, 'cull_cumulative')::integer;
      v_new.feed_starter_g := private.payload_text(v_row, 'feed_starter_g')::integer;
      v_new.feed_grower_g := private.payload_text(v_row, 'feed_grower_g')::integer;
      v_new.feed_finisher_g := private.payload_text(v_row, 'feed_finisher_g')::integer;
      v_new.avg_weight_g := private.payload_text(v_row, 'avg_weight_g')::integer;
      v_new.weight_sample_size := private.payload_text(v_row, 'weight_sample_size')::integer;
      v_new.notes := private.payload_text(v_row, 'notes');
      v_new.feed_entry_source := private.payload_text(v_row, 'feed_entry_source');
      v_new.feed_phase := private.payload_text(v_row, 'feed_phase');
      v_new.feed_phase_source := private.payload_text(v_row, 'feed_phase_source');
    end if;

    if v_head.id is not null then
      if (v_void and v_head.voided)
         or (not v_void and not v_head.voided
             and v_head.mortality_cumulative = v_new.mortality_cumulative
             and v_head.cull_cumulative = v_new.cull_cumulative
             and v_head.feed_starter_g = v_new.feed_starter_g
             and v_head.feed_grower_g = v_new.feed_grower_g
             and v_head.feed_finisher_g = v_new.feed_finisher_g
             and v_head.avg_weight_g is not distinct from v_new.avg_weight_g
             and v_head.weight_sample_size is not distinct from v_new.weight_sample_size
             and v_head.notes is not distinct from v_new.notes
             and v_head.feed_entry_source is not distinct from v_new.feed_entry_source
             and v_head.feed_phase is not distinct from v_new.feed_phase
             and v_head.feed_phase_source is not distinct from v_new.feed_phase_source) then
        v_ids := v_ids || v_head.id;
        continue;
      end if;
      if not v_is_manager and v_head.created_by is distinct from v_uid then
        raise exception 'Day % was recorded by another user; a manager or owner can correct it', v_date - v_placement + 1
          using errcode = '42501';
      end if;
    end if;

    insert into facts.daily_record_versions (
      org_id, batch_id, record_date, mortality_cumulative, cull_cumulative,
      feed_starter_g, feed_grower_g, feed_finisher_g, avg_weight_g, weight_sample_size, notes,
      feed_entry_source, feed_phase, feed_phase_source,
      supersedes_id, voided, client_request_id, created_by
    ) values (
      v_org, p_batch_id, v_date, v_new.mortality_cumulative, v_new.cull_cumulative,
      v_new.feed_starter_g, v_new.feed_grower_g, v_new.feed_finisher_g, v_new.avg_weight_g, v_new.weight_sample_size, v_new.notes,
      v_new.feed_entry_source, v_new.feed_phase, v_new.feed_phase_source,
      v_head.id, v_void, v_crid, v_uid
    ) returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  return v_ids;
end;
$$;

-- Same body as U6 chunk 7's, plus the three provenance keys on each record.
create or replace function public.engine_snapshot(p_batch_id uuid, p_as_of date) returns jsonb
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
               'avg_weight_g', r.avg_weight_g, 'weight_sample_size', r.weight_sample_size,
               'feed_entry_source', r.feed_entry_source, 'feed_phase', r.feed_phase,
               'feed_phase_source', r.feed_phase_source)
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
