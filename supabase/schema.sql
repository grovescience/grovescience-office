-- 과수원과학 교무실 온라인 저장소와 학생별 학습방
create table if not exists public.office_state (
  id text primary key default 'main',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.student_profiles (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  student_id text not null unique,
  login_id text not null unique,
  role text not null default 'student' check (role in ('student', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_portals (
  student_id text primary key,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.office_state enable row level security;
alter table public.student_profiles enable row level security;
alter table public.student_portals enable row level security;

drop policy if exists "admin can manage office state" on public.office_state;
create policy "admin can manage office state"
on public.office_state for all to authenticated
using ((auth.jwt() ->> 'email') = 'grovescience24@gmail.com')
with check ((auth.jwt() ->> 'email') = 'grovescience24@gmail.com');

drop policy if exists "students can read own profile" on public.student_profiles;
create policy "students can read own profile"
on public.student_profiles for select to authenticated
using (auth_user_id = auth.uid() or (auth.jwt() ->> 'email') = 'grovescience24@gmail.com');

drop policy if exists "students can read own portal" on public.student_portals;
create policy "students can read own portal"
on public.student_portals for select to authenticated
using (auth_user_id = auth.uid() or (auth.jwt() ->> 'email') = 'grovescience24@gmail.com');

revoke all on public.office_state from anon;
revoke all on public.student_profiles from anon;
revoke all on public.student_portals from anon;
grant select, insert, update, delete on public.office_state to authenticated;
grant select on public.student_profiles to authenticated;
grant select on public.student_portals to authenticated;
grant select, insert, update, delete on public.office_state to service_role;
grant select, insert, update, delete on public.student_profiles to service_role;
grant select, insert, update, delete on public.student_portals to service_role;
