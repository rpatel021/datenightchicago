-- Night Out Chicago: venue photo / event flyer uploads. Applied 2026-09-28 to alktrading-owned
-- (migrations nightout_venue_uploads + nightout_admin_uploads_service_only). Record copy; already applied.

-- PRIVATE bucket, 10 MB cap, images only. Deliberately NO storage.objects policies for it:
-- anon/authenticated cannot list, read, write or delete. Uploads only via signed upload URLs minted by the
-- Edge Function nightout-upload after nightout_check_token(); reviewers read via signed URLs (admin key).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nightout-venue-uploads', 'nightout-venue-uploads', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.venue_submissions add column if not exists uploads jsonb not null default '[]'::jsonb;

create or replace function public.nightout_upload_recent(p_slug text)
returns integer language sql stable security definer set search_path = ''
as $$
  select count(*)::int from storage.objects
  where bucket_id = 'nightout-venue-uploads' and name like p_slug || '/%' and created_at > now() - interval '1 hour'
$$;
revoke all on function public.nightout_upload_recent(text) from public, anon, authenticated;
grant execute on function public.nightout_upload_recent(text) to service_role;

create or replace function public.nightout_admin_uploads(p_admin_key text)
returns table(path text, bytes bigint, content_type text, created_at timestamptz, submission_id uuid)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.nightout_is_admin(p_admin_key) then raise exception 'not_admin' using errcode = '28000'; end if;
  return query
    select o.name::text, coalesce((o.metadata->>'size')::bigint, 0), (o.metadata->>'mimetype')::text, o.created_at,
           (select s.id from public.venue_submissions s, jsonb_array_elements(s.uploads) u where u->>'path' = o.name limit 1)
    from storage.objects o where o.bucket_id = 'nightout-venue-uploads' order by o.created_at;
end $$;
revoke all on function public.nightout_admin_uploads(text) from public, anon, authenticated;
grant execute on function public.nightout_admin_uploads(text) to service_role;

-- submit v2: optional p_uploads (paths must match <slug>/<date>/<uuid>.<ext>, exist in the bucket, not be reused;
-- ≤10 venue photos, ≤20 event pictures). Contact name/email now optional (NULL when blank).
drop function if exists public.nightout_submit(text, text, text, text, jsonb, jsonb, jsonb, text, text);
create function public.nightout_submit(
  p_slug text, p_token text, p_contact_name text, p_contact_email text,
  p_listing jsonb, p_events jsonb, p_original jsonb,
  p_user_agent text default null, p_ip_hash text default null, p_uploads jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_name text; v_id uuid; v_recent int;
  v_up jsonb := coalesce(p_uploads, '[]'::jsonb);
  v_clean jsonb := '[]'::jsonb;
  u jsonb; v_path text; v_kind text; n_photo int := 0; n_ev int := 0;
  v_re text;
begin
  if not public.nightout_check_token(p_slug, p_token) then
    raise exception 'invalid_token' using errcode = '28000';
  end if;
  if length(coalesce(p_listing,'{}'::jsonb)::text) + length(coalesce(p_events,'[]'::jsonb)::text)
     + length(coalesce(p_original,'{}'::jsonb)::text) + length(v_up::text) > 80000 then
    raise exception 'payload_too_large' using errcode = '22001';
  end if;
  if jsonb_typeof(coalesce(p_events,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_events,'[]'::jsonb)) > 20 then
    raise exception 'too_many_events' using errcode = '22023';
  end if;
  if jsonb_typeof(v_up) <> 'array' or jsonb_array_length(v_up) > 30 then
    raise exception 'too_many_uploads' using errcode = '22023';
  end if;
  v_re := '^' || p_slug || '/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|heic|gif)$';
  for u in select * from jsonb_array_elements(v_up) loop
    v_path := u->>'path';
    v_kind := u->>'kind';
    if v_path is null or v_path !~ v_re or v_kind not in ('venue_photo', 'event_image') then
      raise exception 'bad_upload' using errcode = '22023';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'nightout-venue-uploads' and o.name = v_path) then
      raise exception 'upload_missing' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_clean) c where c->>'path' = v_path)
       or exists (select 1 from public.venue_submissions s, jsonb_array_elements(s.uploads) x where x->>'path' = v_path) then
      raise exception 'bad_upload' using errcode = '22023';
    end if;
    if v_kind = 'venue_photo' then n_photo := n_photo + 1; else n_ev := n_ev + 1; end if;
    v_clean := v_clean || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'path', v_path, 'kind', v_kind,
      'event_ref', left(u->>'event_ref', 160), 'event_title', left(u->>'event_title', 160),
      'bytes', case when (u->>'bytes') ~ '^[0-9]{1,9}$' then (u->>'bytes')::int end,
      'content_type', left(u->>'content_type', 40))));
  end loop;
  if n_photo > 10 or n_ev > 20 then
    raise exception 'too_many_uploads' using errcode = '22023';
  end if;
  select count(*) into v_recent from public.venue_submissions
    where slug = p_slug and created_at > now() - interval '1 hour';
  if v_recent >= 20 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  select venue_name into v_name from public.venue_edit_tokens where slug = p_slug;
  insert into public.venue_submissions (slug, venue_name, contact_name, contact_email, listing, events, original, user_agent, ip_hash, uploads)
  values (p_slug, v_name, nullif(left(p_contact_name, 200), ''), nullif(left(p_contact_email, 200), ''),
          coalesce(p_listing,'{}'::jsonb), coalesce(p_events,'[]'::jsonb), coalesce(p_original,'{}'::jsonb),
          left(p_user_agent, 400), left(p_ip_hash, 80), v_clean)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.nightout_submit(text, text, text, text, jsonb, jsonb, jsonb, text, text, jsonb) from public, authenticated;
grant execute on function public.nightout_submit(text, text, text, text, jsonb, jsonb, jsonb, text, text, jsonb) to anon, service_role;
