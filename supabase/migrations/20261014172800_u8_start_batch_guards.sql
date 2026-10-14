-- U8 chunk 3 · Start batch's guards in the database (u8-start-batch.md D7, AD-105).
--
-- - facts.batches.code has a shape: no surrounding spaces, 1 to 24 characters.
--   The code is the batch's name in the URL, the picker and every page, and the
--   identity row is immutable, so a blank or padded code could never be fixed.
--   The friendlier character rule (letters, digits, spaces, hyphens) is the
--   form's; this is the floor the URL needs.
-- - record_batch and record_batch_placement refuse a placement date after the
--   farm's today. A future placement makes Today's day number throw
--   (dayNumberFor), and the anon key is public, so the form is not the guard.
--   The zone is the web's FARM_TIME_ZONE (U7 D28): one farm, one zone, until a
--   second farm needs a column.
--
-- Both functions are replaced with the same signatures; everything else in them
-- is exactly migration 5's. EXECUTE and the AD-89 comment are kept by
-- create or replace, and stated again below so this file reads whole.
--
-- Local placeholder version: renamed to the version dev stamps when the user's
-- dev window applies it (as U7's three were).

alter table facts.batches
  add constraint batches_code_shape check (code = btrim(code) and length(code) between 1 and 24);

-- record_batch: identity + first placement, one transaction. OWNER, MANAGER.
create or replace function public.record_batch(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_org uuid := private.payload_text(payload, 'org_id')::uuid;
  v_crid uuid := private.payload_text(payload, 'client_request_id')::uuid;
  v_curve uuid := private.payload_text(payload, 'breed_curve_id')::uuid;
  v_date date := private.payload_text(payload, 'placement_date')::date;
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

  -- D7: the farm's today, in the web's FARM_TIME_ZONE.
  if v_date > (now() at time zone 'Africa/Harare')::date then
    raise exception 'Placement date % is after the farm''s today', v_date using errcode = '23514';
  end if;

  insert into facts.batches (org_id, code, breed_curve_id, created_by)
  values (v_org, private.payload_text(payload, 'code'), v_curve, v_uid)
  returning id into v_batch;

  insert into facts.batch_placement_versions (
    org_id, batch_id, placement_date, chick_count, extra_chick_count, chick_price_cents, client_request_id, created_by
  ) values (
    v_org, v_batch,
    v_date,
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
create or replace function public.record_batch_placement(payload jsonb) returns uuid
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

  -- D7: the farm's today, in the web's FARM_TIME_ZONE.
  if v_date > (now() at time zone 'Africa/Harare')::date then
    raise exception 'Placement date % is after the farm''s today', v_date using errcode = '23514';
  end if;

  insert into facts.batch_placement_versions (
    org_id, batch_id, placement_date, chick_count, extra_chick_count, chick_price_cents,
    supersedes_id, client_request_id, created_by
  ) values (v_org, v_batch, v_date, v_count, v_extra, v_price, v_head.id, v_crid, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.record_batch(jsonb), public.record_batch_placement(jsonb) from public, anon;
grant execute on function public.record_batch(jsonb), public.record_batch_placement(jsonb) to authenticated, service_role;

comment on function public.record_batch(jsonb) is
  'Intended: authenticated may EXECUTE this SECURITY DEFINER function (AD-88, AD-89).
Tables carry no client write grant; these RPCs are the client path, and each checks the caller''s membership and role.';
comment on function public.record_batch_placement(jsonb) is
  'Intended: authenticated may EXECUTE this SECURITY DEFINER function (AD-88, AD-89).
Tables carry no client write grant; these RPCs are the client path, and each checks the caller''s membership and role.';
