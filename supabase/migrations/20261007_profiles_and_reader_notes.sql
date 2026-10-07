-- Apply after community.sql. Accounts may submit notes without membership;
-- publication still requires the existing editor-only moderation function.
begin;

alter table public.community_profiles add column if not exists avatar_path text;
alter table public.community_profiles add constraint community_profiles_avatar_owned
  check (avatar_path is null or (
    split_part(avatar_path, '/', 1) = user_id::text
    and avatar_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|png|webp)$'
  ));

-- Called by the server only, after verified-session and image validation.
create or replace function public.community_update_profile(
  p_user_id uuid, p_name text, p_avatar_path text, p_change_avatar boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_previous text; v_current text;
begin
  if p_user_id is null or not exists (
    select 1 from auth.users u where u.id = p_user_id and u.email_confirmed_at is not null
  ) then raise exception 'Verified account required' using errcode = '42501'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80
    or p_change_avatar is null then
    raise exception 'Invalid profile' using errcode = '22023';
  end if;
  if p_change_avatar and p_avatar_path is not null and (
    split_part(p_avatar_path, '/', 1) <> p_user_id::text
    or p_avatar_path !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|png|webp)$'
    or not exists (select 1 from storage.objects o
      where o.bucket_id = 'community-avatars' and o.name = p_avatar_path)
  ) then raise exception 'Invalid profile photo' using errcode = '22023'; end if;
  select avatar_path into v_previous from public.community_profiles
    where user_id = p_user_id for update;
  if not found then raise exception 'Profile not found' using errcode = 'P0002'; end if;
  update public.community_profiles
    set name = btrim(p_name), avatar_path = case when p_change_avatar then p_avatar_path else avatar_path end
    where user_id = p_user_id returning avatar_path into v_current;
  return jsonb_build_object('avatar_path', v_current, 'previous_avatar_path', v_previous);
end;
$$;
revoke all on function public.community_update_profile(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.community_update_profile(uuid, text, text, boolean) to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values('community-avatars', 'community-avatars', false, 2097152,
    array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
create policy community_avatars_server_only on storage.objects as restrictive
  for all to anon, authenticated
  using (bucket_id <> 'community-avatars') with check (bucket_id <> 'community-avatars');
create policy community_avatar_bucket_server_only on storage.buckets as restrictive
  for all to anon, authenticated
  using (id <> 'community-avatars') with check (id <> 'community-avatars');

-- The updated submission function follows below.

create or replace function public.community_submit_note(
  p_id text, p_user_id uuid, p_title text, p_text text, p_date date, p_media jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_paths text[]; v_media jsonb;
begin
  if p_user_id is null or not exists (
    select 1 from auth.users u where u.id = p_user_id and u.email_confirmed_at is not null
  ) then raise exception 'Verified account required' using errcode = '42501'; end if;
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

notify pgrst, 'reload schema';
commit;
