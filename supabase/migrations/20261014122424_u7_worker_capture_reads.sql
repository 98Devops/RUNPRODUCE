-- U7 chunk 3 · What a WORKER reads to capture (D18, AD-101; amends AD-86's
-- third default and AD-87).
--
-- - capture_batches() also returns breed_curve_id. The curve is pinned by the
--   batch (U6 D11), and a WORKER cannot read facts.batches, whose view joins
--   the placement's chick price (U6 D22). Same rows, same role check, still no
--   money column. Its return type changes, so it is dropped and recreated, and
--   its grant and AD-89 comment are applied again.
-- - breed_curve_points is readable by OWNER, MANAGER and WORKER. It holds day,
--   weight, feed grams and phase: no money, so the whole-table rule allows it.
--   It is all capture needs: each point carries the day's standard feed and
--   phase. breed_curves, breed_curve_phases and the parameter tables stay
--   OWNER and MANAGER.
--
-- Local only until U7 chunk 5's dev window (D17).

drop function public.capture_batches();

create function public.capture_batches()
returns table (batch_id uuid, code text, placement_date date, chick_count integer, extra_chick_count integer,
               breed_curve_id uuid)
language sql stable security definer set search_path = '' as $$
  select b.id, b.code, p.placement_date, p.chick_count, p.extra_chick_count, b.breed_curve_id
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

revoke execute on function public.capture_batches() from public, anon;
grant execute on function public.capture_batches() to authenticated, service_role;

comment on function public.capture_batches() is
  'Intended: authenticated may EXECUTE this SECURITY DEFINER function (AD-88, AD-89).
Tables carry no client write grant; these RPCs are the client path, and each checks the caller''s membership and role.';

drop policy breed_curve_points_owner_manager_read on public.breed_curve_points;
create policy breed_curve_points_member_read on public.breed_curve_points
  for select to authenticated
  using (private.has_role(org_id, array['OWNER', 'MANAGER', 'WORKER']));
