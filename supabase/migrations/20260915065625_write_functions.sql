-- U6 migration 5 of 5 · Write functions (AD-76, AD-88), capture_batches (AD-87),
-- and the grants sweep over every object (AD-89).
--
-- Every write function: SECURITY DEFINER, search_path = ''; refuses a caller
-- with no session; takes the organisation from the row it writes to (only
-- top-level creators take org_id, and check the role in it); sets created_by
-- from the session; returns the existing id on a repeated client_request_id;
-- writes nothing and returns the current id when the values equal the current
-- row; refuses a supersedes_id that is not the head of its chain (RP001).

create function private.batch_org(p_batch uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select b.org_id from facts.batches b where b.id = p_batch;
$$;

create function private.stale(p_what text) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception '% changed since you opened it', p_what using errcode = 'RP001';
end;
$$;

-- record_batch: identity + first placement, one transaction. OWNER, MANAGER.
create function public.record_batch(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_org uuid := private.payload_text(payload, 'org_id')::uuid;
  v_crid uuid := private.payload_text(payload, 'client_request_id')::uuid;
  v_curve uuid := private.payload_text(payload, 'breed_curve_id')::uuid;
  v_existing facts.batch_placement_versions;
  v_batch uuid;
begin
  if not private.has_role(v_org, array['OWNER', 'MANAGER']) then
    perform private.deny();
  end if;

  select * into v_existing from facts.batch_placement_versions where client_request_id = v_crid;
  if found then
    if v_existing.org_id <> v_org then
      perform private.deny();
    end if;
    return v_existing.batch_id;
  end if;

  if not exists (select 1 from public.breed_curves c where c.id = v_curve and c.org_id = v_org) then
    perform private.deny();
  end if;

  insert into facts.batches (org_id, code, breed_curve_id, created_by)
  values (v_org, private.payload_text(payload, 'code'), v_curve, v_uid)
  returning id into v_batch;

  insert into facts.batch_placement_versions (
    org_id, batch_id, placement_date, chick_count, extra_chick_count, chick_price_cents, client_request_id, created_by
  ) values (
    v_org, v_batch,
    private.payload_text(payload, 'placement_date')::date,
    private.payload_text(payload, 'chick_count')::integer,
    private.payload_text(payload, 'extra_chick_count')::integer,
    private.payload_cents(payload, 'chick_price_cents'),
    v_crid, v_uid
  );
  return v_batch;
end;
$$;

-- record_batch_placement: a correction of the placement. OWNER, MANAGER.
-- A placement is corrected, never voided: a batch always has one.
create function public.record_batch_placement(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_batch uuid := private.payload_text(payload, 'batch_id')::uuid;
  v_org uuid := private.batch_org(v_batch);
  v_crid uuid := private.payload_text(payload, 'client_request_id')::uuid;
  v_supersedes uuid := private.payload_text(payload, 'supersedes_id')::uuid;
  v_head facts.batch_placement_versions;
  v_date date := private.payload_text(payload, 'placement_date')::date;
  v_count integer := private.payload_text(payload, 'chick_count')::integer;
  v_extra integer := private.payload_text(payload, 'extra_chick_count')::integer;
  v_price bigint := private.payload_cents(payload, 'chick_price_cents');
  v_id uuid;
begin
  if v_org is null or not private.has_role(v_org, array['OWNER', 'MANAGER']) then
    perform private.deny();
  end if;

  select id into v_id from facts.batch_placement_versions where client_request_id = v_crid and batch_id = v_batch;
  if found then
    return v_id;
  end if;

  select v.* into v_head from facts.batch_placement_versions v
   where v.batch_id = v_batch
     and not exists (select 1 from facts.batch_placement_versions s where s.supersedes_id = v.id);
  if v_supersedes is null or v_head.id is distinct from v_supersedes then
    perform private.stale('This placement');
  end if;

  if v_head.placement_date = v_date and v_head.chick_count = v_count
     and v_head.extra_chick_count = v_extra and v_head.chick_price_cents = v_price then
    return v_head.id;
  end if;

  insert into facts.batch_placement_versions (
    org_id, batch_id, placement_date, chick_count, extra_chick_count, chick_price_cents,
    supersedes_id, client_request_id, created_by
  ) values (v_org, v_batch, v_date, v_count, v_extra, v_price, v_head.id, v_crid, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

-- record_batch_closure: close, correct the date, or void to reopen. OWNER only.
create function public.record_batch_closure(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_batch uuid := private.payload_text(payload, 'batch_id')::uuid;
  v_org uuid := private.batch_org(v_batch);
  v_crid uuid := private.payload_text(payload, 'client_request_id')::uuid;
  v_supersedes uuid := private.payload_text(payload, 'supersedes_id')::uuid;
  v_void boolean := coalesce((payload ->> 'voided')::boolean, false);
  v_head facts.batch_closure_versions;
  v_closed date;
  v_id uuid;
begin
  if v_org is null or not private.has_role(v_org, array['OWNER']) then
    perform private.deny();
  end if;

  select id into v_id from facts.batch_closure_versions where client_request_id = v_crid and batch_id = v_batch;
  if found then
    return v_id;
  end if;

  select v.* into v_head from facts.batch_closure_versions v
   where v.batch_id = v_batch
     and not exists (select 1 from facts.batch_closure_versions s where s.supersedes_id = v.id);
  if v_head.id is distinct from v_supersedes then
    perform private.stale('This batch''s closure');
  end if;
  if v_head.id is null and v_void then
    raise exception 'The batch is not closed, so there is nothing to reopen' using errcode = '22023';
  end if;

  if v_void then
    if v_head.voided then
      return v_head.id;
    end if;
    v_closed := v_head.closed_on;
  else
    v_closed := private.payload_text(payload, 'closed_on')::date;
    if v_head.id is not null and not v_head.voided and v_head.closed_on = v_closed then
      return v_head.id;
    end if;
  end if;

  insert into facts.batch_closure_versions (org_id, batch_id, closed_on, supersedes_id, voided, client_request_id, created_by)
  values (v_org, v_batch, v_closed, v_head.id, v_void, v_crid, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

-- record_daily_records: one or more dates, all in one transaction, so the
-- deferred triggers check them together. OWNER, MANAGER and WORKER create.
-- For each row: a repeated client_request_id returns the existing id; a date
-- with no record starts a chain; a date with a record supersedes its head
-- (supersedes_id, when given, must BE that head); identical values write
-- nothing. AD-86: a WORKER corrects or voids only a head they created. Any
-- refused row aborts the whole call.
create function public.record_daily_records(p_batch_id uuid, p_rows jsonb) returns uuid[]
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
             and v_head.notes is not distinct from v_new.notes) then
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
      supersedes_id, voided, client_request_id, created_by
    ) values (
      v_org, p_batch_id, v_date, v_new.mortality_cumulative, v_new.cull_cumulative,
      v_new.feed_starter_g, v_new.feed_grower_g, v_new.feed_finisher_g, v_new.avg_weight_g, v_new.weight_sample_size, v_new.notes,
      v_head.id, v_void, v_crid, v_uid
    ) returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  return v_ids;
end;
$$;

-- record_feed_draw: new, correction or void. OWNER, MANAGER. No natural key:
-- two identical draws on one day can both be real, so no supersedes_id means new.
create function public.record_feed_draw(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_batch uuid := private.payload_text(payload, 'batch_id')::uuid;
  v_org uuid := private.batch_org(v_batch);
  v_crid uuid := private.payload_text(payload, 'client_request_id')::uuid;
  v_supersedes uuid := (payload ->> 'supersedes_id')::uuid;
  v_void boolean := coalesce((payload ->> 'voided')::boolean, false);
  v_head facts.feed_draw_versions;
  v_new facts.feed_draw_versions;
  v_id uuid;
begin
  if v_org is null or not private.has_role(v_org, array['OWNER', 'MANAGER']) then
    perform private.deny();
  end if;

  select id into v_id from facts.feed_draw_versions where client_request_id = v_crid and batch_id = v_batch;
  if found then
    return v_id;
  end if;

  if v_supersedes is not null then
    select v.* into v_head from facts.feed_draw_versions v where v.id = v_supersedes and v.batch_id = v_batch;
    if not found then
      perform private.deny();
    end if;
    if exists (select 1 from facts.feed_draw_versions s where s.supersedes_id = v_head.id) then
      perform private.stale('This feed draw');
    end if;
  elsif v_void then
    raise exception 'A void must name the draw it voids (supersedes_id)' using errcode = '22023';
  end if;

  if v_void then
    if v_head.voided then
      return v_head.id;
    end if;
    v_new := v_head;
  else
    v_new.collection_date := private.payload_text(payload, 'collection_date')::date;
    v_new.phase := private.payload_text(payload, 'phase');
    v_new.bags := private.payload_text(payload, 'bags')::numeric;
    v_new.feed_g := private.payload_text(payload, 'feed_g')::integer;
    v_new.price_per_bag_cents := private.payload_cents(payload, 'price_per_bag_cents');
    v_new.terms_days := private.payload_text(payload, 'terms_days')::smallint;
    v_new.reference := private.payload_text(payload, 'reference');
    if v_head.id is not null and not v_head.voided
       and v_head.collection_date = v_new.collection_date and v_head.phase = v_new.phase
       and v_head.bags = v_new.bags and v_head.feed_g = v_new.feed_g
       and v_head.price_per_bag_cents = v_new.price_per_bag_cents and v_head.terms_days = v_new.terms_days
       and v_head.reference is not distinct from v_new.reference then
      return v_head.id;
    end if;
  end if;

  insert into facts.feed_draw_versions (
    org_id, batch_id, collection_date, phase, bags, feed_g, price_per_bag_cents, terms_days, reference,
    supersedes_id, voided, client_request_id, created_by
  ) values (
    v_org, v_batch, v_new.collection_date, v_new.phase, v_new.bags, v_new.feed_g, v_new.price_per_bag_cents,
    v_new.terms_days, v_new.reference, v_head.id, v_void, v_crid, v_uid
  ) returning id into v_id;
  return v_id;
end;
$$;

-- record_sales_order: the order and its full band set, new, correction or void.
-- OWNER, MANAGER. A correction writes its own full band set.
create function public.record_sales_order(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_batch uuid := private.payload_text(payload, 'batch_id')::uuid;
  v_org uuid := private.batch_org(v_batch);
  v_crid uuid := private.payload_text(payload, 'client_request_id')::uuid;
  v_supersedes uuid := (payload ->> 'supersedes_id')::uuid;
  v_void boolean := coalesce((payload ->> 'voided')::boolean, false);
  v_head facts.sales_order_versions;
  v_new facts.sales_order_versions;
  v_bands jsonb;
  v_id uuid;
begin
  if v_org is null or not private.has_role(v_org, array['OWNER', 'MANAGER']) then
    perform private.deny();
  end if;

  select id into v_id from facts.sales_order_versions where client_request_id = v_crid and batch_id = v_batch;
  if found then
    return v_id;
  end if;

  if v_supersedes is not null then
    select v.* into v_head from facts.sales_order_versions v where v.id = v_supersedes and v.batch_id = v_batch;
    if not found then
      perform private.deny();
    end if;
    if exists (select 1 from facts.sales_order_versions s where s.supersedes_id = v_head.id) then
      perform private.stale('This sales order');
    end if;
  elsif v_void then
    raise exception 'A void must name the order it voids (supersedes_id)' using errcode = '22023';
  end if;

  if v_void then
    if v_head.voided then
      return v_head.id;
    end if;
    v_new := v_head;
    v_bands := private.order_bands(v_head.id);
  else
    v_new.channel := private.payload_text(payload, 'channel');
    v_new.order_date := private.payload_text(payload, 'order_date')::date;
    v_new.bird_count := private.payload_text(payload, 'bird_count')::integer;
    v_new.avg_live_weight_g := private.payload_text(payload, 'avg_live_weight_g')::integer;
    v_new.avg_dressed_weight_g := private.payload_text(payload, 'avg_dressed_weight_g')::integer;
    v_new.pricing_basis := private.payload_text(payload, 'pricing_basis');
    v_new.price_cents_per_bird := private.payload_cents(payload, 'price_cents_per_bird');
    v_new.price_cents_per_kg := private.payload_cents(payload, 'price_cents_per_kg');
    v_new.terms_days := private.payload_text(payload, 'terms_days')::smallint;
    select coalesce(jsonb_agg(jsonb_build_object(
             'dressed_floor_g', private.payload_text(b, 'dressed_floor_g')::integer,
             'price_cents_per_bird', private.payload_cents(b, 'price_cents_per_bird')::text)
             order by private.payload_text(b, 'dressed_floor_g')::integer), '[]'::jsonb)
      into v_bands
      from jsonb_array_elements(private.payload_array(payload, 'bands')) b;

    if v_head.id is not null and not v_head.voided
       and v_head.channel = v_new.channel and v_head.order_date = v_new.order_date
       and v_head.bird_count = v_new.bird_count and v_head.avg_live_weight_g = v_new.avg_live_weight_g
       and v_head.avg_dressed_weight_g is not distinct from v_new.avg_dressed_weight_g
       and v_head.pricing_basis = v_new.pricing_basis
       and v_head.price_cents_per_bird is not distinct from v_new.price_cents_per_bird
       and v_head.price_cents_per_kg is not distinct from v_new.price_cents_per_kg
       and v_head.terms_days = v_new.terms_days
       and private.order_bands(v_head.id) = v_bands then
      return v_head.id;
    end if;
  end if;

  insert into facts.sales_order_versions (
    org_id, batch_id, channel, order_date, bird_count, avg_live_weight_g, avg_dressed_weight_g, pricing_basis,
    price_cents_per_bird, price_cents_per_kg, terms_days, supersedes_id, voided, client_request_id, created_by
  ) values (
    v_org, v_batch, v_new.channel, v_new.order_date, v_new.bird_count, v_new.avg_live_weight_g, v_new.avg_dressed_weight_g,
    v_new.pricing_basis, v_new.price_cents_per_bird, v_new.price_cents_per_kg, v_new.terms_days,
    v_head.id, v_void, v_crid, v_uid
  ) returning id into v_id;

  insert into facts.sales_order_bands (org_id, sales_order_version_id, dressed_floor_g, price_cents_per_bird, created_by)
  select v_org, v_id, (b ->> 'dressed_floor_g')::integer, (b ->> 'price_cents_per_bird')::bigint, v_uid
    from jsonb_array_elements(v_bands) b;

  return v_id;
end;
$$;

-- record_cash_account: create an account with its opening balance (org_id
-- given), or correct the opening (account_id given). OWNER only (settings).
create function public.record_cash_account(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_crid uuid := private.payload_text(payload, 'client_request_id')::uuid;
  v_account uuid := (payload ->> 'account_id')::uuid;
  v_org uuid;
  v_existing facts.cash_account_opening_versions;
  v_head facts.cash_account_opening_versions;
  v_date date := private.payload_text(payload, 'opening_date')::date;
  v_balance bigint := private.payload_cents(payload, 'opening_balance_cents');
begin
  if v_account is null then
    v_org := private.payload_text(payload, 'org_id')::uuid;
  else
    select a.org_id into v_org from facts.cash_accounts a where a.id = v_account;
  end if;
  if v_org is null or not private.has_role(v_org, array['OWNER']) then
    perform private.deny();
  end if;

  select * into v_existing from facts.cash_account_opening_versions where client_request_id = v_crid;
  if found then
    if v_existing.org_id <> v_org then
      perform private.deny();
    end if;
    return v_existing.account_id;
  end if;

  if v_account is null then
    insert into facts.cash_accounts (org_id, name, created_by)
    values (v_org, private.payload_text(payload, 'name'), v_uid)
    returning id into v_account;
    insert into facts.cash_account_opening_versions (org_id, account_id, opening_date, opening_balance_cents, client_request_id, created_by)
    values (v_org, v_account, v_date, v_balance, v_crid, v_uid);
    return v_account;
  end if;

  select v.* into v_head from facts.cash_account_opening_versions v
   where v.account_id = v_account
     and not exists (select 1 from facts.cash_account_opening_versions s where s.supersedes_id = v.id);
  if v_head.id is distinct from (payload ->> 'supersedes_id')::uuid then
    perform private.stale('This opening balance');
  end if;
  if v_head.opening_date = v_date and v_head.opening_balance_cents = v_balance then
    return v_account;
  end if;
  insert into facts.cash_account_opening_versions (
    org_id, account_id, opening_date, opening_balance_cents, supersedes_id, client_request_id, created_by
  ) values (v_org, v_account, v_date, v_balance, v_head.id, v_crid, v_uid);
  return v_account;
end;
$$;

-- record_cash_transaction: new, correction or void. OWNER, MANAGER.
create function public.record_cash_transaction(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_account uuid := private.payload_text(payload, 'account_id')::uuid;
  v_org uuid;
  v_crid uuid := private.payload_text(payload, 'client_request_id')::uuid;
  v_supersedes uuid := (payload ->> 'supersedes_id')::uuid;
  v_void boolean := coalesce((payload ->> 'voided')::boolean, false);
  v_head facts.cash_transaction_versions;
  v_new facts.cash_transaction_versions;
  v_id uuid;
begin
  select a.org_id into v_org from facts.cash_accounts a where a.id = v_account;
  if v_org is null or not private.has_role(v_org, array['OWNER', 'MANAGER']) then
    perform private.deny();
  end if;

  select id into v_id from facts.cash_transaction_versions where client_request_id = v_crid and account_id = v_account;
  if found then
    return v_id;
  end if;

  if v_supersedes is not null then
    select v.* into v_head from facts.cash_transaction_versions v where v.id = v_supersedes and v.account_id = v_account;
    if not found then
      perform private.deny();
    end if;
    if exists (select 1 from facts.cash_transaction_versions s where s.supersedes_id = v_head.id) then
      perform private.stale('This transaction');
    end if;
  elsif v_void then
    raise exception 'A void must name the transaction it voids (supersedes_id)' using errcode = '22023';
  end if;

  if v_void then
    if v_head.voided then
      return v_head.id;
    end if;
    v_new := v_head;
  else
    v_new.txn_date := private.payload_text(payload, 'txn_date')::date;
    v_new.direction := private.payload_text(payload, 'direction');
    v_new.amount_cents := private.payload_cents(payload, 'amount_cents');
    v_new.category := private.payload_text(payload, 'category');
    v_new.batch_id := private.payload_text(payload, 'batch_id')::uuid;
    if v_new.batch_id is not null and private.batch_org(v_new.batch_id) is distinct from v_org then
      perform private.deny();
    end if;
    if v_head.id is not null and not v_head.voided
       and v_head.txn_date = v_new.txn_date and v_head.direction = v_new.direction
       and v_head.amount_cents = v_new.amount_cents and v_head.category = v_new.category
       and v_head.batch_id is not distinct from v_new.batch_id then
      return v_head.id;
    end if;
  end if;

  insert into facts.cash_transaction_versions (
    org_id, account_id, txn_date, direction, amount_cents, category, batch_id, supersedes_id, voided, client_request_id, created_by
  ) values (
    v_org, v_account, v_new.txn_date, v_new.direction, v_new.amount_cents, v_new.category, v_new.batch_id,
    v_head.id, v_void, v_crid, v_uid
  ) returning id into v_id;
  return v_id;
end;
$$;

-- AD-87: what a WORKER needs to capture, and no money column to leak.
create function public.capture_batches()
returns table (batch_id uuid, code text, placement_date date, chick_count integer, extra_chick_count integer)
language sql stable security definer set search_path = '' as $$
  select b.id, b.code, p.placement_date, p.chick_count, p.extra_chick_count
    from facts.batches b
    cross join lateral private.current_placement(b.id) p
   where p.id is not null
     and private.has_role(b.org_id, array['OWNER', 'MANAGER', 'WORKER'])
     and not exists (
       select 1 from facts.batch_closure_versions c
        where c.batch_id = b.id and not c.voided
          and not exists (select 1 from facts.batch_closure_versions s where s.supersedes_id = c.id))
   order by p.placement_date, b.code;
$$;

-- AD-89 grants sweep, over every object in the three schemas. Clients get no
-- INSERT, UPDATE or DELETE anywhere; reads are SELECT through RLS; writes are
-- EXECUTE on the functions above.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema facts from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant select on public.organizations, public.parameter_sets, public.overhead_lines, public.planning_bulk_bands,
  public.feed_prices, public.breed_curves, public.breed_curve_points, public.breed_curve_phases to authenticated;
grant select on public.batches, public.daily_records, public.feed_draws, public.sales_orders, public.cash_accounts,
  public.cash_transactions, public.batches_history, public.batch_closures_history, public.daily_records_history,
  public.feed_draws_history, public.sales_orders_history, public.cash_accounts_history,
  public.cash_transactions_history to authenticated;
-- The security_invoker views read facts as the caller; RLS limits the rows.
grant select on all tables in schema facts to authenticated;

-- Called by RLS policies and invoker views, so the caller needs EXECUTE.
grant execute on function private.has_role(uuid, text[]) to authenticated;
grant execute on function private.order_bands(uuid) to authenticated;

grant execute on function public.my_memberships(), public.capture_batches(),
  public.create_parameter_set(jsonb), public.create_breed_curve(jsonb),
  public.record_batch(jsonb), public.record_batch_placement(jsonb), public.record_batch_closure(jsonb),
  public.record_daily_records(uuid, jsonb), public.record_feed_draw(jsonb), public.record_sales_order(jsonb),
  public.record_cash_account(jsonb), public.record_cash_transaction(jsonb) to authenticated;

-- Service role: seed and tests insert directly (AD-88); memberships are service-role only in U6 (AD-85).
grant select, insert on all tables in schema facts to service_role;
grant select, insert on all tables in schema public to service_role;
grant select, insert, delete on private.memberships to service_role;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema private to service_role;
