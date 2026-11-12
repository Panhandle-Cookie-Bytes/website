begin;

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    username text,
    display_name text not null default '',
    avatar_url text,
    bio text not null default '',
    preferred_program text,
    profile_visibility text not null default 'private',
    created_at timestamptz not null default now()
);

alter table public.profiles
    add column if not exists username text,
    add column if not exists display_name text not null default '',
    add column if not exists avatar_url text,
    add column if not exists bio text not null default '',
    add column if not exists preferred_program text,
    add column if not exists profile_visibility text not null default 'private',
    add column if not exists created_at timestamptz not null default now();

do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'email'
    ) then
        alter table public.profiles alter column email drop not null;
    end if;
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'role'
    ) then
        alter table public.profiles alter column role drop not null;
    end if;
end;
$$;

update public.profiles p
set display_name = left(coalesce(
    nullif(trim(p.display_name), ''),
    nullif(split_part(u.email, '@', 1), ''),
    'FIRST learner'
), 60)
from auth.users u
where u.id = p.id;

insert into public.profiles (id, username, display_name)
select
    u.id,
    null,
    left(coalesce(
        nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
        nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
        nullif(split_part(u.email, '@', 1), ''),
        'FIRST learner'
    ), 60)
from auth.users u
where not exists (
    select 1 from public.profiles p where p.id = u.id
);

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.profiles'::regclass
            and conname = 'profiles_username_format'
    ) then
        alter table public.profiles
            add constraint profiles_username_format
            check (username is null or username ~ '^[a-z0-9_]{3,24}$');
    end if;
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.profiles'::regclass
            and conname = 'profiles_display_name_length'
    ) then
        alter table public.profiles
            add constraint profiles_display_name_length
            check (length(trim(display_name)) between 1 and 60);
    end if;
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.profiles'::regclass
            and conname = 'profiles_bio_length'
    ) then
        alter table public.profiles
            add constraint profiles_bio_length
            check (length(bio) <= 240);
    end if;
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.profiles'::regclass
            and conname = 'profiles_preferred_program'
    ) then
        alter table public.profiles
            add constraint profiles_preferred_program
            check (preferred_program is null or preferred_program in ('FLL', 'FTC', 'FRC', 'General FIRST'));
    end if;
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.profiles'::regclass
            and conname = 'profiles_visibility'
    ) then
        alter table public.profiles
            add constraint profiles_visibility
            check (profile_visibility in ('private', 'public'));
    end if;
end;
$$;

create unique index if not exists profiles_username_unique
    on public.profiles (username)
    where username is not null;

drop policy if exists "Profiles are visible to self and teammates" on public.profiles;
drop policy if exists "Users can update their own display name" on public.profiles;
drop policy if exists "Profiles are visible when public or owned" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select (
    id, username, display_name, avatar_url, bio, preferred_program,
    profile_visibility, created_at
) on public.profiles to anon, authenticated;
grant update (
    username, display_name, avatar_url, bio, preferred_program, profile_visibility
) on public.profiles to authenticated;

create policy "Profiles are visible when public or owned"
    on public.profiles for select to anon, authenticated
    using (
        id = (select auth.uid())
        or profile_visibility = 'public'
    );

create policy "Users can update their own profile"
    on public.profiles for update to authenticated
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()));

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_email_updated on auth.users;
drop function if exists public.sync_profile_email();

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, username, display_name)
    values (
        new.id,
        case
            when new.raw_user_meta_data ->> 'username' ~ '^[a-z0-9_]{3,24}$'
                then new.raw_user_meta_data ->> 'username'
            else null
        end,
        left(coalesce(
            nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
            nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
            nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
            nullif(split_part(new.email, '@', 1), ''),
            'FIRST learner'
        ), 60)
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.create_profile_for_new_user();

revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'profile-avatars',
    'profile-avatars',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read permitted profile avatars" on storage.objects;
drop policy if exists "Users can upload their own profile avatar" on storage.objects;
drop policy if exists "Users can update their own profile avatar" on storage.objects;
drop policy if exists "Users can delete their own profile avatar" on storage.objects;

create policy "Users can read permitted profile avatars"
    on storage.objects for select to anon, authenticated
    using (
        bucket_id = 'profile-avatars'
        and (
            (storage.foldername(name))[1] = (select auth.uid())::text
            or exists (
                select 1
                from public.profiles p
                where p.id::text = (storage.foldername(name))[1]
                    and p.profile_visibility = 'public'
            )
        )
    );

create policy "Users can upload their own profile avatar"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

create policy "Users can update their own profile avatar"
    on storage.objects for update to authenticated
    using (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    )
    with check (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

create policy "Users can delete their own profile avatar"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

commit;
