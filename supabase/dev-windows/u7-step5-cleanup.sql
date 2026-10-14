-- DEV ONLY. Never run against production. Switching off the immutability guards
-- is permitted only for named test data on dev.
--
-- U7 chunk 5: removes everything u7-step5-setup.sql made, and everything the
-- branch deploy check wrote, from DEV (zlvjmaorlxrjnuxhykuh). Run once, by hand,
-- in a second write window the user approves, after the check.
--
-- Facts and curves are append-only (AD-70, AD-75): a BEFORE UPDATE OR DELETE
-- trigger refuses every delete, for every role. Removing test data therefore
-- needs those triggers off. This file does it inside ONE transaction:
--   - ALTER TABLE ... DISABLE TRIGGER takes an ACCESS EXCLUSIVE lock, so no other
--     session can write to those tables while the trigger is off;
--   - every delete names the test organisation's fixed id, and nothing else;
--   - the triggers are enabled again before COMMIT;
--   - any error rolls the whole transaction back, the trigger changes included.
-- Only the tables' owner may disable a trigger, so it refuses to run as anyone
-- but postgres.

begin;

do $$
declare
  v_org constant uuid := 'c5000000-0000-4000-8000-000000000001';
begin
  if current_user <> 'postgres' then
    raise exception 'Refusing: run as postgres, the tables'' owner (running as %)', current_user;
  end if;
  if not exists (select 1 from public.organizations where id = v_org) then
    raise exception 'Refusing: the test organisation % is not here', v_org;
  end if;
  -- Only ever this one organisation on dev: anything else means this is not the dev we set up.
  if exists (select 1 from public.organizations where id <> v_org) then
    raise exception 'Refusing: dev holds an organisation other than the test one';
  end if;
  -- The check writes daily records only. Anything else is unexpected: stop and look.
  if exists (select 1 from facts.feed_draw_versions where org_id = v_org)
     or exists (select 1 from facts.sales_order_versions where org_id = v_org)
     or exists (select 1 from facts.batch_closure_versions where org_id = v_org)
     or exists (select 1 from facts.cash_accounts where org_id = v_org)
     or exists (select 1 from public.parameter_sets where org_id = v_org) then
    raise exception 'Refusing: the test organisation has rows this cleanup does not expect';
  end if;
end;
$$;

alter table facts.daily_record_versions disable trigger daily_record_versions_immutable;
alter table facts.batch_placement_versions disable trigger batch_placement_versions_immutable;
alter table facts.batches disable trigger batches_immutable;
alter table public.breed_curve_points disable trigger breed_curve_points_immutable;
alter table public.breed_curve_phases disable trigger breed_curve_phases_immutable;
alter table public.breed_curves disable trigger breed_curves_immutable;

-- Children first. Each table's rows go in one statement, so a correction chain's
-- self-reference is checked only once the whole chain is gone.
delete from facts.daily_record_versions   where org_id = 'c5000000-0000-4000-8000-000000000001';
delete from facts.batch_placement_versions where org_id = 'c5000000-0000-4000-8000-000000000001';
delete from facts.batches                  where org_id = 'c5000000-0000-4000-8000-000000000001';
delete from public.breed_curve_points      where org_id = 'c5000000-0000-4000-8000-000000000001';
delete from public.breed_curve_phases      where org_id = 'c5000000-0000-4000-8000-000000000001';
delete from public.breed_curves            where org_id = 'c5000000-0000-4000-8000-000000000001';
delete from private.memberships            where org_id = 'c5000000-0000-4000-8000-000000000001';
delete from public.organizations           where id     = 'c5000000-0000-4000-8000-000000000001';

alter table facts.daily_record_versions enable trigger daily_record_versions_immutable;
alter table facts.batch_placement_versions enable trigger batch_placement_versions_immutable;
alter table facts.batches enable trigger batches_immutable;
alter table public.breed_curve_points enable trigger breed_curve_points_immutable;
alter table public.breed_curve_phases enable trigger breed_curve_phases_immutable;
alter table public.breed_curves enable trigger breed_curves_immutable;

-- The check user last: nothing may still name it as created_by. Its identities,
-- sessions and refresh tokens go with it (Supabase's own cascades).
delete from auth.users where email = 'u7-check-worker@runproduce.test';

commit;
