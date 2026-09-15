-- U6 migration 1 of 5 · Schemas, grants baseline, organisations, memberships.
-- Decisions: AD-81 (facts schema), AD-85 (memberships, has_role), AD-89 (grants).
-- The full grant sweep runs again at the end of migration 5, over every object.

create schema facts;
create schema private;
revoke all on schema facts from public;
revoke all on schema private from public;
grant usage on schema facts to authenticated, service_role;
grant usage on schema private to authenticated, service_role;

-- AD-89: Supabase's default grants to anon/authenticated, and Postgres's
-- default EXECUTE to PUBLIC, are revoked for everything created from here on.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;

-- Immutability (AD-70, AD-75): parameter and fact rows are never updated or
-- deleted, by anyone, including the service role.
create function private.refuse_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only: rows are never updated or deleted', tg_table_schema || '.' || tg_table_name
    using errcode = '23514';
end;
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.organizations enable row level security;

create table private.memberships (
  org_id uuid not null references public.organizations (id),
  user_id uuid not null references auth.users (id),
  role text not null constraint memberships_role_values check (role in ('OWNER', 'MANAGER', 'WORKER')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_org on private.memberships (user_id, org_id);
alter table private.memberships enable row level security;

-- AD-85: the one place a role rule is answered. SECURITY DEFINER so policies
-- need no read access to memberships (and cannot recurse through it).
create function private.has_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from private.memberships m
     where m.org_id = p_org
       and m.user_id = (select auth.uid())
       and m.role = any (p_roles)
  );
$$;

-- AD-88: no session, no write. One refusal for "not permitted" and "not found".
create function private.require_uid() returns uuid
language plpgsql stable set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create function private.deny() returns void
language plpgsql set search_path = '' as $$
begin
  raise exception 'not permitted' using errcode = '42501';
end;
$$;

-- Payload readers. A key the function needs must be PRESENT, even when its
-- value is null: "absent" never silently means null (D5's spirit). Money must
-- arrive as an integer string (AD-91); a JSON number is refused, not coerced.
create function private.payload_text(p jsonb, k text) returns text
language plpgsql immutable set search_path = '' as $$
begin
  if p is null or jsonb_typeof(p) <> 'object' or not (p ? k) then
    raise exception 'payload is missing "%"', k using errcode = '22023';
  end if;
  return p ->> k;
end;
$$;

create function private.payload_cents(p jsonb, k text) returns bigint
language plpgsql immutable set search_path = '' as $$
declare
  v text := private.payload_text(p, k);
begin
  if jsonb_typeof(p -> k) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p -> k) <> 'string' or v !~ '^-?[0-9]+$' then
    raise exception '"%": money must be sent as an integer string, got %', k, p -> k using errcode = '22023';
  end if;
  return v::bigint;
end;
$$;

create function private.payload_array(p jsonb, k text) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
  perform private.payload_text(p, k);
  if jsonb_typeof(p -> k) <> 'array' then
    raise exception '"%" must be an array', k using errcode = '22023';
  end if;
  return p -> k;
end;
$$;

create policy organizations_members_read on public.organizations
  for select to authenticated
  using (private.has_role(id, array['OWNER', 'MANAGER', 'WORKER']));

-- Navigation only: which organisations and roles the caller has. Never
-- authorisation (AD-85).
create function public.my_memberships() returns table (org_id uuid, org_name text, role text)
language sql stable security definer set search_path = '' as $$
  select m.org_id, o.name, m.role
    from private.memberships m
    join public.organizations o on o.id = m.org_id
   where m.user_id = (select auth.uid())
   order by o.name;
$$;
