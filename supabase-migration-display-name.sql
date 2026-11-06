alter table public.profiles
    add column if not exists display_name text not null default '';

update public.profiles p
set display_name = coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(u.email, '@', 1), ''),
    'FTC member'
)
from auth.users u
where u.id = p.id and p.display_name = '';

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, email, display_name, role)
    values (
        new.id,
        coalesce(new.email, ''),
        coalesce(
            nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
            nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
            nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
            nullif(split_part(new.email, '@', 1), ''),
            'FTC member'
        ),
        case when new.raw_user_meta_data ->> 'role' = 'coach' then 'coach' else 'member' end
    );
    return new;
end;
$$;

create or replace function public.remove_team_member(_team_id uuid, _user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_team_coach(_team_id) then
        raise exception 'Only a coach on this team can remove members';
    end if;
    delete from public.team_members
    where team_id = _team_id and user_id = _user_id and role = 'member';
    if not found then
        raise exception 'This team member was not found or is a coach';
    end if;
end;
$$;

create or replace function public.create_team(_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_team_id uuid;
begin
    if (select auth.uid()) is null then
        raise exception 'You must be signed in to create a team';
    end if;
    if not exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'coach')
       and not exists (
           select 1 from public.team_members
           where user_id = (select auth.uid()) and role = 'coach'
       ) then
        raise exception 'Only coach accounts can create a team';
    end if;
    insert into public.teams (name, created_by)
    values (trim(_name), (select auth.uid()))
    returning id into new_team_id;
    insert into public.team_members (team_id, user_id, role)
    values (new_team_id, (select auth.uid()), 'coach');
    return new_team_id;
end;
$$;

drop policy if exists "Users can update their own display name" on public.profiles;
create policy "Users can update their own display name"
    on public.profiles for update to authenticated
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()));

grant update (display_name) on public.profiles to authenticated;
revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;
revoke all on function public.create_team(text) from public;
revoke all on function public.remove_team_member(uuid, uuid) from public;
grant execute on function public.create_team(text) to authenticated;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;
