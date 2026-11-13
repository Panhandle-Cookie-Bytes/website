begin;

create table public.teams (
    id uuid primary key default pg_catalog.gen_random_uuid(),
    name text not null check (length(pg_catalog.btrim(name)) between 1 and 100),
    team_number text not null check (team_number ~ '^[[:alnum:]-]{1,24}$'),
    program text not null check (program in ('FLL', 'FTC', 'FRC', 'General FIRST')),
    description text not null default '' check (length(description) <= 500),
    logo_url text,
    visibility text not null default 'private' check (visibility in ('private', 'public')),
    owner_id uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index teams_owner_id_idx on public.teams (owner_id);
create index teams_program_visibility_idx on public.teams (program, visibility);

create table public.team_members (
    team_id uuid not null references public.teams (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    role text not null check (role in ('owner', 'administrator', 'coach', 'student')),
    joined_at timestamptz not null default now(),
    primary key (team_id, user_id)
);

create index team_members_user_id_idx on public.team_members (user_id, joined_at desc);
create index team_members_team_role_idx on public.team_members (team_id, role);

create table public.team_invitations (
    id uuid primary key default pg_catalog.gen_random_uuid(),
    team_id uuid not null references public.teams (id) on delete cascade,
    invitation_code_hash text not null unique check (invitation_code_hash ~ '^[0-9a-f]{64}$'),
    role text not null check (role in ('coach', 'student')),
    created_by uuid not null references public.profiles (id) on delete cascade,
    expires_at timestamptz,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create index team_invitations_team_id_idx on public.team_invitations (team_id, created_at desc);

create or replace function public.is_team_member(_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.team_members tm
        where tm.team_id = _team_id and tm.user_id = (select auth.uid())
    );
$$;

create or replace function public.get_team_role(_team_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select tm.role
    from public.team_members tm
    where tm.team_id = _team_id and tm.user_id = (select auth.uid())
    limit 1;
$$;

create or replace function public.is_team_teammate(_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.team_members mine
        join public.team_members theirs on theirs.team_id = mine.team_id
        where mine.user_id = (select auth.uid())
            and theirs.user_id = _profile_id
            and mine.user_id <> theirs.user_id
    );
$$;

create or replace function public.create_team(
    _name text,
    _team_number text,
    _program text,
    _description text,
    _visibility text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_team_id uuid;
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in before creating a team';
    end if;
    if not exists (select 1 from public.profiles p where p.id = (select auth.uid())) then
        raise exception 'Your profile is not ready yet. Refresh and try again';
    end if;

    insert into public.teams (name, team_number, program, description, visibility, owner_id)
    values (
        pg_catalog.btrim(_name),
        pg_catalog.upper(pg_catalog.btrim(_team_number)),
        _program,
        pg_catalog.btrim(coalesce(_description, '')),
        _visibility,
        (select auth.uid())
    )
    returning id into new_team_id;

    insert into public.team_members (team_id, user_id, role)
    values (new_team_id, (select auth.uid()), 'owner');

    return new_team_id;
end;
$$;

create or replace function public.update_team(
    _team_id uuid,
    _name text,
    _team_number text,
    _program text,
    _description text,
    _visibility text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform 1 from public.teams t where t.id = _team_id for update;
    if coalesce(public.get_team_role(_team_id), '') not in ('owner', 'administrator') then
        raise exception 'Only the team owner or an administrator can edit team settings';
    end if;

    update public.teams
    set name = pg_catalog.btrim(_name),
        team_number = pg_catalog.upper(pg_catalog.btrim(_team_number)),
        program = _program,
        description = pg_catalog.btrim(coalesce(_description, '')),
        visibility = _visibility,
        updated_at = now()
    where id = _team_id;
end;
$$;

create or replace function public.create_team_invitation(
    _team_id uuid,
    _role text,
    _expires_at timestamptz default null
)
returns table (invitation_code text, expires_at timestamptz, invited_role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_current_role text;
    new_code text;
begin
    perform 1 from public.teams t where t.id = _team_id for update;
    v_current_role := public.get_team_role(_team_id);
    if v_current_role is null or v_current_role not in ('owner', 'administrator', 'coach') then
        raise exception 'You do not have permission to invite people to this team';
    end if;
    if _role not in ('student', 'coach') then
        raise exception 'Invitations can add students or coaches only';
    end if;
    if _role = 'coach' and v_current_role not in ('owner', 'administrator') then
        raise exception 'Only the team owner or an administrator can invite a coach';
    end if;
    if _expires_at is not null and (_expires_at <= now() or _expires_at > now() + interval '1 year') then
        raise exception 'Invitation expiration must be within the next year';
    end if;

    new_code := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');

    insert into public.team_invitations (team_id, invitation_code_hash, role, created_by, expires_at)
    select _team_id,
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(new_code, 'UTF8')), 'hex'),
        _role,
        (select auth.uid()),
        _expires_at;

    update public.team_invitations
    set is_active = false
    where team_id = _team_id
        and role = _role
        and id <> (
        select i.id from public.team_invitations i
        where i.invitation_code_hash = pg_catalog.encode(
            pg_catalog.sha256(pg_catalog.convert_to(new_code, 'UTF8')), 'hex'
        )
    );

    return query select new_code, _expires_at, _role;
end;
$$;

create or replace function public.preview_team_invitation(_code text)
returns table (
    team_id uuid,
    team_name text,
    team_number text,
    program text,
    team_description text,
    invited_role text,
    expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in to view this team invitation';
    end if;
    if _code is null or pg_catalog.lower(pg_catalog.btrim(_code)) !~ '^[0-9a-f]{32}$' then
        raise exception 'This invitation code is invalid';
    end if;

    return query
    select t.id, t.name, t.team_number, t.program, t.description, i.role, i.expires_at
    from public.team_invitations i
    join public.teams t on t.id = i.team_id
    where i.invitation_code_hash = pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.lower(pg_catalog.btrim(_code)), 'UTF8')),
        'hex'
    )
        and i.is_active
        and (i.expires_at is null or i.expires_at > now());
end;
$$;

create or replace function public.join_team_with_invitation(_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    matched_invitation public.team_invitations%rowtype;
    team_member_count integer;
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in before joining a team';
    end if;
    if _code is null or pg_catalog.lower(pg_catalog.btrim(_code)) !~ '^[0-9a-f]{32}$' then
        raise exception 'This invitation code is invalid';
    end if;

    select i.* into matched_invitation
    from public.team_invitations i
    where i.invitation_code_hash = pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.lower(pg_catalog.btrim(_code)), 'UTF8')),
        'hex'
    )
        and i.is_active
        and (i.expires_at is null or i.expires_at > now());
    if not found then
        raise exception 'This invitation is invalid, expired, or has been disabled';
    end if;
    perform 1 from public.teams t where t.id = matched_invitation.team_id for update;
    select i.* into matched_invitation
    from public.team_invitations i
    where i.id = matched_invitation.id
        and i.is_active
        and (i.expires_at is null or i.expires_at > now())
    for update;
    if not found then
        raise exception 'This invitation is invalid, expired, or has been disabled';
    end if;
    if exists (
        select 1 from public.team_members tm
        where tm.team_id = matched_invitation.team_id and tm.user_id = (select auth.uid())
    ) then
        raise exception 'You are already a member of this team';
    end if;

    select count(*) into team_member_count
    from public.team_members tm
    where tm.team_id = matched_invitation.team_id and tm.role = matched_invitation.role;
    if matched_invitation.role = 'student' and team_member_count >= 15 then
        raise exception 'This team has reached its limit of 15 students';
    end if;
    if matched_invitation.role = 'coach' and team_member_count >= 4 then
        raise exception 'This team has reached its limit of 4 coaches';
    end if;

    insert into public.team_members (team_id, user_id, role)
    values (matched_invitation.team_id, (select auth.uid()), matched_invitation.role);

    return matched_invitation.team_id;
end;
$$;

create or replace function public.deactivate_team_invitation(_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    invitation_team_id uuid;
begin
    select i.team_id into invitation_team_id
    from public.team_invitations i
    where i.id = _invitation_id and i.is_active;

    if invitation_team_id is null then
        raise exception 'This invitation is already inactive or no longer exists';
    end if;
    if coalesce(public.get_team_role(invitation_team_id), '') not in ('owner', 'administrator', 'coach') then
        raise exception 'You do not have permission to disable this invitation';
    end if;

    update public.team_invitations set is_active = false where id = _invitation_id;
end;
$$;

create or replace function public.set_team_member_role(
    _team_id uuid,
    _user_id uuid,
    _new_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_current_role text;
    existing_role text;
    team_member_count integer;
begin
    perform 1 from public.teams t where t.id = _team_id for update;
    v_current_role := public.get_team_role(_team_id);
    if v_current_role is null or v_current_role not in ('owner', 'administrator') then
        raise exception 'Only the team owner or an administrator can change team roles';
    end if;
    if _new_role not in ('administrator', 'coach', 'student') then
        raise exception 'Choose a valid team role';
    end if;
    if _new_role = 'administrator' and v_current_role <> 'owner' then
        raise exception 'Only the team owner can appoint an administrator';
    end if;
    select tm.role into existing_role
    from public.team_members tm
    where tm.team_id = _team_id and tm.user_id = _user_id;
    if existing_role is null or existing_role = 'owner' then
        raise exception 'That team member cannot be changed';
    end if;

    if _new_role in ('student', 'coach') and _new_role <> existing_role then
        select count(*) into team_member_count
        from public.team_members tm
        where tm.team_id = _team_id and tm.role = _new_role;
        if _new_role = 'student' and team_member_count >= 15 then
            raise exception 'This team has reached its limit of 15 students';
        end if;
        if _new_role = 'coach' and team_member_count >= 4 then
            raise exception 'This team has reached its limit of 4 coaches';
        end if;
    end if;

    update public.team_members set role = _new_role
    where team_id = _team_id and user_id = _user_id;
end;
$$;

create or replace function public.remove_team_member(_team_id uuid, _user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_current_role text;
    removed_role text;
begin
    perform 1 from public.teams t where t.id = _team_id for update;
    v_current_role := public.get_team_role(_team_id);
    select tm.role into removed_role
    from public.team_members tm
    where tm.team_id = _team_id and tm.user_id = _user_id;

    if removed_role is null or removed_role = 'owner' then
        raise exception 'The team owner cannot be removed';
    end if;
    if v_current_role is null or v_current_role not in ('owner', 'administrator', 'coach') then
        raise exception 'You do not have permission to remove team members';
    end if;
    if v_current_role <> 'owner' and removed_role = 'administrator' then
        raise exception 'Only the team owner can remove an administrator';
    end if;
    if v_current_role = 'coach' and removed_role <> 'student' then
        raise exception 'Coaches can remove students only';
    end if;

    delete from public.team_members
    where team_id = _team_id and user_id = _user_id;
end;
$$;

create or replace function public.leave_team(_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_current_role text;
begin
    perform 1 from public.teams t where t.id = _team_id for update;
    v_current_role := public.get_team_role(_team_id);
    if v_current_role is null then
        raise exception 'You are not a member of this team';
    end if;
    if v_current_role = 'owner' then
        raise exception 'Transfer ownership or delete the team before leaving';
    end if;

    delete from public.team_members
    where team_id = _team_id and user_id = (select auth.uid());
end;
$$;

create or replace function public.transfer_team_ownership(_team_id uuid, _new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform 1 from public.teams t where t.id = _team_id for update;
    if public.get_team_role(_team_id) is distinct from 'owner' then
        raise exception 'Only the current team owner can transfer ownership';
    end if;
    if _new_owner_id = (select auth.uid()) or not exists (
        select 1 from public.team_members tm
        where tm.team_id = _team_id and tm.user_id = _new_owner_id and tm.role <> 'owner'
    ) then
        raise exception 'Choose another current team member as the new owner';
    end if;

    update public.team_members
    set role = 'administrator'
    where team_id = _team_id and user_id = (select auth.uid());

    update public.team_members
    set role = 'owner'
    where team_id = _team_id and user_id = _new_owner_id;

    update public.teams
    set owner_id = _new_owner_id, updated_at = now()
    where id = _team_id;
end;
$$;

create or replace function public.delete_team(_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform 1 from public.teams t where t.id = _team_id for update;
    if public.get_team_role(_team_id) is distinct from 'owner' then
        raise exception 'Only the team owner can delete this team';
    end if;
    delete from public.teams where id = _team_id;
end;
$$;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invitations enable row level security;

revoke all on public.teams, public.team_members, public.team_invitations from public, anon, authenticated;
grant select (
    id, name, team_number, program, description, logo_url, visibility, owner_id, created_at, updated_at
) on public.teams to authenticated;
grant select (team_id, user_id, role, joined_at)
    on public.team_members to authenticated;
grant select (id, team_id, role, created_by, expires_at, is_active, created_at)
    on public.team_invitations to authenticated;

drop policy if exists "Profiles are visible to team members" on public.profiles;
create policy "Profiles are visible to team members"
    on public.profiles for select to authenticated
    using (id = (select auth.uid()) or public.is_team_teammate(id));

create policy "Members can view their teams and public teams"
    on public.teams for select to authenticated
    using (visibility = 'public' or public.is_team_member(id));

create policy "Members can view their roster"
    on public.team_members for select to authenticated
    using (public.is_team_member(team_id));

create policy "Team managers can view invitations"
    on public.team_invitations for select to authenticated
    using (public.get_team_role(team_id) in ('owner', 'administrator', 'coach'));

revoke all on function public.is_team_member(uuid) from public, anon;
revoke all on function public.get_team_role(uuid) from public, anon;
revoke all on function public.is_team_teammate(uuid) from public, anon;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.get_team_role(uuid) to authenticated;
grant execute on function public.is_team_teammate(uuid) to authenticated;

revoke all on function public.create_team(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.update_team(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_team_invitation(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.preview_team_invitation(text) from public, anon, authenticated;
revoke all on function public.join_team_with_invitation(text) from public, anon, authenticated;
revoke all on function public.deactivate_team_invitation(uuid) from public, anon, authenticated;
revoke all on function public.set_team_member_role(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.remove_team_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.leave_team(uuid) from public, anon, authenticated;
revoke all on function public.transfer_team_ownership(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_team(uuid) from public, anon, authenticated;
grant execute on function public.create_team(text, text, text, text, text) to authenticated;
grant execute on function public.update_team(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.create_team_invitation(uuid, text, timestamptz) to authenticated;
grant execute on function public.preview_team_invitation(text) to authenticated;
grant execute on function public.join_team_with_invitation(text) to authenticated;
grant execute on function public.deactivate_team_invitation(uuid) to authenticated;
grant execute on function public.set_team_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;
grant execute on function public.leave_team(uuid) to authenticated;
grant execute on function public.transfer_team_ownership(uuid, uuid) to authenticated;
grant execute on function public.delete_team(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
