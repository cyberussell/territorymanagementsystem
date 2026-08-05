-- Territory Management System schema — run against the DEDICATED TMS Supabase project
-- (not the main cyberussell.com project, not the Appointment System's or LMS's projects).
-- See territory-management-system/SETUP.md.
--
-- Scope: foundation (auth, congregations) + the full Administrator module (territories,
-- sections, blocks, records, visit history). No publisher-facing role/tables yet — those
-- are added in a later migration once that module starts.
--
-- RLS design note: every tenant-scoped table below carries its own `congregation_id` column
-- directly (denormalized, not just inherited via a parent FK), so every policy is a flat
-- `congregation_id = <caller's congregation>` check with no cross-table joins. This is a
-- deliberate choice to avoid the RLS recursion class of bug the Laundry Management System hit
-- twice, where a child table's policy joined up through a parent table's own RLS'd policy.

-- ── Profiles (every signed-in user; mirrors auth.users) ──────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role = 'admin'),
  congregation_id uuid,
  full_name text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Congregations (the tenant root) ──────────────────────────────────────────────────────
create table public.congregations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  congregation_number text not null unique,
  timezone text not null default 'Asia/Manila',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_congregation_fk
  foreign key (congregation_id) references public.congregations(id) on delete set null;
create index profiles_congregation_idx on public.profiles (congregation_id);

-- ── Territories ───────────────────────────────────────────────────────────────────────────
create table public.territories (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations(id) on delete cascade,
  name text not null,
  description text not null default '',
  map_image_url text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);
create index territories_congregation_idx on public.territories (congregation_id);

-- ── Sections (auto-generated A, B, C… under a territory) ────────────────────────────────
create table public.territory_sections (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations(id) on delete cascade,
  territory_id uuid not null references public.territories(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index territory_sections_congregation_idx on public.territory_sections (congregation_id);
create index territory_sections_territory_idx on public.territory_sections (territory_id);

-- ── Blocks (auto-generated 1, 2, 3… under a section) ─────────────────────────────────────
create table public.territory_blocks (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations(id) on delete cascade,
  territory_id uuid not null references public.territories(id) on delete cascade,
  section_id uuid not null references public.territory_sections(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index territory_blocks_congregation_idx on public.territory_blocks (congregation_id);
create index territory_blocks_territory_idx on public.territory_blocks (territory_id);
create index territory_blocks_section_idx on public.territory_blocks (section_id);

-- ── Territory Records (one address/household inside a block) ────────────────────────────
create table public.territory_records (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations(id) on delete cascade,
  territory_id uuid not null references public.territories(id) on delete cascade,
  section_id uuid not null references public.territory_sections(id) on delete cascade,
  block_id uuid not null references public.territory_blocks(id) on delete cascade,
  address text not null,
  unit text not null default '',
  resident_name text not null default '',
  notes text not null default '',
  do_not_call boolean not null default false,
  status text not null default 'approved' check (status in ('pending', 'approved')),
  source text not null default 'manual' check (source in ('manual', 'csv_import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index territory_records_congregation_idx on public.territory_records (congregation_id);
create index territory_records_territory_idx on public.territory_records (territory_id);
create index territory_records_block_idx on public.territory_records (block_id);
create index territory_records_status_idx on public.territory_records (status);

-- ── Visit History (dated log entries per record) ─────────────────────────────────────────
create table public.territory_record_visits (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations(id) on delete cascade,
  record_id uuid not null references public.territory_records(id) on delete cascade,
  visited_at timestamptz not null default now(),
  result text not null check (result in ('visited', 'not_home', 'do_not_call', 'return_visit')),
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index territory_record_visits_congregation_idx on public.territory_record_visits (congregation_id);
create index territory_record_visits_record_idx on public.territory_record_visits (record_id);

-- ── Row Level Security ────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.congregations enable row level security;
alter table public.territories enable row level security;
alter table public.territory_sections enable row level security;
alter table public.territory_blocks enable row level security;
alter table public.territory_records enable row level security;
alter table public.territory_record_visits enable row level security;

create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.is_congregation_admin(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and congregation_id = c and role = 'admin'
  );
$$;

create policy "admin reads own congregation" on public.congregations
  for select using (public.is_congregation_admin(id));
create policy "admin updates own congregation" on public.congregations
  for update using (public.is_congregation_admin(id)) with check (public.is_congregation_admin(id));

create policy "admin manages territories" on public.territories
  for all using (public.is_congregation_admin(congregation_id)) with check (public.is_congregation_admin(congregation_id));
create policy "admin manages sections" on public.territory_sections
  for all using (public.is_congregation_admin(congregation_id)) with check (public.is_congregation_admin(congregation_id));
create policy "admin manages blocks" on public.territory_blocks
  for all using (public.is_congregation_admin(congregation_id)) with check (public.is_congregation_admin(congregation_id));
create policy "admin manages records" on public.territory_records
  for all using (public.is_congregation_admin(congregation_id)) with check (public.is_congregation_admin(congregation_id));
create policy "admin manages visits" on public.territory_record_visits
  for all using (public.is_congregation_admin(congregation_id)) with check (public.is_congregation_admin(congregation_id));

-- ── Section/Block label generator (single source of truth, mirrors the TS version used for
--    manual "add section/block" actions in modules/territory/labels.ts) ────────────────────
create or replace function public.tms_section_label(n int)
returns text language plpgsql immutable as $$
declare
  result text := '';
  i int := n;
begin
  if i < 1 then
    raise exception 'section index must be >= 1';
  end if;
  while i > 0 loop
    i := i - 1;
    result := chr(65 + (i % 26)) || result;
    i := i / 26;
  end loop;
  return result;
end;
$$;

-- ── Atomic territory + section + block generator ─────────────────────────────────────────
create or replace function public.create_territory_structure(
  p_congregation_id uuid,
  p_name text,
  p_description text,
  p_section_count int,
  p_blocks_per_section int
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_territory_id uuid;
  v_section_id uuid;
  s int;
  b int;
begin
  if not public.is_congregation_admin(p_congregation_id) then
    raise exception 'not authorized for this congregation';
  end if;
  if p_section_count < 1 or p_section_count > 100 then
    raise exception 'section_count must be between 1 and 100';
  end if;
  if p_blocks_per_section < 1 or p_blocks_per_section > 100 then
    raise exception 'blocks_per_section must be between 1 and 100';
  end if;

  insert into public.territories (congregation_id, name, description)
  values (p_congregation_id, p_name, p_description)
  returning id into v_territory_id;

  for s in 1..p_section_count loop
    insert into public.territory_sections (congregation_id, territory_id, label, sort_order)
    values (p_congregation_id, v_territory_id, public.tms_section_label(s), s)
    returning id into v_section_id;

    for b in 1..p_blocks_per_section loop
      insert into public.territory_blocks (congregation_id, territory_id, section_id, label, sort_order)
      values (p_congregation_id, v_territory_id, v_section_id, b::text, b);
    end loop;
  end loop;

  return v_territory_id;
end;
$$;

-- ── Storage: territory map images (JPG), admin-only, scoped to their own congregation ───
insert into storage.buckets (id, name, public)
values ('territory-maps', 'territory-maps', true)
on conflict (id) do nothing;

create policy "public reads territory maps"
  on storage.objects for select
  using (bucket_id = 'territory-maps');

create policy "admin writes own congregation territory maps"
  on storage.objects for insert
  with check (
    bucket_id = 'territory-maps'
    and public.is_congregation_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "admin updates own congregation territory maps"
  on storage.objects for update
  using (
    bucket_id = 'territory-maps'
    and public.is_congregation_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "admin deletes own congregation territory maps"
  on storage.objects for delete
  using (
    bucket_id = 'territory-maps'
    and public.is_congregation_admin(((storage.foldername(name))[1])::uuid)
  );
