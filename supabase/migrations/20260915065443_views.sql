-- U6 migration 4 of 5 · Views of current rows and of history (AD-75).
-- All security_invoker, so RLS on the facts tables decides what each role sees.
-- Repositories read these; nothing outside a migration names facts.* (T-DB1).

create view public.batches with (security_invoker = true) as
select b.id, b.org_id, b.code, b.breed_curve_id, b.created_at, b.created_by,
       p.id as placement_version_id, p.placement_date, p.chick_count, p.extra_chick_count, p.chick_price_cents,
       c.id as closure_version_id, c.closed_on
  from facts.batches b
  join lateral (
    select v.* from facts.batch_placement_versions v
     where v.batch_id = b.id and not v.voided
       and not exists (select 1 from facts.batch_placement_versions s where s.supersedes_id = v.id)
  ) p on true
  left join lateral (
    select v.* from facts.batch_closure_versions v
     where v.batch_id = b.id and not v.voided
       and not exists (select 1 from facts.batch_closure_versions s where s.supersedes_id = v.id)
  ) c on true;

create view public.daily_records with (security_invoker = true) as
select v.id, v.org_id, v.batch_id, v.record_date, v.mortality_cumulative, v.cull_cumulative,
       v.feed_starter_g, v.feed_grower_g, v.feed_finisher_g, v.avg_weight_g, v.weight_sample_size, v.notes,
       v.created_at, v.created_by
  from facts.daily_record_versions v
 where not v.voided
   and not exists (select 1 from facts.daily_record_versions s where s.supersedes_id = v.id);

create view public.feed_draws with (security_invoker = true) as
select v.id, v.org_id, v.batch_id, v.collection_date, v.phase, v.bags, v.feed_g, v.price_per_bag_cents,
       v.terms_days, v.reference, v.due_date, v.created_at, v.created_by
  from facts.feed_draw_versions v
 where not v.voided
   and not exists (select 1 from facts.feed_draw_versions s where s.supersedes_id = v.id);

-- AD-91: band prices travel as text inside the jsonb, never as a JSON number.
create function private.order_bands(p_version uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('dressed_floor_g', b.dressed_floor_g,
                                 'price_cents_per_bird', b.price_cents_per_bird::text)
              order by b.dressed_floor_g),
    '[]'::jsonb)
    from facts.sales_order_bands b
   where b.sales_order_version_id = p_version;
$$;

create view public.sales_orders with (security_invoker = true) as
select v.id, v.org_id, v.batch_id, v.channel, v.order_date, v.bird_count, v.avg_live_weight_g,
       v.avg_dressed_weight_g, v.pricing_basis, v.price_cents_per_bird, v.price_cents_per_kg, v.terms_days,
       private.order_bands(v.id) as bands, v.created_at, v.created_by
  from facts.sales_order_versions v
 where not v.voided
   and not exists (select 1 from facts.sales_order_versions s where s.supersedes_id = v.id);

create view public.cash_accounts with (security_invoker = true) as
select a.id, a.org_id, a.name, o.id as opening_version_id, o.opening_date, o.opening_balance_cents,
       a.created_at, a.created_by
  from facts.cash_accounts a
  join lateral (
    select v.* from facts.cash_account_opening_versions v
     where v.account_id = a.id and not v.voided
       and not exists (select 1 from facts.cash_account_opening_versions s where s.supersedes_id = v.id)
  ) o on true;

create view public.cash_transactions with (security_invoker = true) as
select v.id, v.org_id, v.account_id, v.txn_date, v.direction, v.amount_cents, v.category, v.batch_id,
       v.created_at, v.created_by
  from facts.cash_transaction_versions v
 where not v.voided
   and not exists (select 1 from facts.cash_transaction_versions s where s.supersedes_id = v.id);

-- History: every version, with is_current and superseded_at ("corrected on …, was …").
create view public.batches_history with (security_invoker = true) as
select v.*, b.code,
       (not v.voided and s.id is null) as is_current, s.created_at as superseded_at
  from facts.batch_placement_versions v
  join facts.batches b on b.id = v.batch_id
  left join facts.batch_placement_versions s on s.supersedes_id = v.id;

create view public.batch_closures_history with (security_invoker = true) as
select v.*, (not v.voided and s.id is null) as is_current, s.created_at as superseded_at
  from facts.batch_closure_versions v
  left join facts.batch_closure_versions s on s.supersedes_id = v.id;

create view public.daily_records_history with (security_invoker = true) as
select v.*, (not v.voided and s.id is null) as is_current, s.created_at as superseded_at
  from facts.daily_record_versions v
  left join facts.daily_record_versions s on s.supersedes_id = v.id;

create view public.feed_draws_history with (security_invoker = true) as
select v.*, (not v.voided and s.id is null) as is_current, s.created_at as superseded_at
  from facts.feed_draw_versions v
  left join facts.feed_draw_versions s on s.supersedes_id = v.id;

create view public.sales_orders_history with (security_invoker = true) as
select v.*, private.order_bands(v.id) as bands,
       (not v.voided and s.id is null) as is_current, s.created_at as superseded_at
  from facts.sales_order_versions v
  left join facts.sales_order_versions s on s.supersedes_id = v.id;

create view public.cash_accounts_history with (security_invoker = true) as
select v.*, (not v.voided and s.id is null) as is_current, s.created_at as superseded_at
  from facts.cash_account_opening_versions v
  left join facts.cash_account_opening_versions s on s.supersedes_id = v.id;

create view public.cash_transactions_history with (security_invoker = true) as
select v.*, (not v.voided and s.id is null) as is_current, s.created_at as superseded_at
  from facts.cash_transaction_versions v
  left join facts.cash_transaction_versions s on s.supersedes_id = v.id;
