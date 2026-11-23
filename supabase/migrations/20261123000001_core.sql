-- =====================================================================
-- Daawati core schema: multi-tenant workspaces, events, guests, RSVP.
-- Security model:
--   * Every table has RLS enabled. Access is derived from workspace_members.
--   * Guest rows are written ONLY through SECURITY DEFINER RPCs that re-check
--     permissions, enforce plan limits and write the audit trail.
--   * Invitation tokens are never stored: only sha256(token) is kept.
--   * Phone numbers and token hashes are hidden from plain SELECT via column
--     grants; editors read phones through guest_phones().
-- =====================================================================

create type public.member_role as enum ('owner', 'organizer', 'viewer');
create type public.event_status as enum ('draft', 'published', 'archived', 'cancelled');
create type public.send_status as enum ('not_started', 'opened', 'sent');
create type public.rsvp_status as enum ('pending', 'attending', 'declined');
create type public.response_source as enum ('guest', 'organizer');

-- ---------------------------------------------------------------------
-- Plans (editable by platform admins). null limit = unlimited.
-- ---------------------------------------------------------------------
create table public.plans (
  id text primary key check (id ~ '^[a-z0-9_-]{2,32}$'),
  name text not null,
  max_active_events int check (max_active_events is null or max_active_events >= 0),
  max_guests_per_event int check (max_guests_per_event is null or max_guests_per_event >= 0),
  max_members int check (max_members is null or max_members >= 1),
  price_label text,
  is_default boolean not null default false,
  is_public boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create unique index plans_one_default on public.plans (is_default) where is_default;

insert into public.plans (id, name, max_active_events, max_guests_per_event, max_members, price_label, is_default, sort) values
  ('free', 'مجاني', 3, 300, 3, 'مجانًا', true, 0),
  ('pro', 'احترافي', 25, 2000, 10, 'قريبًا', false, 1),
  ('org', 'جهات', null, 10000, 50, 'قريبًا', false, 2);

-- ---------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 80),
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Platform admins can only be added from SQL / service role (no RLS policy permits writes).
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Workspaces & membership
-- ---------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  owner_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null references public.plans (id) default 'free',
  is_suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspaces_owner_idx on public.workspaces (owner_id);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  all_events boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.member_role not null check (role <> 'owner'),
  all_events boolean not null default true,
  event_ids uuid[] not null default '{}',
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index workspace_invitations_ws_idx on public.workspace_invitations (workspace_id);

-- Billing placeholder: no payment provider is wired in the MVP.
create table public.subscriptions (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'canceled')),
  provider text,
  provider_customer_ref text,
  provider_subscription_ref text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  kind text not null default 'other' check (kind in ('wedding', 'meeting', 'dinner', 'party', 'other')),
  starts_at timestamptz not null,
  timezone text not null default 'Asia/Riyadh' check (char_length(timezone) <= 64),
  location_url text check (location_url is null or (location_url ~ '^https://' and char_length(location_url) <= 600)),
  location_name text check (char_length(location_name) <= 160),
  location_address text check (char_length(location_address) <= 300),
  host_name text not null check (char_length(btrim(host_name)) between 1 and 100),
  description text check (char_length(description) <= 2000),
  cover_path text check (char_length(cover_path) <= 300),
  rsvp_deadline timestamptz,
  max_companions int not null default 0 check (max_companions between 0 and 20),
  capacity int check (capacity is null or capacity > 0),
  show_capacity boolean not null default false,
  allow_change boolean not null default true,
  status public.event_status not null default 'draft',
  template_key text not null default 'formal' check (template_key in ('formal', 'friendly', 'short', 'custom')),
  message_template text check (char_length(message_template) <= 1500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_ws_idx on public.events (workspace_id, starts_at desc);

create table public.member_event_access (
  workspace_id uuid not null,
  user_id uuid not null,
  event_id uuid not null references public.events (id) on delete cascade,
  primary key (user_id, event_id),
  foreign key (workspace_id, user_id) references public.workspace_members (workspace_id, user_id) on delete cascade
);
create index member_event_access_event_idx on public.member_event_access (event_id);

-- ---------------------------------------------------------------------
-- Address book & guests
-- ---------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  created_at timestamptz not null default now(),
  unique (workspace_id, phone_e164)
);

create table public.event_guests (
  id uuid primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_version int not null default 1,
  send_status public.send_status not null default 'not_started',
  open_count int not null default 0,
  last_opened_at timestamptz,
  sent_at timestamptz,
  sent_by uuid references auth.users (id) on delete set null,
  rsvp_status public.rsvp_status not null default 'pending',
  companions int not null default 0 check (companions between 0 and 20),
  responded_at timestamptz,
  response_source public.response_source,
  response_updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, phone_e164)
);
create index event_guests_event_idx on public.event_guests (event_id, created_at);

create table public.rsvp_audit (
  id bigint generated always as identity primary key,
  guest_id uuid not null references public.event_guests (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  old_status public.rsvp_status,
  new_status public.rsvp_status not null,
  old_companions int,
  new_companions int not null,
  source public.response_source not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index rsvp_audit_guest_idx on public.rsvp_audit (guest_id, created_at desc);

-- Internal: fixed-window rate limiting for public endpoints. No client access.
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);

-- =====================================================================
-- Helper functions (SECURITY DEFINER, pinned search_path)
-- =====================================================================
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.ws_role(p_ws uuid)
returns public.member_role language sql stable security definer set search_path = '' as $$
  select role from public.workspace_members where workspace_id = p_ws and user_id = auth.uid();
$$;

create or replace function public.is_ws_member(p_ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members where workspace_id = p_ws and user_id = auth.uid());
$$;

create or replace function public.can_view_event(p_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.events e
    join public.workspace_members m on m.workspace_id = e.workspace_id and m.user_id = auth.uid()
    where e.id = p_event
      and (m.role = 'owner' or m.all_events
           or exists (select 1 from public.member_event_access a where a.user_id = m.user_id and a.event_id = e.id))
  );
$$;

create or replace function public.can_view_ws_event(p_ws uuid, p_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_ws and m.user_id = auth.uid()
      and (m.role = 'owner' or m.all_events
           or exists (select 1 from public.member_event_access a where a.user_id = m.user_id and a.event_id = p_event))
  );
$$;

create or replace function public.can_edit_event(p_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.events e
    join public.workspaces w on w.id = e.workspace_id and not w.is_suspended
    join public.workspace_members m on m.workspace_id = e.workspace_id and m.user_id = auth.uid()
    where e.id = p_event
      and m.role in ('owner', 'organizer')
      and (m.role = 'owner' or m.all_events
           or exists (select 1 from public.member_event_access a where a.user_id = m.user_id and a.event_id = e.id))
  );
$$;

create or replace function public.can_edit_ws(p_ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id and not w.is_suspended
    where m.workspace_id = p_ws and m.user_id = auth.uid() and m.role in ('owner', 'organizer')
  );
$$;

create or replace function public.shares_workspace(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members a
    join public.workspace_members b on b.workspace_id = a.workspace_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

create or replace function public.hash_token(p_token text)
returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger workspaces_touch before update on public.workspaces for each row execute function public.touch_updated_at();
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();
create trigger event_guests_touch before update on public.event_guests for each row execute function public.touch_updated_at();

-- Internal rate limiter (returns false when the limit is exceeded).
create or replace function public.rl_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_limit;
end; $$;

-- =====================================================================
-- Signup bootstrap: profile + personal workspace + owner membership
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_name text;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  insert into public.profiles (id, full_name, email) values (new.id, left(v_name, 80), lower(new.email))
  on conflict (id) do nothing;
  insert into public.workspaces (name, owner_id, plan_id)
  values ('مساحتي', new.id, coalesce((select id from public.plans where is_default limit 1), 'free'))
  returning id into v_ws;
  insert into public.workspace_members (workspace_id, user_id, role, all_events) values (v_ws, new.id, 'owner', true);
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- =====================================================================
-- Integrity / anti-privilege-escalation triggers
-- =====================================================================
create or replace function public.guard_workspace_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_platform_admin() then
    if new.plan_id is distinct from old.plan_id
       or new.owner_id is distinct from old.owner_id
       or new.is_suspended is distinct from old.is_suspended then
      raise exception 'FORBIDDEN_FIELD' using errcode = '42501';
    end if;
  end if;
  return new;
end; $$;
create trigger workspaces_guard before update on public.workspaces for each row execute function public.guard_workspace_update();

create or replace function public.guard_event_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_plan public.plans; v_active int;
begin
  if tg_op = 'UPDATE' and new.workspace_id is distinct from old.workspace_id then
    raise exception 'FORBIDDEN_FIELD' using errcode = '42501';
  end if;
  if new.status in ('draft', 'published')
     and (tg_op = 'INSERT' or old.status not in ('draft', 'published')) then
    select p.* into v_plan from public.workspaces w join public.plans p on p.id = w.plan_id where w.id = new.workspace_id;
    if v_plan.max_active_events is not null then
      select count(*) into v_active from public.events
      where workspace_id = new.workspace_id and status in ('draft', 'published') and id <> new.id;
      if v_active >= v_plan.max_active_events then
        raise exception 'PLAN_LIMIT_EVENTS' using errcode = 'P0001';
      end if;
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  return new;
end; $$;
create trigger events_guard before insert or update on public.events for each row execute function public.guard_event_write();

-- A scoped organizer who creates an event automatically gets access to it.
create or replace function public.grant_creator_event_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.member_event_access (workspace_id, user_id, event_id)
  select m.workspace_id, m.user_id, new.id from public.workspace_members m
  where m.workspace_id = new.workspace_id and m.user_id = auth.uid() and not m.all_events and m.role <> 'owner'
  on conflict do nothing;
  return new;
end; $$;
create trigger events_creator_access after insert on public.events for each row execute function public.grant_creator_event_access();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.events enable row level security;
alter table public.member_event_access enable row level security;
alter table public.contacts enable row level security;
alter table public.event_guests enable row level security;
alter table public.rsvp_audit enable row level security;
alter table public.rate_limits enable row level security;

create policy plans_read on public.plans for select to authenticated using (true);

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_workspace(id) or public.is_platform_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy platform_admins_self on public.platform_admins for select to authenticated using (user_id = auth.uid());

create policy workspaces_read on public.workspaces for select to authenticated using (public.is_ws_member(id));
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.ws_role(id) = 'owner') with check (public.ws_role(id) = 'owner');
create policy workspaces_delete on public.workspaces for delete to authenticated using (owner_id = auth.uid());

create policy members_read on public.workspace_members for select to authenticated using (public.is_ws_member(workspace_id));
create policy members_update on public.workspace_members for update to authenticated
  using (public.ws_role(workspace_id) = 'owner' and user_id <> auth.uid())
  with check (public.ws_role(workspace_id) = 'owner' and user_id <> auth.uid() and role <> 'owner');
create policy members_delete on public.workspace_members for delete to authenticated
  using ((public.ws_role(workspace_id) = 'owner' and user_id <> auth.uid())
         or (user_id = auth.uid() and role <> 'owner'));

create policy invites_owner_all on public.workspace_invitations for all to authenticated
  using (public.ws_role(workspace_id) = 'owner')
  with check (public.ws_role(workspace_id) = 'owner' and role <> 'owner');

create policy subscriptions_read on public.subscriptions for select to authenticated using (public.is_ws_member(workspace_id));

-- Uses the row's own columns (not a lookup of the row), so INSERT ... RETURNING works.
create policy events_read on public.events for select to authenticated
  using (public.can_view_ws_event(workspace_id, id) or (created_by = auth.uid() and public.is_ws_member(workspace_id)));
create policy events_insert on public.events for insert to authenticated with check (public.can_edit_ws(workspace_id));
create policy events_update on public.events for update to authenticated
  using (public.can_edit_event(id)) with check (public.can_edit_ws(workspace_id));
create policy events_delete on public.events for delete to authenticated using (public.can_edit_event(id));

create policy mea_read on public.member_event_access for select to authenticated using (public.is_ws_member(workspace_id));
create policy mea_owner_write on public.member_event_access for all to authenticated
  using (public.ws_role(workspace_id) = 'owner')
  with check (public.ws_role(workspace_id) = 'owner'
              and exists (select 1 from public.events e where e.id = event_id and e.workspace_id = member_event_access.workspace_id));

create policy contacts_editor on public.contacts for all to authenticated
  using (public.can_edit_ws(workspace_id)) with check (public.can_edit_ws(workspace_id));

create policy guests_read on public.event_guests for select to authenticated using (public.can_view_event(event_id));
create policy guests_delete on public.event_guests for delete to authenticated using (public.can_edit_event(event_id));

create policy audit_read on public.rsvp_audit for select to authenticated using (public.can_view_event(event_id));

-- =====================================================================
-- Grants. Lock everything down first, then open what the app needs.
-- =====================================================================
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.plans to authenticated;
grant select, update (full_name) on public.profiles to authenticated;
grant select on public.platform_admins to authenticated;
grant select, delete on public.workspaces to authenticated;
grant update (name) on public.workspaces to authenticated;
grant select, delete on public.workspace_members to authenticated;
grant update (role, all_events) on public.workspace_members to authenticated;
grant select (id, workspace_id, email, role, all_events, event_ids, invited_by, expires_at, accepted_at, accepted_by, revoked_at, created_at),
      insert, delete on public.workspace_invitations to authenticated;
grant update (revoked_at) on public.workspace_invitations to authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, delete on public.member_event_access to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
-- NOTE: no phone_e164 / token_hash in the SELECT grant; no INSERT/UPDATE at all (RPC only).
grant select (id, event_id, workspace_id, contact_id, name, token_version, send_status, open_count, last_opened_at,
              sent_at, sent_by, rsvp_status, companions, responded_at, response_source, response_updated_by,
              created_at, updated_at),
      delete on public.event_guests to authenticated;
grant select on public.rsvp_audit to authenticated;

-- Stats view, evaluated with the caller's privileges/RLS.
create view public.event_stats with (security_invoker = true) as
select
  e.id as event_id,
  e.workspace_id,
  count(g.id)::int as total,
  count(g.id) filter (where g.rsvp_status = 'attending')::int as attending,
  count(g.id) filter (where g.rsvp_status = 'declined')::int as declined,
  count(g.id) filter (where g.rsvp_status = 'pending')::int as pending,
  count(g.id) filter (where g.send_status = 'not_started')::int as not_sent,
  count(g.id) filter (where g.send_status = 'opened')::int as opened,
  count(g.id) filter (where g.send_status = 'sent')::int as sent,
  coalesce(sum(case when g.rsvp_status = 'attending' then 1 + least(g.companions, e.max_companions) else 0 end), 0)::int as expected_people
from public.events e
left join public.event_guests g on g.event_id = e.id
group by e.id;
grant select on public.event_stats to authenticated;

revoke all on public.event_stats from anon;

-- =====================================================================
-- RPCs: organizer side
-- =====================================================================

-- Editors read phones explicitly (needed to build WhatsApp links).
create or replace function public.guest_phones(p_event uuid)
returns table (id uuid, phone_e164 text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_edit_event(p_event) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query select g.id, g.phone_e164 from public.event_guests g where g.event_id = p_event order by g.created_at;
end; $$;

-- Bulk add guests. p_rows: [{id, name, phone, token_hash, contact_id?}]
-- Duplicates (same phone in the event) are skipped and reported.
create or replace function public.add_guests(p_event uuid, p_rows jsonb, p_save_contacts boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid; v_limit int; v_count int; v_incoming int;
  v_inserted int := 0; v_skipped jsonb := '[]'::jsonb; r jsonb; v_contact uuid;
begin
  if not public.can_edit_event(p_event) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'BAD_INPUT'; end if;
  v_incoming := jsonb_array_length(p_rows);
  if v_incoming = 0 then return jsonb_build_object('inserted', 0, 'skipped', '[]'::jsonb); end if;
  if v_incoming > 5000 then raise exception 'TOO_MANY_ROWS'; end if;

  select e.workspace_id, p.max_guests_per_event into v_ws, v_limit
  from public.events e join public.workspaces w on w.id = e.workspace_id join public.plans p on p.id = w.plan_id
  where e.id = p_event;
  select count(*) into v_count from public.event_guests where event_id = p_event;

  for r in select * from jsonb_array_elements(p_rows) loop
    if exists (select 1 from public.event_guests where event_id = p_event and phone_e164 = r ->> 'phone') then
      v_skipped := v_skipped || jsonb_build_object('phone', r ->> 'phone', 'name', r ->> 'name', 'reason', 'duplicate');
      continue;
    end if;
    if v_limit is not null and v_count >= v_limit then
      v_skipped := v_skipped || jsonb_build_object('phone', r ->> 'phone', 'name', r ->> 'name', 'reason', 'plan_limit');
      continue;
    end if;
    v_contact := null;
    if p_save_contacts then
      insert into public.contacts (workspace_id, name, phone_e164)
      values (v_ws, btrim(r ->> 'name'), r ->> 'phone')
      on conflict (workspace_id, phone_e164) do update set name = excluded.name
      returning id into v_contact;
    elsif (r ->> 'contact_id') is not null then
      select id into v_contact from public.contacts where id = (r ->> 'contact_id')::uuid and workspace_id = v_ws;
    end if;
    insert into public.event_guests (id, event_id, workspace_id, contact_id, name, phone_e164, token_hash)
    values ((r ->> 'id')::uuid, p_event, v_ws, v_contact, btrim(r ->> 'name'), r ->> 'phone', r ->> 'token_hash');
    v_inserted := v_inserted + 1;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end; $$;

create or replace function public.update_guest(p_guest uuid, p_name text, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event uuid;
begin
  select event_id into v_event from public.event_guests where id = p_guest;
  if v_event is null or not public.can_edit_event(v_event) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.event_guests set name = btrim(p_name), phone_e164 = coalesce(p_phone, phone_e164) where id = p_guest;
end; $$;

-- Rotate a guest's link (old link stops working immediately).
create or replace function public.rotate_guest_token(p_guest uuid, p_new_hash text, p_new_version int)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event uuid;
begin
  select event_id into v_event from public.event_guests where id = p_guest;
  if v_event is null or not public.can_edit_event(v_event) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.event_guests set token_hash = p_new_hash, token_version = p_new_version
  where id = p_guest and token_version < p_new_version;
  if not found then raise exception 'STALE_VERSION'; end if;
end; $$;

-- "Open WhatsApp" was pressed: this proves only that the chat was opened, not that anything was sent.
create or replace function public.mark_guest_opened(p_guest uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event uuid;
begin
  select event_id into v_event from public.event_guests where id = p_guest;
  if v_event is null or not public.can_edit_event(v_event) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.event_guests
  set open_count = open_count + 1,
      last_opened_at = now(),
      send_status = case when send_status = 'sent' then 'sent'::public.send_status else 'opened'::public.send_status end
  where id = p_guest;
  -- Sending implies the event is live.
  update public.events set status = 'published' where id = v_event and status = 'draft';
end; $$;

-- The organizer confirms (or retracts) that they actually sent the message.
create or replace function public.mark_guest_sent(p_guest uuid, p_sent boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event uuid;
begin
  select event_id into v_event from public.event_guests where id = p_guest;
  if v_event is null or not public.can_edit_event(v_event) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_sent then
    update public.event_guests set send_status = 'sent', sent_at = now(), sent_by = auth.uid() where id = p_guest;
    update public.events set status = 'published' where id = v_event and status = 'draft';
  else
    update public.event_guests
    set send_status = case when open_count > 0 then 'opened'::public.send_status else 'not_started'::public.send_status end,
        sent_at = null, sent_by = null
    where id = p_guest;
  end if;
end; $$;

-- Manual RSVP update by an organizer (e.g. guest replied inside the WhatsApp chat).
create or replace function public.set_guest_rsvp(p_guest uuid, p_status public.rsvp_status, p_companions int default 0)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.event_guests; v_max int; v_comp int;
begin
  select * into g from public.event_guests where id = p_guest;
  if g.id is null or not public.can_edit_event(g.event_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select max_companions into v_max from public.events where id = g.event_id;
  v_comp := case when p_status = 'attending' then greatest(0, least(coalesce(p_companions, 0), v_max)) else 0 end;
  update public.event_guests
  set rsvp_status = p_status, companions = v_comp,
      responded_at = case when p_status = 'pending' then null else now() end,
      response_source = case when p_status = 'pending' then null else 'organizer'::public.response_source end,
      response_updated_by = auth.uid()
  where id = p_guest;
  insert into public.rsvp_audit (guest_id, event_id, workspace_id, old_status, new_status, old_companions, new_companions, source, actor_user_id)
  values (g.id, g.event_id, g.workspace_id, g.rsvp_status, p_status, g.companions, v_comp, 'organizer', auth.uid());
end; $$;

-- Duplicate an event (details only, no guests), as a new draft.
create or replace function public.clone_event(p_event uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare e public.events; v_new uuid;
begin
  if not public.can_view_event(p_event) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event;
  if not public.can_edit_ws(e.workspace_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  insert into public.events (workspace_id, title, kind, starts_at, timezone, location_url, location_name, location_address,
                             host_name, description, cover_path, rsvp_deadline, max_companions, capacity, show_capacity,
                             allow_change, status, template_key, message_template, created_by)
  values (e.workspace_id, left(e.title || ' (نسخة)', 120), e.kind, e.starts_at, e.timezone, e.location_url, e.location_name,
          e.location_address, e.host_name, e.description, e.cover_path, e.rsvp_deadline, e.max_companions, e.capacity,
          e.show_capacity, e.allow_change, 'draft', e.template_key, e.message_template, auth.uid())
  returning id into v_new;
  return v_new;
end; $$;

-- Workspace usage for the current plan (members only).
create or replace function public.workspace_usage(p_ws uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_ws_member(p_ws) and not public.is_platform_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'plan_id', p.id, 'plan_name', p.name,
    'max_active_events', p.max_active_events, 'max_guests_per_event', p.max_guests_per_event, 'max_members', p.max_members,
    'active_events', (select count(*) from public.events where workspace_id = w.id and status in ('draft', 'published')),
    'members', (select count(*) from public.workspace_members where workspace_id = w.id),
    'pending_invites', (select count(*) from public.workspace_invitations where workspace_id = w.id
                          and accepted_at is null and revoked_at is null and expires_at > now()),
    'total_guests', (select count(*) from public.event_guests where workspace_id = w.id)
  ) into v
  from public.workspaces w join public.plans p on p.id = w.plan_id where w.id = p_ws;
  return v;
end; $$;

-- Workspace invitations: enforce member limit at creation time.
create or replace function public.guard_invitation_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_max int; v_used int;
begin
  select p.max_members into v_max from public.workspaces w join public.plans p on p.id = w.plan_id where w.id = new.workspace_id;
  if v_max is not null then
    select (select count(*) from public.workspace_members where workspace_id = new.workspace_id)
         + (select count(*) from public.workspace_invitations where workspace_id = new.workspace_id
              and accepted_at is null and revoked_at is null and expires_at > now())
      into v_used;
    if v_used >= v_max then raise exception 'PLAN_LIMIT_MEMBERS' using errcode = 'P0001'; end if;
  end if;
  if new.expires_at > now() + interval '30 days' then new.expires_at := now() + interval '30 days'; end if;
  new.invited_by := auth.uid();
  new.accepted_at := null; new.accepted_by := null; new.revoked_at := null;
  if exists (select 1 from unnest(new.event_ids) x
             where not exists (select 1 from public.events e where e.id = x and e.workspace_id = new.workspace_id)) then
    raise exception 'BAD_EVENT_SCOPE';
  end if;
  return new;
end; $$;
create trigger invitations_guard before insert on public.workspace_invitations
for each row execute function public.guard_invitation_insert();

-- Preview an invitation before accepting (needs login; reveals only workspace name & role).
create or replace function public.preview_workspace_invitation(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare i public.workspace_invitations; v_name text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into i from public.workspace_invitations where token_hash = public.hash_token(p_token);
  if i.id is null then return jsonb_build_object('state', 'invalid'); end if;
  select name into v_name from public.workspaces where id = i.workspace_id;
  return jsonb_build_object(
    'state', case when i.revoked_at is not null then 'revoked'
                  when i.accepted_at is not null then 'used'
                  when i.expires_at <= now() then 'expired' else 'valid' end,
    'workspace_name', v_name, 'role', i.role,
    'email_matches', i.email = (select lower(email) from auth.users where id = auth.uid()));
end; $$;

create or replace function public.accept_workspace_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i public.workspace_invitations; v_email text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not public.rl_hit('accept:' || auth.uid()::text, 20, 3600) then raise exception 'RATE_LIMITED'; end if;
  select * into i from public.workspace_invitations where token_hash = public.hash_token(p_token) for update;
  if i.id is null or i.revoked_at is not null or i.accepted_at is not null or i.expires_at <= now() then
    raise exception 'INVITE_INVALID';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is distinct from i.email then raise exception 'INVITE_EMAIL_MISMATCH'; end if;
  if exists (select 1 from public.workspace_members where workspace_id = i.workspace_id and user_id = auth.uid()) then
    update public.workspace_invitations set accepted_at = now(), accepted_by = auth.uid() where id = i.id;
    return i.workspace_id;
  end if;
  insert into public.workspace_members (workspace_id, user_id, role, all_events)
  values (i.workspace_id, auth.uid(), i.role, i.all_events);
  insert into public.member_event_access (workspace_id, user_id, event_id)
  select i.workspace_id, auth.uid(), e.id from public.events e
  where e.id = any (i.event_ids) and e.workspace_id = i.workspace_id
  on conflict do nothing;
  update public.workspace_invitations set accepted_at = now(), accepted_by = auth.uid() where id = i.id;
  return i.workspace_id;
end; $$;

-- Create an extra workspace (e.g. for an organization).
create or replace function public.create_workspace(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if (select count(*) from public.workspaces where owner_id = auth.uid()) >= 5 then
    raise exception 'TOO_MANY_WORKSPACES';
  end if;
  insert into public.workspaces (name, owner_id, plan_id)
  values (btrim(p_name), auth.uid(), coalesce((select id from public.plans where is_default limit 1), 'free'))
  returning id into v_ws;
  insert into public.workspace_members (workspace_id, user_id, role, all_events) values (v_ws, auth.uid(), 'owner', true);
  return v_ws;
end; $$;

-- Personal data export (everything the user can see as a member, minus secrets).
create or replace function public.export_my_data()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'memberships', (select coalesce(jsonb_agg(jsonb_build_object('workspace', w.name, 'role', m.role)), '[]')
                    from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
                    where m.user_id = auth.uid()),
    'owned_workspaces', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', w.name,
        'events', (select coalesce(jsonb_agg(jsonb_build_object(
            'title', e.title, 'starts_at', e.starts_at, 'location', e.location_name,
            'guests', (select coalesce(jsonb_agg(jsonb_build_object('name', g.name, 'phone', g.phone_e164,
                         'rsvp', g.rsvp_status, 'companions', g.companions, 'send_status', g.send_status)), '[]')
                       from public.event_guests g where g.event_id = e.id))), '[]')
          from public.events e where e.workspace_id = w.id),
        'contacts', (select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'phone', c.phone_e164)), '[]')
                     from public.contacts c where c.workspace_id = w.id))), '[]')
      from public.workspaces w where w.owner_id = auth.uid())
  ) where auth.uid() is not null;
$$;

-- =====================================================================
-- RPCs: public invitation page (anon). Token is hashed server-side.
-- Returns nothing about other guests and never returns phone numbers.
-- =====================================================================
create or replace function public.get_invitation(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g public.event_guests; e public.events; v_taken int;
begin
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 128 then return null; end if;
  select * into g from public.event_guests where token_hash = public.hash_token(p_token);
  if g.id is null then return null; end if;
  select * into e from public.events where id = g.event_id;
  if e.show_capacity and e.capacity is not null then
    select coalesce(sum(1 + least(companions, e.max_companions)), 0) into v_taken
    from public.event_guests where event_id = e.id and rsvp_status = 'attending';
  end if;
  return jsonb_build_object(
    'guest_name', g.name,
    'rsvp_status', g.rsvp_status,
    'companions', g.companions,
    'responded_at', g.responded_at,
    'event', jsonb_build_object(
      'title', e.title, 'kind', e.kind, 'starts_at', e.starts_at, 'timezone', e.timezone,
      'location_url', e.location_url, 'location_name', e.location_name, 'location_address', e.location_address,
      'host_name', e.host_name, 'description', e.description, 'cover_path', e.cover_path,
      'rsvp_deadline', e.rsvp_deadline, 'max_companions', e.max_companions, 'allow_change', e.allow_change,
      'status', e.status,
      'seats_left', case when e.show_capacity and e.capacity is not null then greatest(e.capacity - v_taken, 0) end
    )
  );
end; $$;

create or replace function public.submit_rsvp(p_token text, p_status public.rsvp_status, p_companions int default 0, p_client_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.event_guests; e public.events; v_comp int; v_recent int; v_taken int;
begin
  if p_status not in ('attending', 'declined') then raise exception 'BAD_STATUS'; end if;
  if p_client_key is not null and not public.rl_hit('rsvp-ip:' || left(p_client_key, 80), 60, 600) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 128 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into g from public.event_guests where token_hash = public.hash_token(p_token) for update;
  if g.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into e from public.events where id = g.event_id;

  if e.status in ('cancelled', 'archived') then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if e.rsvp_deadline is not null and now() > e.rsvp_deadline then return jsonb_build_object('ok', false, 'error', 'deadline'); end if;
  if now() > e.starts_at + interval '6 hours' then return jsonb_build_object('ok', false, 'error', 'ended'); end if;
  if g.rsvp_status <> 'pending' and not e.allow_change and g.response_source = 'guest' then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;

  select count(*) into v_recent from public.rsvp_audit where guest_id = g.id and created_at > now() - interval '1 hour';
  if v_recent >= 15 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;

  v_comp := case when p_status = 'attending' then greatest(0, least(coalesce(p_companions, 0), e.max_companions)) else 0 end;

  if p_status = 'attending' and e.capacity is not null then
    select coalesce(sum(1 + least(companions, e.max_companions)), 0) into v_taken
    from public.event_guests where event_id = e.id and rsvp_status = 'attending' and id <> g.id;
    if v_taken + 1 + v_comp > e.capacity then return jsonb_build_object('ok', false, 'error', 'full'); end if;
  end if;

  if g.rsvp_status = p_status and g.companions = v_comp then
    return jsonb_build_object('ok', true, 'rsvp_status', p_status, 'companions', v_comp, 'unchanged', true);
  end if;

  update public.event_guests
  set rsvp_status = p_status, companions = v_comp, responded_at = now(),
      response_source = 'guest', response_updated_by = null
  where id = g.id;
  insert into public.rsvp_audit (guest_id, event_id, workspace_id, old_status, new_status, old_companions, new_companions, source)
  values (g.id, g.event_id, g.workspace_id, g.rsvp_status, p_status, g.companions, v_comp, 'guest');
  return jsonb_build_object('ok', true, 'rsvp_status', p_status, 'companions', v_comp);
end; $$;

-- =====================================================================
-- RPCs: platform admin (each re-checks is_platform_admin()).
-- =====================================================================
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'workspaces', (select count(*) from public.workspaces),
    'events', (select count(*) from public.events),
    'guests', (select count(*) from public.event_guests),
    'responses', (select count(*) from public.event_guests where rsvp_status <> 'pending'),
    'plans', (select jsonb_agg(to_jsonb(p) order by p.sort) from public.plans p),
    'workspace_list', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
      select w.id, w.name, w.plan_id, w.is_suspended, w.created_at,
             (select email from auth.users u where u.id = w.owner_id) as owner_email,
             (select count(*) from public.events e where e.workspace_id = w.id) as events,
             (select count(*) from public.events e where e.workspace_id = w.id and e.status in ('draft','published')) as active_events,
             (select count(*) from public.event_guests g where g.workspace_id = w.id) as guests,
             (select count(*) from public.workspace_members m where m.workspace_id = w.id) as members
      from public.workspaces w order by w.created_at desc limit 500) x)
  );
end; $$;

create or replace function public.admin_update_plan(p_id text, p_name text, p_max_events int, p_max_guests int, p_max_members int, p_price_label text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.plans set name = p_name, max_active_events = p_max_events, max_guests_per_event = p_max_guests,
         max_members = p_max_members, price_label = p_price_label where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end; $$;

create or replace function public.admin_set_workspace(p_ws uuid, p_plan text, p_suspended boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.workspaces set plan_id = p_plan, is_suspended = p_suspended where id = p_ws;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.subscriptions (workspace_id, plan_id, status, provider)
  values (p_ws, p_plan, 'active', 'manual')
  on conflict (workspace_id) do update set plan_id = excluded.plan_id, provider = 'manual', updated_at = now();
end; $$;

-- Function execute: revoke the PUBLIC default (and Supabase's default anon/authenticated grants),
-- then grant only what clients need.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_platform_admin(), public.ws_role(uuid), public.is_ws_member(uuid),
  public.can_view_event(uuid), public.can_view_ws_event(uuid, uuid), public.can_edit_event(uuid), public.can_edit_ws(uuid), public.shares_workspace(uuid),
  public.guest_phones(uuid), public.add_guests(uuid, jsonb, boolean), public.update_guest(uuid, text, text),
  public.rotate_guest_token(uuid, text, int), public.mark_guest_opened(uuid), public.mark_guest_sent(uuid, boolean),
  public.set_guest_rsvp(uuid, public.rsvp_status, int), public.clone_event(uuid), public.workspace_usage(uuid),
  public.preview_workspace_invitation(text), public.accept_workspace_invitation(text), public.create_workspace(text),
  public.export_my_data(), public.admin_overview(),
  public.admin_update_plan(text, text, int, int, int, text), public.admin_set_workspace(uuid, text, boolean)
  to authenticated;
grant execute on function public.get_invitation(text), public.submit_rsvp(text, public.rsvp_status, int, text)
  to anon, authenticated;
-- Trigger functions and internal helpers (hash_token, rl_hit, touch_updated_at, guards) are not callable by clients.
grant execute on all functions in schema public to service_role;
