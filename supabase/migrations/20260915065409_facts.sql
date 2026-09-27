-- U6 migration 3 of 5 · Recorded facts (chunks 4 and 5: D13-D19, AD-74 to AD-84),
-- with row-level security (AD-86, AD-87) and the deferred integrity triggers
-- (AD-76, amended by AD-87: SECURITY DEFINER).
--
-- Every *_versions table shares: id, org_id, supersedes_id (UNIQUE, composite
-- self-FK so a correction cannot move to another parent or key), voided,
-- client_request_id (UNIQUE), created_at, created_by. A row is CURRENT when no
-- row supersedes it and it is not voided.

create table facts.batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  code text not null,
  breed_curve_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (breed_curve_id, org_id) references public.breed_curves (id, org_id),
  unique (org_id, code),
  unique (id, org_id)
);

create table facts.batch_placement_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  batch_id uuid not null,
  placement_date date not null,
  chick_count integer not null constraint batch_placement_versions_chick_count_positive check (chick_count > 0),
  extra_chick_count integer not null constraint batch_placement_versions_extra_chick_count_nonnegative check (extra_chick_count >= 0),
  chick_price_cents bigint not null constraint batch_placement_versions_chick_price_positive check (chick_price_cents > 0),
  supersedes_id uuid unique,
  voided boolean not null default false,
  client_request_id uuid not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  constraint batch_placement_versions_void_supersedes check (not voided or supersedes_id is not null),
  foreign key (batch_id, org_id) references facts.batches (id, org_id),
  unique (id, batch_id),
  foreign key (supersedes_id, batch_id) references facts.batch_placement_versions (id, batch_id)
);
create unique index batch_placement_versions_one_chain on facts.batch_placement_versions (batch_id) where supersedes_id is null;

create table facts.batch_closure_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  batch_id uuid not null,
  closed_on date not null,
  supersedes_id uuid unique,
  voided boolean not null default false,
  client_request_id uuid not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  constraint batch_closure_versions_void_supersedes check (not voided or supersedes_id is not null),
  foreign key (batch_id, org_id) references facts.batches (id, org_id),
  unique (id, batch_id),
  foreign key (supersedes_id, batch_id) references facts.batch_closure_versions (id, batch_id)
);
create unique index batch_closure_versions_one_chain on facts.batch_closure_versions (batch_id) where supersedes_id is null;

create table facts.daily_record_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  batch_id uuid not null,
  record_date date not null,
  mortality_cumulative integer not null constraint daily_record_versions_mortality_nonnegative check (mortality_cumulative >= 0),
  cull_cumulative integer not null constraint daily_record_versions_cull_nonnegative check (cull_cumulative >= 0),
  -- AD-82: feed is not null with no default. A blank fails; it never stores a zero nobody entered.
  feed_starter_g integer not null constraint daily_record_versions_feed_starter_nonnegative check (feed_starter_g >= 0),
  feed_grower_g integer not null constraint daily_record_versions_feed_grower_nonnegative check (feed_grower_g >= 0),
  feed_finisher_g integer not null constraint daily_record_versions_feed_finisher_nonnegative check (feed_finisher_g >= 0),
  avg_weight_g integer constraint daily_record_versions_weight_positive check (avg_weight_g > 0),
  weight_sample_size integer constraint daily_record_versions_sample_positive check (weight_sample_size > 0),
  notes text,
  supersedes_id uuid unique,
  voided boolean not null default false,
  client_request_id uuid not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  constraint daily_record_versions_void_supersedes check (not voided or supersedes_id is not null),
  constraint daily_record_versions_weight_with_sample check ((avg_weight_g is null) = (weight_sample_size is null)),
  foreign key (batch_id, org_id) references facts.batches (id, org_id),
  unique (id, batch_id, record_date),
  -- AD-84: a correction stays on its date. A wrong date is voided and re-entered.
  foreign key (supersedes_id, batch_id, record_date) references facts.daily_record_versions (id, batch_id, record_date)
);
create unique index daily_record_versions_one_chain on facts.daily_record_versions (batch_id, record_date) where supersedes_id is null;
create index daily_record_versions_batch_date on facts.daily_record_versions (batch_id, record_date);

create table facts.feed_draw_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  batch_id uuid not null,
  collection_date date not null,
  phase text not null constraint feed_draw_versions_phase_values check (phase in ('STARTER', 'GROWER', 'FINISHER')),
  -- AD-78: unconstrained numeric plus a scale CHECK, so a third decimal is
  -- refused rather than silently rounded.
  bags numeric not null constraint feed_draw_versions_bags_positive check (bags > 0),
  feed_g integer not null constraint feed_draw_versions_feed_positive check (feed_g > 0),
  price_per_bag_cents bigint not null constraint feed_draw_versions_price_positive check (price_per_bag_cents > 0),
  terms_days smallint not null constraint feed_draw_versions_terms_nonnegative check (terms_days >= 0),
  reference text,
  due_date date generated always as (collection_date + terms_days::integer) stored,
  supersedes_id uuid unique,
  voided boolean not null default false,
  client_request_id uuid not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  constraint feed_draw_versions_bags_two_decimals check (scale(bags) <= 2),
  constraint feed_draw_versions_void_supersedes check (not voided or supersedes_id is not null),
  foreign key (batch_id, org_id) references facts.batches (id, org_id),
  unique (id, batch_id),
  foreign key (supersedes_id, batch_id) references facts.feed_draw_versions (id, batch_id)
);
create index feed_draw_versions_batch on facts.feed_draw_versions (batch_id);

create table facts.sales_order_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  batch_id uuid not null,
  channel text not null constraint sales_order_versions_channel_values check (channel in ('GATE', 'BULK')),
  order_date date not null,
  bird_count integer not null constraint sales_order_versions_bird_count_positive check (bird_count > 0),
  avg_live_weight_g integer not null constraint sales_order_versions_live_weight_positive check (avg_live_weight_g > 0),
  avg_dressed_weight_g integer constraint sales_order_versions_dressed_weight_positive check (avg_dressed_weight_g > 0),
  pricing_basis text not null constraint sales_order_versions_pricing_basis_values check (pricing_basis in ('PER_BIRD', 'PER_KG', 'BANDED')),
  price_cents_per_bird bigint constraint sales_order_versions_price_per_bird_positive check (price_cents_per_bird > 0),
  price_cents_per_kg bigint constraint sales_order_versions_price_per_kg_positive check (price_cents_per_kg > 0),
  terms_days smallint not null constraint sales_order_versions_terms_nonnegative check (terms_days >= 0),
  supersedes_id uuid unique,
  voided boolean not null default false,
  client_request_id uuid not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  constraint sales_order_versions_banded_is_bulk check (pricing_basis <> 'BANDED' or channel = 'BULK'),
  constraint sales_order_versions_void_supersedes check (not voided or supersedes_id is not null),
  foreign key (batch_id, org_id) references facts.batches (id, org_id),
  unique (id, batch_id),
  unique (id, org_id),
  foreign key (supersedes_id, batch_id) references facts.sales_order_versions (id, batch_id)
);
create index sales_order_versions_batch on facts.sales_order_versions (batch_id);

create table facts.sales_order_bands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  sales_order_version_id uuid not null,
  dressed_floor_g integer not null constraint sales_order_bands_floor_positive check (dressed_floor_g > 0),
  price_cents_per_bird bigint not null constraint sales_order_bands_price_positive check (price_cents_per_bird > 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (sales_order_version_id, org_id) references facts.sales_order_versions (id, org_id),
  unique (sales_order_version_id, dressed_floor_g)
);

create table facts.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (id, org_id)
);

create table facts.cash_account_opening_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  account_id uuid not null,
  opening_date date not null,
  -- No sign CHECK: an overdrawn opening balance is real.
  opening_balance_cents bigint not null,
  supersedes_id uuid unique,
  voided boolean not null default false,
  client_request_id uuid not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  constraint cash_account_opening_versions_void_supersedes check (not voided or supersedes_id is not null),
  foreign key (account_id, org_id) references facts.cash_accounts (id, org_id),
  unique (id, account_id),
  foreign key (supersedes_id, account_id) references facts.cash_account_opening_versions (id, account_id)
);
create unique index cash_account_opening_versions_one_chain on facts.cash_account_opening_versions (account_id) where supersedes_id is null;

create table facts.cash_transaction_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  account_id uuid not null,
  txn_date date not null,
  direction text not null constraint cash_transaction_versions_direction_values check (direction in ('IN', 'OUT')),
  amount_cents bigint not null constraint cash_transaction_versions_amount_positive check (amount_cents > 0),
  category text not null,
  batch_id uuid,
  supersedes_id uuid unique,
  voided boolean not null default false,
  client_request_id uuid not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  constraint cash_transaction_versions_void_supersedes check (not voided or supersedes_id is not null),
  foreign key (account_id, org_id) references facts.cash_accounts (id, org_id),
  foreign key (batch_id, org_id) references facts.batches (id, org_id),
  unique (id, account_id),
  foreign key (supersedes_id, account_id) references facts.cash_transaction_versions (id, account_id)
);
create index cash_transaction_versions_account on facts.cash_transaction_versions (account_id);

-- Immutability, RLS and read policies. A role reads a table whole or not at
-- all (AD-87): money-bearing tables, and tables joined to them in a view, are
-- OWNER and MANAGER only. Daily records carry no money and are read by all three.
do $$
declare
  t text;
begin
  foreach t in array array['batches', 'batch_placement_versions', 'batch_closure_versions', 'daily_record_versions',
                           'feed_draw_versions', 'sales_order_versions', 'sales_order_bands', 'cash_accounts',
                           'cash_account_opening_versions', 'cash_transaction_versions'] loop
    execute format('alter table facts.%I enable row level security', t);
    execute format('create trigger %I before update or delete on facts.%I for each row execute function private.refuse_change()',
                   t || '_immutable', t);
    if t = 'daily_record_versions' then
      execute format('create policy %I on facts.%I for select to authenticated using (private.has_role(org_id, array[''OWNER'', ''MANAGER'', ''WORKER'']))',
                     t || '_members_read', t);
    else
      execute format('create policy %I on facts.%I for select to authenticated using (private.has_role(org_id, array[''OWNER'', ''MANAGER'']))',
                     t || '_owner_manager_read', t);
    end if;
  end loop;
end;
$$;

-- The current placement of a batch (the one row nothing supersedes, not voided).
create function private.current_placement(p_batch uuid) returns facts.batch_placement_versions
language sql stable security definer set search_path = '' as $$
  select v.*
    from facts.batch_placement_versions v
   where v.batch_id = p_batch
     and not v.voided
     and not exists (select 1 from facts.batch_placement_versions s where s.supersedes_id = v.id);
$$;

-- Each check begins by locking the batch identity row (FOR NO KEY UPDATE: the
-- inserts already hold FOR KEY SHARE on it through their foreign keys, and FOR
-- UPDATE would deadlock two writers; NO KEY UPDATE still serialises the checks), so two transactions
-- cannot both pass against the same stale total: under READ COMMITTED the
-- statements after the lock see whatever committed while this one waited.
-- Messages use the engine's own wording (production.ts), with SQLSTATE 23514.

create function private.check_removals(p_batch uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_place facts.batch_placement_versions;
  v_flock integer;
  v_prev_mortality integer := 0;
  v_prev_culls integer := 0;
  r record;
begin
  perform 1 from facts.batches where id = p_batch for no key update;
  v_place := private.current_placement(p_batch);
  if v_place.id is null then
    raise exception 'Batch has no current placement' using errcode = '23514';
  end if;
  v_flock := v_place.chick_count + v_place.extra_chick_count;

  for r in
    select v.record_date, v.mortality_cumulative, v.cull_cumulative,
           (v.record_date - v_place.placement_date) + 1 as day_number
      from facts.daily_record_versions v
     where v.batch_id = p_batch
       and not v.voided
       and not exists (select 1 from facts.daily_record_versions s where s.supersedes_id = v.id)
     order by v.record_date
  loop
    if r.record_date < v_place.placement_date then
      raise exception 'Daily record dated % is before placement on %', r.record_date, v_place.placement_date
        using errcode = '23514';
    end if;
    if r.mortality_cumulative < v_prev_mortality then
      raise exception 'Day %: mortality_cumulative must be monotonic — % is below the previous %',
        r.day_number, r.mortality_cumulative, v_prev_mortality using errcode = '23514';
    end if;
    if r.cull_cumulative < v_prev_culls then
      raise exception 'Day %: cull_cumulative must be monotonic — % is below the previous %',
        r.day_number, r.cull_cumulative, v_prev_culls using errcode = '23514';
    end if;
    if r.mortality_cumulative + r.cull_cumulative > v_flock then
      raise exception 'Day %: removals exceed the flock — % dead + % culled = % from % birds',
        r.day_number, r.mortality_cumulative, r.cull_cumulative, r.mortality_cumulative + r.cull_cumulative, v_flock
        using errcode = '23514';
    end if;
    v_prev_mortality := r.mortality_cumulative;
    v_prev_culls := r.cull_cumulative;
  end loop;
end;
$$;

create function private.check_sales(p_batch uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_place facts.batch_placement_versions;
  v_flock integer;
  v_sold bigint;
  v_early date;
begin
  perform 1 from facts.batches where id = p_batch for no key update;
  v_place := private.current_placement(p_batch);
  if v_place.id is null then
    raise exception 'Batch has no current placement' using errcode = '23514';
  end if;
  v_flock := v_place.chick_count + v_place.extra_chick_count;

  select coalesce(sum(v.bird_count), 0), min(v.order_date) into v_sold, v_early
    from facts.sales_order_versions v
   where v.batch_id = p_batch
     and not v.voided
     and not exists (select 1 from facts.sales_order_versions s where s.supersedes_id = v.id);

  if v_early < v_place.placement_date then
    raise exception 'Sales order dated % is before placement on %', v_early, v_place.placement_date using errcode = '23514';
  end if;
  if v_sold > v_flock then
    raise exception 'Sales orders total % birds, more than the % placed', v_sold, v_flock using errcode = '23514';
  end if;
end;
$$;

create function private.check_draws(p_batch uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_place facts.batch_placement_versions;
  v_early date;
begin
  perform 1 from facts.batches where id = p_batch for no key update;
  v_place := private.current_placement(p_batch);
  if v_place.id is null then
    raise exception 'Batch has no current placement' using errcode = '23514';
  end if;
  select min(v.collection_date) into v_early
    from facts.feed_draw_versions v
   where v.batch_id = p_batch
     and not v.voided
     and not exists (select 1 from facts.feed_draw_versions s where s.supersedes_id = v.id);
  -- OQ-34, assumed "never": a draw before placement would crash the calendar.
  if v_early < v_place.placement_date then
    raise exception 'Feed draw collected % is before placement on %', v_early, v_place.placement_date using errcode = '23514';
  end if;
end;
$$;

create function private.check_closure(p_batch uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_place facts.batch_placement_versions;
  v_closed date;
begin
  perform 1 from facts.batches where id = p_batch for no key update;
  v_place := private.current_placement(p_batch);
  if v_place.id is null then
    raise exception 'Batch has no current placement' using errcode = '23514';
  end if;
  select v.closed_on into v_closed
    from facts.batch_closure_versions v
   where v.batch_id = p_batch
     and not v.voided
     and not exists (select 1 from facts.batch_closure_versions s where s.supersedes_id = v.id);
  if v_closed < v_place.placement_date then
    raise exception 'Batch closed on % is before placement on %', v_closed, v_place.placement_date using errcode = '23514';
  end if;
end;
$$;

create function private.trg_daily_records_removals_valid() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_removals(new.batch_id);
  return null;
end;
$$;

create function private.trg_sales_orders_within_flock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_sales(new.batch_id);
  return null;
end;
$$;

create function private.trg_feed_draws_after_placement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_draws(new.batch_id);
  return null;
end;
$$;

create function private.trg_batch_closures_after_placement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_closure(new.batch_id);
  return null;
end;
$$;

-- Deferred to commit, so several days corrected together are checked together,
-- and fired from both sides of each bound (a placement correction re-checks all).
create constraint trigger daily_records_removals_valid after insert on facts.daily_record_versions
  deferrable initially deferred for each row execute function private.trg_daily_records_removals_valid();
create constraint trigger daily_records_removals_valid after insert on facts.batch_placement_versions
  deferrable initially deferred for each row execute function private.trg_daily_records_removals_valid();

create constraint trigger sales_orders_within_flock after insert on facts.sales_order_versions
  deferrable initially deferred for each row execute function private.trg_sales_orders_within_flock();
create constraint trigger sales_orders_within_flock after insert on facts.batch_placement_versions
  deferrable initially deferred for each row execute function private.trg_sales_orders_within_flock();

create constraint trigger feed_draws_after_placement after insert on facts.feed_draw_versions
  deferrable initially deferred for each row execute function private.trg_feed_draws_after_placement();
create constraint trigger feed_draws_after_placement after insert on facts.batch_placement_versions
  deferrable initially deferred for each row execute function private.trg_feed_draws_after_placement();

create constraint trigger batch_closures_after_placement after insert on facts.batch_closure_versions
  deferrable initially deferred for each row execute function private.trg_batch_closures_after_placement();
create constraint trigger batch_closures_after_placement after insert on facts.batch_placement_versions
  deferrable initially deferred for each row execute function private.trg_batch_closures_after_placement();
