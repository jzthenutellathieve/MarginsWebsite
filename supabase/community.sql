-- Run once in the Supabase SQL editor; safe to re-run for this schema version.
-- Browser clients use Supabase Auth only. All community data and Storage access
-- go through the site's server with its service-role key, never the browser.
begin;

create table if not exists public.community_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- A verified account can interact without membership. Only approved members
-- and the verified owner can upload photographs and submit Field Notes.
create table if not exists public.community_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  message text not null default '' check (char_length(message) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The server registers existing, vetted static Field Note IDs here. Submitted
-- notes start unpublished and become public only through community_moderate.
create table if not exists public.community_targets (
  note_id text primary key check (char_length(note_id) between 1 and 128),
  published boolean not null default false,
  view_count bigint not null default 0 check (view_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.community_notes (
  id text primary key references public.community_targets(note_id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  text text not null default '' check (char_length(text) <= 4000),
  date date not null default current_date,
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
  media jsonb not null default '[]'::jsonb
    check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  note_id text not null references public.community_targets(note_id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_likes (
  target_id text not null references public.community_targets(note_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (target_id, user_id)
);

-- Deduplication receipts expire after 24 hours. The durable total is held in
-- community_targets.view_count so pruning receipts never reduces the total.
create table if not exists public.community_views (
  target_id text not null references public.community_targets(note_id) on delete cascade,
  event_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (target_id, event_id)
);

create table if not exists public.community_uploads (
  path text primary key check (char_length(path) between 1 and 512),
  user_id uuid not null references auth.users(id) on delete cascade,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  width integer not null check (width between 1 and 20000),
  height integer not null check (height between 1 and 20000),
  attached_note_id text references public.community_notes(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.community_rate_limits (
  bucket_key text primary key check (char_length(bucket_key) between 1 and 256),
  window_started_at timestamptz not null,
  hits integer not null check (hits > 0)
);

create index if not exists community_notes_status_date_idx
  on public.community_notes (status, date desc, created_at desc);
create index if not exists community_memberships_status_idx
  on public.community_memberships (status, created_at);
create index if not exists community_notes_author_idx
  on public.community_notes (author_id, created_at desc);
create index if not exists community_comments_note_status_idx
  on public.community_comments (note_id, status, created_at);
create index if not exists community_comments_status_idx
  on public.community_comments (status, created_at);
create index if not exists community_views_expiry_idx
  on public.community_views (target_id, created_at);
create index if not exists community_uploads_user_idx
  on public.community_uploads (user_id, attached_note_id, created_at);
create index if not exists community_rate_limits_expiry_idx
  on public.community_rate_limits (window_started_at);

alter table public.community_profiles enable row level security;
alter table public.community_admins enable row level security;
alter table public.community_memberships enable row level security;
alter table public.community_targets enable row level security;
alter table public.community_notes enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_likes enable row level security;
alter table public.community_views enable row level security;
alter table public.community_uploads enable row level security;
alter table public.community_rate_limits enable row level security;

revoke all on table public.community_profiles, public.community_admins, public.community_memberships,
  public.community_targets, public.community_notes, public.community_comments,
  public.community_likes, public.community_views, public.community_uploads,
  public.community_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.community_profiles,
  public.community_admins, public.community_memberships, public.community_targets, public.community_notes,
  public.community_comments, public.community_likes, public.community_views,
  public.community_uploads, public.community_rate_limits to service_role;

create or replace function public.community_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists community_profiles_touch on public.community_profiles;
create trigger community_profiles_touch before update on public.community_profiles
  for each row execute function public.community_touch_updated_at();
drop trigger if exists community_memberships_touch on public.community_memberships;
create trigger community_memberships_touch before update on public.community_memberships
  for each row execute function public.community_touch_updated_at();
drop trigger if exists community_notes_touch on public.community_notes;
create trigger community_notes_touch before update on public.community_notes
  for each row execute function public.community_touch_updated_at();
drop trigger if exists community_comments_touch on public.community_comments;
create trigger community_comments_touch before update on public.community_comments
  for each row execute function public.community_touch_updated_at();

-- No role is derived from a display name, client metadata or an unverified email.
-- This deployment has one administrator: the verified site-owner account.
create or replace function public.community_sync_owner()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  delete from public.community_admins a where not exists (
    select 1 from auth.users u where u.id = a.user_id
      and u.email = 'xingtong.themargins@gmail.com'
      and u.email_confirmed_at is not null
  );
  insert into public.community_admins (user_id)
    select u.id from auth.users u
    where u.email = 'xingtong.themargins@gmail.com'
      and u.email_confirmed_at is not null
    on conflict (user_id) do nothing;
  select count(*)::integer into v_count from public.community_admins;
  return v_count;
end;
$$;

create or replace function public.community_note_state(
  p_target_id text, p_user_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_views bigint; v_likes bigint; v_liked boolean;
begin
  select t.view_count into v_views from public.community_targets t
    where t.note_id = p_target_id and t.published for share;
  if not found then raise exception 'Published note not found' using errcode = 'P0002'; end if;
  select count(*), coalesce(bool_or(l.user_id = p_user_id), false)
    into v_likes, v_liked from public.community_likes l where l.target_id = p_target_id;
  return jsonb_build_object('likes', v_likes, 'liked', v_liked, 'views', v_views);
end;
$$;

-- Explicit desired state makes retries idempotent; this is not a toggle.
create or replace function public.community_set_like(
  p_target_id text, p_user_id uuid, p_liked boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_liked is null or p_user_id is null then
    raise exception 'A user and desired like state are required' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id and u.email_confirmed_at is not null) then
    raise exception 'Verified account required' using errcode = '42501';
  end if;
  perform 1 from public.community_targets t where t.note_id = p_target_id and t.published for update;
  if not found then raise exception 'Published note not found' using errcode = 'P0002'; end if;
  if p_liked then
    insert into public.community_likes(target_id, user_id) values(p_target_id, p_user_id)
      on conflict (target_id, user_id) do nothing;
  else
    delete from public.community_likes where target_id = p_target_id and user_id = p_user_id;
  end if;
  return public.community_note_state(p_target_id, p_user_id);
end;
$$;

create or replace function public.community_record_view(
  p_target_id text, p_event_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_inserted integer; v_now timestamptz := clock_timestamp();
begin
  if p_event_id is null then raise exception 'A view event is required' using errcode = '22023'; end if;
  perform 1 from public.community_targets t where t.note_id = p_target_id and t.published for update;
  if not found then raise exception 'Published note not found' using errcode = 'P0002'; end if;
  delete from public.community_views where target_id = p_target_id and created_at <= v_now - interval '24 hours';
  insert into public.community_views(target_id, event_id, created_at) values(p_target_id, p_event_id, v_now)
    on conflict (target_id, event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    update public.community_targets set view_count = view_count + 1 where note_id = p_target_id;
  end if;
  return public.community_note_state(p_target_id, null)
    || jsonb_build_object('counted', v_inserted = 1);
end;
$$;

create or replace function public.community_rate_limit(
  p_bucket_key text, p_limit integer, p_window_seconds integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := clock_timestamp(); v_start timestamptz; v_hits integer; v_retry integer;
begin
  if p_bucket_key is null or char_length(p_bucket_key) not between 1 and 256
    or p_limit is null or p_limit not between 1 and 100000
    or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit parameters' using errcode = '22023';
  end if;
  insert into public.community_rate_limits as r(bucket_key, window_started_at, hits)
    values(p_bucket_key, v_now, 1)
    on conflict (bucket_key) do update set
      hits = case when r.window_started_at <= v_now - make_interval(secs => p_window_seconds)
        then 1 else least(r.hits + 1, p_limit + 1) end,
      window_started_at = case when r.window_started_at <= v_now - make_interval(secs => p_window_seconds)
        then v_now else r.window_started_at end
    returning hits, window_started_at into v_hits, v_start;
  v_retry := greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - v_now)))::integer);
  return jsonb_build_object('allowed', v_hits <= p_limit,
    'retry_after', case when v_hits <= p_limit then 0 else v_retry end,
    'remaining', greatest(0, p_limit - v_hits));
end;
$$;

create or replace function public.community_request_membership(
  p_user_id uuid, p_message text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if p_user_id is null or not exists (
    select 1 from auth.users u where u.id = p_user_id and u.email_confirmed_at is not null
  ) then raise exception 'Verified account required' using errcode = '42501'; end if;
  if p_message is null or char_length(p_message) > 1000 then
    raise exception 'Invalid membership message' using errcode = '22023';
  end if;
  insert into public.community_memberships as m(user_id, message, status)
    values(p_user_id, btrim(p_message), 'pending')
    on conflict (user_id) do update set
      message = case when m.status = 'approved' then m.message else excluded.message end,
      status = case when m.status = 'approved' then 'approved' else 'pending' end
    returning status into v_status;
  return jsonb_build_object('user_id', p_user_id, 'status', v_status);
end;
$$;

create or replace function public.community_submit_note(
  p_id text, p_user_id uuid, p_title text, p_text text, p_date date, p_media jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_paths text[]; v_media jsonb;
begin
  if p_user_id is null or not exists (
    select 1 from auth.users u where u.id = p_user_id and u.email_confirmed_at is not null
  ) then raise exception 'Verified account required' using errcode = '42501'; end if;
  -- Hold the approved membership until submission commits, so revocation and
  -- submission have a definite order instead of racing after a permission check.
  perform 1 from public.community_memberships m
    where m.user_id = p_user_id and m.status = 'approved' for share;
  if not found and not exists (
    select 1 from public.community_admins a join auth.users u on u.id = a.user_id
    where a.user_id = p_user_id and u.email = 'xingtong.themargins@gmail.com'
      and u.email_confirmed_at is not null
  ) then raise exception 'Approved membership required' using errcode = '42501'; end if;
  if p_id is null or char_length(p_id) not between 1 and 128
    or p_date is null or p_title is null or char_length(p_title) > 120
    or p_text is null or char_length(p_text) > 4000
    or p_media is null or jsonb_typeof(p_media) <> 'array' then
    raise exception 'Invalid note' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_media);
  if v_count > 4 or (btrim(p_text) = '' and v_count = 0) then
    raise exception 'A note needs text or photographs' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_media) m
    where jsonb_typeof(m) <> 'object' or jsonb_typeof(m->'path') is distinct from 'string'
      or char_length(m->>'path') not between 1 and 512
      or (m ? 'alt' and (jsonb_typeof(m->'alt') <> 'string' or char_length(m->>'alt') > 500))) then
    raise exception 'Invalid photograph metadata' using errcode = '22023';
  end if;
  select coalesce(array_agg(m->>'path'), array[]::text[]) into v_paths from jsonb_array_elements(p_media) m;
  if (select count(distinct p) from unnest(v_paths) p) <> v_count then
    raise exception 'Duplicate photographs are not allowed' using errcode = '22023';
  end if;
  -- Lock every receipt in a stable order so two concurrent submissions cannot
  -- claim the same upload, even if they list the photographs in reverse order.
  perform u.path from public.community_uploads u where u.path = any(v_paths) order by u.path for update;
  if (select count(*) from public.community_uploads u where u.path = any(v_paths)
    and u.user_id = p_user_id and u.attached_note_id is null) <> v_count then
    raise exception 'Photographs must belong to this account and be unused' using errcode = '42501';
  end if;
  -- Persist dimensions from the verified upload receipt, not from the request.
  select coalesce(jsonb_agg(jsonb_build_object(
    'path', u.path, 'alt', coalesce(m.value->>'alt', ''), 'width', u.width, 'height', u.height
  ) order by m.ordinality), '[]'::jsonb) into v_media
    from jsonb_array_elements(p_media) with ordinality m(value, ordinality)
    join public.community_uploads u on u.path = m.value->>'path';
  insert into public.community_targets(note_id, published) values(p_id, false);
  insert into public.community_notes(id, author_id, title, text, date, status, media)
    values(p_id, p_user_id, btrim(p_title), btrim(p_text), p_date, 'pending', v_media);
  update public.community_uploads set attached_note_id = p_id where path = any(v_paths);
  return jsonb_build_object('id', p_id, 'status', 'pending');
end;
$$;

create or replace function public.community_moderate(
  p_kind text, p_id text, p_approve boolean, p_admin_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_status text; v_target text; v_comment_id uuid;
begin
  if not exists (select 1 from public.community_admins a join auth.users u on u.id = a.user_id
    where a.user_id = p_admin_id and u.email = 'xingtong.themargins@gmail.com'
      and u.email_confirmed_at is not null) then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if p_approve is null or p_kind is null or p_kind not in ('note', 'comment', 'membership') then
    raise exception 'Invalid moderation request' using errcode = '22023';
  end if;
  v_status := case when p_approve then 'published' else 'rejected' end;
  if p_kind = 'membership' then
    v_status := case when p_approve then 'approved' else 'rejected' end;
    update public.community_memberships set status = v_status where user_id = p_id::uuid;
    if not found then raise exception 'Membership request not found' using errcode = 'P0002'; end if;
  elsif p_kind = 'note' then
    perform 1 from public.community_targets where note_id = p_id for update;
    if not found then raise exception 'Note not found' using errcode = 'P0002'; end if;
    update public.community_notes set status = v_status where id = p_id;
    if not found then raise exception 'Submitted note not found' using errcode = 'P0002'; end if;
    update public.community_targets set published = p_approve where note_id = p_id;
  else
    v_comment_id := p_id::uuid;
    select c.note_id into v_target from public.community_comments c where c.id = v_comment_id;
    if not found then raise exception 'Comment not found' using errcode = 'P0002'; end if;
    -- Always lock the target first, matching note moderation and counter RPCs.
    perform 1 from public.community_targets t where t.note_id = v_target
      and (not p_approve or t.published) for update;
    if not found then raise exception 'Published note not found' using errcode = 'P0002'; end if;
    update public.community_comments set status = v_status where id = v_comment_id and note_id = v_target;
    if not found then raise exception 'Comment not found' using errcode = 'P0002'; end if;
  end if;
  return jsonb_build_object('id', p_id, 'kind', p_kind, 'status', v_status);
end;
$$;

-- Functions are executable by PUBLIC unless explicitly revoked in PostgreSQL.
revoke all on function public.community_touch_updated_at() from public, anon, authenticated;
revoke all on function public.community_sync_owner() from public, anon, authenticated;
revoke all on function public.community_note_state(text, uuid) from public, anon, authenticated;
revoke all on function public.community_set_like(text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.community_record_view(text, uuid) from public, anon, authenticated;
revoke all on function public.community_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.community_request_membership(uuid, text) from public, anon, authenticated;
revoke all on function public.community_submit_note(text, uuid, text, text, date, jsonb) from public, anon, authenticated;
revoke all on function public.community_moderate(text, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.community_sync_owner() to service_role;
grant execute on function public.community_note_state(text, uuid) to service_role;
grant execute on function public.community_set_like(text, uuid, boolean) to service_role;
grant execute on function public.community_record_view(text, uuid) to service_role;
grant execute on function public.community_rate_limit(text, integer, integer) to service_role;
grant execute on function public.community_request_membership(uuid, text) to service_role;
grant execute on function public.community_submit_note(text, uuid, text, text, date, jsonb) to service_role;
grant execute on function public.community_moderate(text, text, boolean, uuid) to service_role;

-- Private originals: the server streams only approved media or issues short-lived
-- signed URLs after checking author/admin access. Never expose the service key.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values('community-media', 'community-media', false, 2097152,
    array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Restrictive policies prevent unrelated permissive Storage policies from
-- exposing this bucket. The service role bypasses RLS; other buckets are intact.
drop policy if exists community_media_server_only on storage.objects;
create policy community_media_server_only on storage.objects as restrictive
  for all to anon, authenticated
  using (bucket_id <> 'community-media') with check (bucket_id <> 'community-media');
drop policy if exists community_bucket_server_only on storage.buckets;
create policy community_bucket_server_only on storage.buckets as restrictive
  for all to anon, authenticated
  using (id <> 'community-media') with check (id <> 'community-media');

select public.community_sync_owner();
notify pgrst, 'reload schema';
commit;

-- Optional scheduled housekeeping (run as service_role/postgres):
-- delete from public.community_views where created_at < now() - interval '24 hours';
-- delete from public.community_rate_limits where window_started_at < now() - interval '2 days';
-- Delete abandoned Storage objects through the Storage API, not direct SQL.
