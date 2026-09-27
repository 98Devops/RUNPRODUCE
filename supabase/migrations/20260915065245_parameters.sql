-- U6 migration 2 of 5 · Parameter sets and breed curves (chunk 3: D9-D12).
-- Decisions: AD-61 to AD-72. Immutable; created whole by one function each;
-- readable by OWNER and MANAGER (AD-86, AD-87); written by OWNER only.

create table public.breed_curves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  name text not null,
  source text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (id, org_id)
);

create table public.breed_curve_points (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  curve_id uuid not null,
  day_number smallint not null constraint breed_curve_points_day_number_positive check (day_number >= 1),
  weight_g integer not null constraint breed_curve_points_weight_positive check (weight_g > 0),
  feed_g integer not null constraint breed_curve_points_feed_nonnegative check (feed_g >= 0),
  phase text not null constraint breed_curve_points_phase_values check (phase in ('STARTER', 'GROWER', 'FINISHER')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (curve_id, org_id) references public.breed_curves (id, org_id),
  unique (curve_id, day_number)
);

create table public.breed_curve_phases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  curve_id uuid not null,
  phase text not null constraint breed_curve_phases_phase_values check (phase in ('STARTER', 'GROWER', 'FINISHER')),
  first_day smallint not null constraint breed_curve_phases_first_day_positive check (first_day >= 1),
  last_day smallint not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  constraint breed_curve_phases_day_range check (first_day <= last_day),
  foreign key (curve_id, org_id) references public.breed_curves (id, org_id),
  unique (curve_id, phase)
);

create table public.parameter_sets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  effective_from date not null,
  revision smallint not null constraint parameter_sets_revision_positive check (revision >= 1),
  note text,
  mortality_base_rate_bp_daily integer not null constraint parameter_sets_mortality_base_nonnegative check (mortality_base_rate_bp_daily >= 0),
  mortality_ramp_start_day smallint not null constraint parameter_sets_mortality_ramp_start_positive check (mortality_ramp_start_day >= 1),
  mortality_ramp_rate_bp_daily integer not null constraint parameter_sets_mortality_ramp_nonnegative check (mortality_ramp_rate_bp_daily >= 0),
  slaughter_target_g integer not null constraint parameter_sets_slaughter_target_positive check (slaughter_target_g > 0),
  gate_pricing_basis text not null constraint parameter_sets_gate_pricing_basis_values check (gate_pricing_basis in ('PER_BIRD', 'PER_KG')),
  gate_price_cents_per_bird bigint constraint parameter_sets_gate_price_per_bird_positive check (gate_price_cents_per_bird > 0),
  gate_price_cents_per_kg bigint constraint parameter_sets_gate_price_per_kg_positive check (gate_price_cents_per_kg > 0),
  gate_capacity_per_day integer not null constraint parameter_sets_gate_capacity_positive check (gate_capacity_per_day > 0),
  abattoir_fee_cents bigint constraint parameter_sets_abattoir_fee_nonnegative check (abattoir_fee_cents >= 0),
  transport_cents_per_bird bigint constraint parameter_sets_transport_nonnegative check (transport_cents_per_bird >= 0),
  delivery_mode text not null constraint parameter_sets_delivery_mode_values check (delivery_mode in ('ABATTOIR', 'DIRECT')),
  feed_terms_days smallint not null constraint parameter_sets_feed_terms_nonnegative check (feed_terms_days >= 0),
  delivery_cents_per_tonne bigint not null constraint parameter_sets_delivery_nonnegative check (delivery_cents_per_tonne >= 0),
  reserve_floor_cents bigint not null constraint parameter_sets_reserve_floor_nonnegative check (reserve_floor_cents >= 0),
  dressing_yield_pct smallint not null constraint parameter_sets_dressing_yield_range check (dressing_yield_pct between 1 and 100),
  calibration_trailing_days_min smallint not null constraint parameter_sets_calibration_positive check (calibration_trailing_days_min >= 1),
  placement_step_birds integer not null constraint parameter_sets_placement_step_positive check (placement_step_birds > 0),
  max_placement_birds integer constraint parameter_sets_max_placement_positive check (max_placement_birds > 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (id, org_id),
  unique (org_id, effective_from, revision)
);
-- D10: the set in force is the latest effective_from <= asOf, then the highest revision.
create index parameter_sets_in_force on public.parameter_sets (org_id, effective_from desc, revision desc);

create table public.overhead_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  parameter_set_id uuid not null,
  position smallint not null constraint overhead_lines_position_nonnegative check (position >= 0),
  key text not null constraint overhead_lines_key_values check (key in ('vaccine', 'electricity_heating', 'labour', 'transport_other')),
  label text not null,
  basis text not null constraint overhead_lines_basis_values check (basis in ('PER_BIRD', 'PER_BATCH')),
  timing text not null constraint overhead_lines_timing_values check (timing in ('PLACEMENT', 'MONTHLY', 'HARVEST_COMPLETE')),
  amount_cents bigint not null constraint overhead_lines_amount_nonnegative check (amount_cents >= 0),
  measured_at_flock_size integer not null constraint overhead_lines_measured_flock_positive check (measured_at_flock_size > 0),
  confidence text not null constraint overhead_lines_confidence_values check (confidence in ('measured', 'calibrated', 'assumed')),
  source text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (parameter_set_id, org_id) references public.parameter_sets (id, org_id),
  unique (parameter_set_id, key),
  unique (parameter_set_id, position)
);

create table public.planning_bulk_bands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  parameter_set_id uuid not null,
  dressed_floor_g integer not null constraint planning_bulk_bands_floor_positive check (dressed_floor_g > 0),
  price_cents_per_bird bigint not null constraint planning_bulk_bands_price_positive check (price_cents_per_bird > 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (parameter_set_id, org_id) references public.parameter_sets (id, org_id),
  unique (parameter_set_id, dressed_floor_g)
);

create table public.feed_prices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  parameter_set_id uuid not null,
  phase text not null constraint feed_prices_phase_values check (phase in ('STARTER', 'GROWER', 'FINISHER')),
  price_per_bag_cents bigint not null constraint feed_prices_price_positive check (price_per_bag_cents > 0),
  bag_kg integer not null constraint feed_prices_bag_kg_positive check (bag_kg > 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (parameter_set_id, org_id) references public.parameter_sets (id, org_id),
  unique (parameter_set_id, phase)
);

do $$
declare
  t text;
begin
  foreach t in array array['breed_curves', 'breed_curve_points', 'breed_curve_phases', 'parameter_sets',
                           'overhead_lines', 'planning_bulk_bands', 'feed_prices'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function private.refuse_change()',
                   t || '_immutable', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.has_role(org_id, array[''OWNER'', ''MANAGER'']))',
                   t || '_owner_manager_read', t);
  end loop;
end;
$$;

-- D9, D10: a parameter set, its overhead lines, planning bands and three feed
-- prices, inserted in one transaction. The revision is assigned here.
create function public.create_parameter_set(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_org uuid := private.payload_text(payload, 'org_id')::uuid;
  v_effective date := private.payload_text(payload, 'effective_from')::date;
  v_prices jsonb := private.payload_array(payload, 'feed_prices');
  v_lines jsonb := private.payload_array(payload, 'overhead_lines');
  v_bands jsonb := private.payload_array(payload, 'planning_bulk_bands');
  v_revision smallint;
  v_id uuid;
begin
  if not private.has_role(v_org, array['OWNER']) then
    perform private.deny();
  end if;

  if jsonb_array_length(v_prices) <> 3
     or (select count(distinct e ->> 'phase') from jsonb_array_elements(v_prices) e) <> 3 then
    raise exception 'A parameter set needs exactly one feed price for each phase (STARTER, GROWER, FINISHER)'
      using errcode = '23514';
  end if;
  if (select count(distinct e ->> 'dressed_floor_g') from jsonb_array_elements(v_bands) e) <> jsonb_array_length(v_bands) then
    raise exception 'Planning bulk bands must have distinct dressed floors' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('parameter_set:' || v_org::text || ':' || v_effective::text, 0));
  select coalesce(max(s.revision), 0) + 1 into v_revision
    from public.parameter_sets s
   where s.org_id = v_org and s.effective_from = v_effective;

  insert into public.parameter_sets (
    org_id, effective_from, revision, note,
    mortality_base_rate_bp_daily, mortality_ramp_start_day, mortality_ramp_rate_bp_daily,
    slaughter_target_g, gate_pricing_basis, gate_price_cents_per_bird, gate_price_cents_per_kg,
    gate_capacity_per_day, abattoir_fee_cents, transport_cents_per_bird, delivery_mode,
    feed_terms_days, delivery_cents_per_tonne, reserve_floor_cents, dressing_yield_pct,
    calibration_trailing_days_min, placement_step_birds, max_placement_birds, created_by
  ) values (
    v_org, v_effective, v_revision, private.payload_text(payload, 'note'),
    private.payload_text(payload, 'mortality_base_rate_bp_daily')::integer,
    private.payload_text(payload, 'mortality_ramp_start_day')::smallint,
    private.payload_text(payload, 'mortality_ramp_rate_bp_daily')::integer,
    private.payload_text(payload, 'slaughter_target_g')::integer,
    private.payload_text(payload, 'gate_pricing_basis'),
    private.payload_cents(payload, 'gate_price_cents_per_bird'),
    private.payload_cents(payload, 'gate_price_cents_per_kg'),
    private.payload_text(payload, 'gate_capacity_per_day')::integer,
    private.payload_cents(payload, 'abattoir_fee_cents'),
    private.payload_cents(payload, 'transport_cents_per_bird'),
    private.payload_text(payload, 'delivery_mode'),
    private.payload_text(payload, 'feed_terms_days')::smallint,
    private.payload_cents(payload, 'delivery_cents_per_tonne'),
    private.payload_cents(payload, 'reserve_floor_cents'),
    private.payload_text(payload, 'dressing_yield_pct')::smallint,
    private.payload_text(payload, 'calibration_trailing_days_min')::smallint,
    private.payload_text(payload, 'placement_step_birds')::integer,
    private.payload_text(payload, 'max_placement_birds')::integer,
    v_uid
  ) returning id into v_id;

  insert into public.overhead_lines (
    org_id, parameter_set_id, position, key, label, basis, timing, amount_cents,
    measured_at_flock_size, confidence, source, created_by
  )
  select v_org, v_id, (e.ord - 1)::smallint,
         private.payload_text(e.line, 'key'), private.payload_text(e.line, 'label'),
         private.payload_text(e.line, 'basis'), private.payload_text(e.line, 'timing'),
         private.payload_cents(e.line, 'amount_cents'),
         private.payload_text(e.line, 'measured_at_flock_size')::integer,
         private.payload_text(e.line, 'confidence'), private.payload_text(e.line, 'source'),
         v_uid
    from jsonb_array_elements(v_lines) with ordinality as e (line, ord);

  insert into public.planning_bulk_bands (org_id, parameter_set_id, dressed_floor_g, price_cents_per_bird, created_by)
  select v_org, v_id, private.payload_text(b, 'dressed_floor_g')::integer, private.payload_cents(b, 'price_cents_per_bird'), v_uid
    from jsonb_array_elements(v_bands) b;

  insert into public.feed_prices (org_id, parameter_set_id, phase, price_per_bag_cents, bag_kg, created_by)
  select v_org, v_id, private.payload_text(f, 'phase'), private.payload_cents(f, 'price_per_bag_cents'),
         private.payload_text(f, 'bag_kg')::integer, v_uid
    from jsonb_array_elements(v_prices) f;

  return v_id;
end;
$$;

-- D11: a breed curve, its points and phase ranges, created whole. Checks the
-- two rules no CHECK can express, as the engine does on its seed: days
-- contiguous from 1, and each point's phase agreeing with the phase ranges.
create function public.create_breed_curve(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_org uuid := private.payload_text(payload, 'org_id')::uuid;
  v_points jsonb := private.payload_array(payload, 'points');
  v_phases jsonb := private.payload_array(payload, 'phases');
  v_id uuid;
  v_bad record;
begin
  if not private.has_role(v_org, array['OWNER']) then
    perform private.deny();
  end if;

  if jsonb_array_length(v_points) = 0 then
    raise exception 'Breed curve is empty' using errcode = '23514';
  end if;
  if jsonb_array_length(v_phases) <> 3
     or (select count(distinct e ->> 'phase') from jsonb_array_elements(v_phases) e) <> 3 then
    raise exception 'A breed curve needs exactly one day range for each phase (STARTER, GROWER, FINISHER)'
      using errcode = '23514';
  end if;

  select p.ord, (p.point ->> 'day_number')::integer as day into v_bad
    from jsonb_array_elements(v_points) with ordinality as p (point, ord)
   where (p.point ->> 'day_number')::integer is distinct from p.ord::integer
   order by p.ord
   limit 1;
  if found then
    raise exception 'Breed curve must be contiguous from day 1; found day % at position %', v_bad.day, v_bad.ord
      using errcode = '23514';
  end if;

  select (p ->> 'day_number')::integer as day, p ->> 'phase' as phase,
         (select r ->> 'phase' from jsonb_array_elements(v_phases) r
           where (p ->> 'day_number')::integer between (r ->> 'first_day')::integer and (r ->> 'last_day')::integer
           limit 1) as in_range
    into v_bad
    from jsonb_array_elements(v_points) p
   where (p ->> 'phase') is distinct from
         (select r ->> 'phase' from jsonb_array_elements(v_phases) r
           where (p ->> 'day_number')::integer between (r ->> 'first_day')::integer and (r ->> 'last_day')::integer
           limit 1)
   limit 1;
  if found then
    if v_bad.in_range is null then
      raise exception 'Breed curve day % falls outside every phase day range', v_bad.day using errcode = '23514';
    end if;
    raise exception 'Breed curve day % is labelled % but falls in %''s day range', v_bad.day, v_bad.phase, v_bad.in_range
      using errcode = '23514';
  end if;

  insert into public.breed_curves (org_id, name, source, created_by)
  values (v_org, private.payload_text(payload, 'name'), private.payload_text(payload, 'source'), v_uid)
  returning id into v_id;

  insert into public.breed_curve_phases (org_id, curve_id, phase, first_day, last_day, created_by)
  select v_org, v_id, private.payload_text(r, 'phase'),
         private.payload_text(r, 'first_day')::smallint, private.payload_text(r, 'last_day')::smallint, v_uid
    from jsonb_array_elements(v_phases) r;

  insert into public.breed_curve_points (org_id, curve_id, day_number, weight_g, feed_g, phase, created_by)
  select v_org, v_id, private.payload_text(p, 'day_number')::smallint, private.payload_text(p, 'weight_g')::integer,
         private.payload_text(p, 'feed_g')::integer, private.payload_text(p, 'phase'), v_uid
    from jsonb_array_elements(v_points) p;

  return v_id;
end;
$$;
