alter table public.community_profiles
  add column bio text not null default '' check (char_length(bio) <= 240),
  add column background_color text not null default '#e5ece7' check (background_color ~ '^#[0-9a-f]{6}$'),
  add column background_path text check (background_path is null or
    (split_part(background_path, '/', 1)=user_id::text and background_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|png|webp)$'));

-- Only the website's server may call this, after verifying the account and validating its image.
create function public.community_update_appearance(p_user_id uuid,p_bio text,p_color text,p_background text,p_change boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous text; current_path text;
begin
  if p_bio is null or char_length(p_bio)>240 or p_color is null or p_color !~ '^#[0-9a-f]{6}$' or p_change is null then
    raise exception 'Invalid appearance' using errcode='22023';
  end if;
  select background_path into previous from public.community_profiles where user_id=p_user_id for update;
  if not found then raise exception 'Profile not found' using errcode='P0002'; end if;
  if p_change and p_background is not null and (
    split_part(p_background,'/',1)<>p_user_id::text or p_background !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|png|webp)$' or
    not exists(select 1 from storage.objects where bucket_id='community-avatars' and name=p_background)
  ) then raise exception 'Invalid background photo' using errcode='22023'; end if;
  update public.community_profiles set bio=btrim(p_bio),background_color=p_color,
    background_path=case when p_change then p_background else background_path end
    where user_id=p_user_id returning background_path into current_path;
  return jsonb_build_object('previous_path',previous,'background_path',current_path);
end;
$$;
revoke all on function public.community_update_appearance(uuid,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.community_update_appearance(uuid,text,text,text,boolean) to service_role;
