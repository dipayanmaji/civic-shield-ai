-- Run once in Supabase Dashboard → SQL Editor → New query.
-- All browser access is intentionally blocked by RLS. CivicShield's server API uses
-- SUPABASE_SERVICE_ROLE_KEY, while the public dashboard exposes only safe columns.

create table if not exists public.civic_reports (
  id bigint generated always as identity primary key,
  report_id text unique not null,
  description text not null,
  location_label text not null,
  latitude double precision,
  longitude double precision,
  duration text not null,
  affected_people integer check (affected_people is null or affected_people > 0),
  extra_details text,
  attachment_count integer not null default 0 check (attachment_count >= 0),
  category text,
  urgency text check (urgency in ('low', 'medium', 'high', 'critical')),
  route_name text,
  analysis jsonb,
  status text not null default 'ready-to-analyze' check (status in ('draft', 'ready-to-analyze', 'submitted', 'delivery-confirmed', 'acknowledged', 'assigned', 'in-progress', 'department-resolved', 'verification-pending', 'verified-resolved', 'disputed', 'reopened', 'overdue')),
  email_recipient text,
  gmail_message_id text,
  email_sent_at timestamptz,
  public_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_status_events (
  id bigint generated always as identity primary key,
  report_id text not null references public.civic_reports(report_id) on delete cascade,
  status text not null,
  note text not null,
  public_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.emergency_reports (
  id bigint generated always as identity primary key,
  emergency_id text unique not null,
  emergency_type text not null,
  location_label text not null,
  latitude double precision,
  longitude double precision,
  details text,
  is_safe boolean not null default false,
  public_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.community_verifications (
  id bigint generated always as identity primary key,
  report_id text not null references public.civic_reports(report_id) on delete cascade,
  client_token text not null,
  verdict text not null check (verdict in ('verified', 'disputed')),
  created_at timestamptz not null default now(),
  unique (report_id, client_token)
);

create table if not exists public.civic_sense_submissions (
  id bigint generated always as identity primary key,
  submission_id text unique not null,
  experience text not null,
  location_label text,
  latitude double precision,
  longitude double precision,
  media_count integer not null default 0 check (media_count >= 0),
  media_types text[] not null default '{}',
  media_urls text[] not null default '{}',
  ai_caption text not null,
  ai_category text not null,
  ai_hashtags text[] not null default '{}',
  ai_safety_note text not null,
  status text not null default 'needs-review' check (status in ('needs-review', 'approved', 'posted', 'rejected')),
  instagram_handle text,
  instagram_media_id text,
  instagram_post_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One moderator-managed Instagram Page connection. The page access token is only
-- accessed by server routes using SUPABASE_SERVICE_ROLE_KEY; it is never sent to browsers.
create table if not exists public.instagram_integrations (
  id bigint generated always as identity primary key,
  integration_key text unique not null default 'civicshield',
  page_id text not null,
  page_name text,
  ig_user_id text not null,
  instagram_username text,
  page_access_token text not null,
  connected_at timestamptz not null default now(),
  last_validated_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

-- Civic Sense accepts photos and short videos. The upsert updates the bucket
-- configuration in existing projects without removing previously uploaded files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'civic-sense-media',
  'civic-sense-media',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/webm', 'video/mp4', 'video/quicktime', 'video/x-m4v']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.civic_sense_submissions add column if not exists media_urls text[] not null default '{}';
alter table public.civic_sense_submissions add column if not exists instagram_media_id text;
alter table public.civic_sense_submissions add column if not exists instagram_post_url text;

create index if not exists civic_reports_public_created_idx on public.civic_reports (public_visible, created_at desc);
create index if not exists report_status_events_report_idx on public.report_status_events (report_id, created_at desc);
create index if not exists emergency_reports_public_created_idx on public.emergency_reports (public_visible, created_at desc);
create index if not exists community_verifications_report_idx on public.community_verifications (report_id, created_at desc);
create index if not exists civic_sense_submissions_created_idx on public.civic_sense_submissions (status, created_at desc);
create index if not exists instagram_integrations_connected_idx on public.instagram_integrations (connected_at desc);

alter table public.civic_reports enable row level security;
alter table public.report_status_events enable row level security;
alter table public.emergency_reports enable row level security;
alter table public.community_verifications enable row level security;
alter table public.civic_sense_submissions enable row level security;
alter table public.instagram_integrations enable row level security;

-- No anon/authenticated policies by design. Only server code using the service-role key
-- can read or write rows. Do not add a broad public select policy.
