begin;

create table public.email_link_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  email_event_id uuid references public.email_events(id) on delete set null,
  recipient_email text not null,
  destination_url text not null check (destination_url ~* '^https?://[^[:space:]]+$'),
  token text not null unique check (token ~ '^[A-Za-z0-9]{24,64}$'),
  is_active boolean not null default true,
  expires_at timestamptz,
  first_clicked_at timestamptz,
  last_clicked_at timestamptz,
  click_count integer not null default 0 check (click_count >= 0),
  created_at timestamptz not null default now()
);

create table public.email_link_click_events (
  id uuid primary key default gen_random_uuid(),
  email_link_track_id uuid not null references public.email_link_tracks(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  referrer_origin text check (char_length(referrer_origin) <= 300),
  user_agent text check (char_length(user_agent) <= 400)
);

create index email_link_tracks_campaign_recipient_idx on public.email_link_tracks(campaign_id, recipient_email);
create index email_link_tracks_email_event_idx on public.email_link_tracks(email_event_id) where email_event_id is not null;
create index email_link_click_events_track_occurred_idx on public.email_link_click_events(email_link_track_id, occurred_at desc);

grant select, insert, update, delete on public.email_link_tracks, public.email_link_click_events to authenticated;
grant all on public.email_link_tracks, public.email_link_click_events to service_role;
alter table public.email_link_tracks enable row level security;
alter table public.email_link_click_events enable row level security;

create policy "Users can manage their own email link tracks"
  on public.email_link_tracks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can read click events for their own email links"
  on public.email_link_click_events for select to authenticated
  using (exists (
    select 1 from public.email_link_tracks track
    where track.id = email_link_track_id and track.user_id = (select auth.uid())
  ));

comment on table public.email_link_click_events is
  'Email link analytics with data minimization: no IP address, fingerprint, or precise location is stored.';

commit;