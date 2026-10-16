create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  list text not null check (list in ('home_admin', 'todo')),
  title text not null,
  category text,
  due_date date,
  done boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  remind_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index reminders_sent_at_remind_at_idx
  on public.reminders (sent_at, remind_at);

create table public.integrations (
  provider text primary key check (provider in ('google', 'strava')),
  access_token_enc text,
  refresh_token_enc text,
  expires_at timestamptz,
  scope text,
  athlete_id text,
  updated_at timestamptz not null default now()
);

create table public.strava_activities (
  id bigint primary key,
  type text,
  sport_type text,
  name text,
  start_date timestamptz,
  distance_m real,
  moving_time_s integer,
  elapsed_time_s integer,
  total_elevation_gain_m real,
  average_heartrate real,
  raw jsonb
);

alter table public.tasks enable row level security;
alter table public.reminders enable row level security;
alter table public.integrations enable row level security;
alter table public.strava_activities enable row level security;
