-- U8 chunk 5, dev window A step 3: test data for the branch deploy check
-- (u8-start-batch.md, "Branch deploy check on dev"). DEV ONLY (zlvjmaorlxrjnuxhykuh).
-- Not a migration: it is run once, by hand, in the write window the user
-- approves, after D7's migration, and removed by u8-step2-cleanup.sql.
--
-- Prerequisite: the user has created exactly TWO Auth users in the dev dashboard,
--   u8-check-manager@runproduce.test     (.test never delivers mail)
--   u8-check-worker@runproduce.test
--   "Auto Confirm User" ticked on both. The user types the passwords.
-- This file refuses to run unless exactly those two users exist.
--
-- What it creates, every row tied to one fixed organisation id so cleanup can
-- name it exactly:
--   1 organisation      "U8 step 2 check — delete after"
--   2 memberships       the manager as MANAGER, the worker as WORKER
--   1 breed curve       the engine's SEED_BREED_CURVE: 3 phase ranges, 41 points
-- NO batch: the Start batch form makes it (check 4), as Daniel would.
-- No parameter set: Start batch and Today read none. No OWNER.
--
-- created_by is null on every row, as on seed rows: no member made them.

begin;

do $$
declare
  v_org     constant uuid := 'c8000000-0000-4000-8000-000000000001';
  v_curve   constant uuid := 'c8000000-0000-4000-8000-000000000002';
  v_manager uuid;
  v_worker  uuid;
  v_users   integer;
begin
  -- Dev only: the host's own database name is not enough, so check the data.
  if exists (select 1 from public.organizations) then
    raise exception 'Refusing: dev already has an organisation. This file expects an empty dev.';
  end if;

  select count(*) into v_users from auth.users;
  if v_users <> 2 then
    raise exception 'Refusing: expected exactly two Auth users (the check MANAGER and WORKER), found %', v_users;
  end if;
  select id into strict v_manager from auth.users where email = 'u8-check-manager@runproduce.test';
  select id into strict v_worker  from auth.users where email = 'u8-check-worker@runproduce.test';

  -- D7 must already be on dev: the form's guards are what the check exercises.
  if not exists (select 1 from pg_constraint where conname = 'batches_code_shape') then
    raise exception 'Refusing: D7''s migration (batches_code_shape) is not applied. Apply it first (window A step 2).';
  end if;

  insert into public.organizations (id, name) values (v_org, 'U8 step 2 check — delete after');
  insert into private.memberships (org_id, user_id, role) values (v_org, v_manager, 'MANAGER'), (v_org, v_worker, 'WORKER');

  insert into public.breed_curves (id, org_id, name, source)
  values (v_curve, v_org, 'U8 step 2 check curve',
          'RUNproduce_Broiler_Management_.xlsx / Record sheet, columns G and K');

  insert into public.breed_curve_phases (org_id, curve_id, phase, first_day, last_day)
  values (v_org, v_curve, 'STARTER', 1, 13), (v_org, v_curve, 'GROWER', 14, 27), (v_org, v_curve, 'FINISHER', 28, 41);

  insert into public.breed_curve_points (org_id, curve_id, day_number, weight_g, feed_g, phase)
  select v_org, v_curve, p.day_number, p.weight_g, p.feed_g, p.phase
    from (values
      (1, 57, 10, 'STARTER'), (2, 73, 20, 'STARTER'), (3, 86, 20, 'STARTER'), (4, 109, 20, 'STARTER'), (5, 131, 20, 'STARTER'), (6, 155, 20, 'STARTER'),
      (7, 182, 20, 'STARTER'), (8, 212, 30, 'STARTER'), (9, 320, 35, 'STARTER'), (10, 362, 39, 'STARTER'), (11, 407, 44, 'STARTER'), (12, 455, 50, 'STARTER'),
      (13, 506, 55, 'STARTER'), (14, 561, 61, 'GROWER'), (15, 618, 67, 'GROWER'), (16, 678, 73, 'GROWER'), (17, 741, 80, 'GROWER'), (18, 806, 86, 'GROWER'),
      (19, 874, 93, 'GROWER'), (20, 944, 100, 'GROWER'), (21, 1017, 107, 'GROWER'), (22, 1093, 115, 'GROWER'), (23, 1170, 122, 'GROWER'), (24, 1249, 130, 'GROWER'),
      (25, 1329, 137, 'GROWER'), (26, 1412, 144, 'GROWER'), (27, 1496, 151, 'GROWER'), (28, 1581, 157, 'FINISHER'), (29, 1667, 163, 'FINISHER'), (30, 1754, 168, 'FINISHER'),
      (31, 1843, 172, 'FINISHER'), (32, 1932, 176, 'FINISHER'), (33, 2021, 180, 'FINISHER'), (34, 2111, 184, 'FINISHER'), (35, 2201, 187, 'FINISHER'), (36, 2291, 190, 'FINISHER'),
      (37, 2382, 192, 'FINISHER'), (38, 2472, 195, 'FINISHER'), (39, 2562, 197, 'FINISHER'), (40, 2789, 198, 'FINISHER'), (41, 2875, 200, 'FINISHER')
    ) as p (day_number, weight_g, feed_g, phase);
end;
$$;

-- What was made, for the window's record. Batches must be 0: the form makes the first.
select (select count(*) from public.organizations where id = 'c8000000-0000-4000-8000-000000000001') as orgs,
       (select string_agg(role::text, ', ' order by role) from private.memberships where org_id = 'c8000000-0000-4000-8000-000000000001') as memberships,
       (select count(*) from public.breed_curve_points where org_id = 'c8000000-0000-4000-8000-000000000001') as curve_points,
       (select count(*) from facts.batches where org_id = 'c8000000-0000-4000-8000-000000000001') as batches,
       ((now() at time zone 'Africa/Harare')::date)::text as farm_today;

commit;
