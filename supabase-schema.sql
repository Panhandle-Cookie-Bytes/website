create extension if not exists pgcrypto;

create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text not null,
    role text not null default 'member' check (role in ('member', 'coach')),
    created_at timestamptz not null default now()
);

create table public.teams (
    id uuid primary key default gen_random_uuid(),
    name text not null check (length(trim(name)) between 1 and 80),
    created_by uuid not null references public.profiles (id),
    created_at timestamptz not null default now()
);

create table public.team_members (
    team_id uuid not null references public.teams (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    role text not null check (role in ('member', 'coach')),
    joined_at timestamptz not null default now(),
    primary key (team_id, user_id)
);

create index team_members_user_id_idx on public.team_members (user_id);

create table public.team_invitations (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references public.teams (id) on delete cascade,
    email text not null,
    role text not null check (role in ('member', 'coach')),
    token uuid not null unique default gen_random_uuid(),
    invited_by uuid not null references public.profiles (id),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '14 days'),
    unique (team_id, email)
);

create table public.quizzes (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles (id) on delete cascade,
    team_id uuid references public.teams (id) on delete cascade,
    title text not null check (length(trim(title)) between 1 and 120),
    category text not null check (length(trim(category)) between 1 and 80),
    description text not null default '',
    created_at timestamptz not null default now()
);

create index quizzes_team_id_idx on public.quizzes (team_id);
create index quizzes_owner_id_idx on public.quizzes (owner_id);

create table public.quiz_questions (
    id uuid primary key default gen_random_uuid(),
    quiz_id uuid not null references public.quizzes (id) on delete cascade,
    prompt text not null check (length(trim(prompt)) between 1 and 1000),
    position integer not null check (position >= 0),
    unique (quiz_id, position)
);

create table public.quiz_options (
    id uuid primary key default gen_random_uuid(),
    question_id uuid not null references public.quiz_questions (id) on delete cascade,
    option_text text not null check (length(trim(option_text)) between 1 and 500),
    position integer not null check (position between 0 and 3),
    unique (question_id, position)
);

create table public.quiz_answer_keys (
    question_id uuid primary key references public.quiz_questions (id) on delete cascade,
    correct_index integer not null check (correct_index between 0 and 3)
);

create table public.quiz_attempts (
    id uuid primary key default gen_random_uuid(),
    quiz_id uuid not null references public.quizzes (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    score integer not null check (score >= 0),
    total integer not null check (total > 0 and score <= total),
    created_at timestamptz not null default now()
);

create index quiz_attempts_user_id_idx on public.quiz_attempts (user_id, created_at desc);
create index quiz_attempts_quiz_id_idx on public.quiz_attempts (quiz_id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, email, role)
    values (
        new.id,
        coalesce(new.email, ''),
        case when new.raw_user_meta_data ->> 'role' = 'coach' then 'coach' else 'member' end
    );
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.create_profile_for_new_user();

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
    return new;
end;
$$;

create trigger on_auth_user_email_updated
    after update of email on auth.users
    for each row execute procedure public.sync_profile_email();

create or replace function public.is_team_member(_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.team_members
        where team_id = _team_id and user_id = (select auth.uid())
    );
$$;

create or replace function public.is_team_coach(_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.team_members
        where team_id = _team_id and user_id = (select auth.uid()) and role = 'coach'
    );
$$;

create or replace function public.is_teammate(_profile_id uuid)
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
        where mine.user_id = (select auth.uid()) and theirs.user_id = _profile_id
    );
$$;

create or replace function public.can_access_quiz(_quiz_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.quizzes q
        where q.id = _quiz_id
          and (q.owner_id = (select auth.uid()) or public.is_team_member(q.team_id))
    );
$$;

create or replace function public.can_manage_quiz(_quiz_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.quizzes q
        where q.id = _quiz_id
          and (q.owner_id = (select auth.uid()) or public.is_team_coach(q.team_id))
    );
$$;

create or replace function public.enforce_team_roster_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    member_count integer;
    coach_count integer;
begin
    perform 1 from public.teams where id = new.team_id for update;
    select count(*) filter (where role = 'member'),
           count(*) filter (where role = 'coach')
    into member_count, coach_count
    from public.team_members
    where team_id = new.team_id;

    if new.role = 'member' and member_count >= 15 then
        raise exception 'This team already has the maximum of 15 members';
    end if;
    if new.role = 'coach' and coach_count >= 4 then
        raise exception 'This team already has the maximum of 4 coaches';
    end if;
    return new;
end;
$$;

create trigger team_member_roster_limit
    before insert on public.team_members
    for each row execute procedure public.enforce_team_roster_limits();

create or replace function public.enforce_pending_invitation_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    member_count integer;
    coach_count integer;
begin
    perform 1 from public.teams where id = new.team_id for update;
    select count(*) filter (where role = 'member'),
           count(*) filter (where role = 'coach')
    into member_count, coach_count
    from public.team_members
    where team_id = new.team_id;
    select member_count + count(*) filter (where role = 'member'),
           coach_count + count(*) filter (where role = 'coach')
    into member_count, coach_count
    from public.team_invitations
    where team_id = new.team_id and expires_at > now();

    if new.role = 'member' and member_count >= 15 then
        raise exception 'This team has reached its limit of 15 members and pending member invitations';
    end if;
    if new.role = 'coach' and coach_count >= 4 then
        raise exception 'This team has reached its limit of 4 coaches and pending coach invitations';
    end if;
    return new;
end;
$$;

create trigger team_invitation_roster_limit
    before insert on public.team_invitations
    for each row execute procedure public.enforce_pending_invitation_limits();

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
    if not exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'coach') then
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

create or replace function public.create_team_invitation(_team_id uuid, _email text, _role text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_token uuid;
begin
    if not public.is_team_coach(_team_id) then
        raise exception 'Only a team coach can invite members';
    end if;
    if lower(trim(_email)) = lower((select email from public.profiles where id = (select auth.uid()))) then
        raise exception 'You are already a member of this team';
    end if;
    if exists (
        select 1
        from public.team_members tm
        join public.profiles p on p.id = tm.user_id
        where tm.team_id = _team_id and lower(p.email) = lower(trim(_email))
    ) then
        raise exception 'That account is already on this team';
    end if;
    if _role not in ('member', 'coach') then
        raise exception 'Invalid team role';
    end if;
    insert into public.team_invitations (team_id, email, role, invited_by)
    values (_team_id, lower(trim(_email)), _role, (select auth.uid()))
    on conflict (team_id, email) do update
        set role = excluded.role, invited_by = excluded.invited_by,
            token = gen_random_uuid(), created_at = now(), expires_at = now() + interval '14 days'
    returning token into new_token;
    return new_token;
end;
$$;

create or replace function public.accept_team_invitation(_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    invitation public.team_invitations%rowtype;
    current_email text;
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in before accepting a team invitation';
    end if;
    select * into invitation
    from public.team_invitations
    where token = _token and expires_at > now();
    if not found then
        raise exception 'This team invitation is invalid or expired';
    end if;
    select lower(email) into current_email from public.profiles where id = (select auth.uid());
    if current_email <> invitation.email then
        raise exception 'Sign in with the email address this invitation was sent to';
    end if;
    insert into public.team_members (team_id, user_id, role)
    values (invitation.team_id, (select auth.uid()), invitation.role)
    on conflict (team_id, user_id) do nothing;
    delete from public.team_invitations where id = invitation.id;
    return invitation.team_id;
end;
$$;

create or replace function public.create_quiz(
    _title text,
    _category text,
    _description text,
    _team_id uuid,
    _questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_quiz_id uuid;
    question jsonb;
    new_question_id uuid;
    question_position integer := 0;
    option_text text;
    option_position integer;
begin
    if (select auth.uid()) is null then
        raise exception 'You must be signed in to create a quiz';
    end if;
    if jsonb_typeof(_questions) <> 'array' or jsonb_array_length(_questions) < 1 then
        raise exception 'A quiz must contain at least one question';
    end if;
    if _team_id is not null and not public.is_team_coach(_team_id) then
        raise exception 'Only a coach on this team can assign a quiz to it';
    end if;
    insert into public.quizzes (owner_id, team_id, title, category, description)
    values ((select auth.uid()), _team_id, trim(_title), trim(_category), coalesce(_description, ''))
    returning id into new_quiz_id;

    for question in select value from jsonb_array_elements(_questions)
    loop
        if jsonb_typeof(question -> 'options') <> 'array'
           or jsonb_array_length(question -> 'options') <> 4
           or (question ->> 'answer')::integer not between 0 and 3 then
            raise exception 'Each question must have four choices and one valid correct answer';
        end if;
        insert into public.quiz_questions (quiz_id, prompt, position)
        values (new_quiz_id, trim(question ->> 'prompt'), question_position)
        returning id into new_question_id;
        insert into public.quiz_answer_keys (question_id, correct_index)
        values (new_question_id, (question ->> 'answer')::integer);
        option_position := 0;
        for option_text in select jsonb_array_elements_text(question -> 'options')
        loop
            insert into public.quiz_options (question_id, option_text, position)
            values (new_question_id, trim(option_text), option_position);
            option_position := option_position + 1;
        end loop;
        question_position := question_position + 1;
    end loop;
    return new_quiz_id;
end;
$$;

create or replace function public.submit_quiz_attempt(_quiz_id uuid, _answers integer[])
returns table(score integer, total integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
    answer_row record;
    calculated_score integer := 0;
    question_count integer := 0;
begin
    if (select auth.uid()) is null or not public.can_access_quiz(_quiz_id) then
        raise exception 'You do not have access to this quiz';
    end if;
    for answer_row in
        select q.position, k.correct_index
        from public.quiz_questions q
        join public.quiz_answer_keys k on k.question_id = q.id
        where q.quiz_id = _quiz_id
        order by q.position
    loop
        question_count := question_count + 1;
        if _answers[answer_row.position + 1] = answer_row.correct_index then
            calculated_score := calculated_score + 1;
        end if;
    end loop;
    if question_count = 0 or cardinality(_answers) <> question_count then
        raise exception 'Answers must be supplied for every question';
    end if;
    insert into public.quiz_attempts (quiz_id, user_id, score, total)
    values (_quiz_id, (select auth.uid()), calculated_score, question_count);
    return query select calculated_score, question_count;
end;
$$;

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invitations enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_options enable row level security;
alter table public.quiz_answer_keys enable row level security;
alter table public.quiz_attempts enable row level security;

create policy "Profiles are visible to self and teammates"
    on public.profiles for select to authenticated
    using (id = (select auth.uid()) or public.is_teammate(id));

create policy "Team members can view their teams"
    on public.teams for select to authenticated
    using (public.is_team_member(id));

create policy "Team members can view their roster"
    on public.team_members for select to authenticated
    using (public.is_team_member(team_id));

create policy "Coaches can view their invitations"
    on public.team_invitations for select to authenticated
    using (public.is_team_coach(team_id));

create policy "Users can view accessible quizzes"
    on public.quizzes for select to authenticated
    using (owner_id = (select auth.uid()) or public.is_team_member(team_id));

create policy "Users can create personal quizzes"
    on public.quizzes for insert to authenticated
    with check (owner_id = (select auth.uid()) and team_id is null);

create policy "Coaches can create team quizzes"
    on public.quizzes for insert to authenticated
    with check (owner_id = (select auth.uid()) and public.is_team_coach(team_id));

create policy "Owners and team coaches can update quizzes"
    on public.quizzes for update to authenticated
    using (owner_id = (select auth.uid()) or public.is_team_coach(team_id))
    with check (
        (owner_id = (select auth.uid()) and (team_id is null or public.is_team_coach(team_id)))
        or public.is_team_coach(team_id)
    );

create policy "Owners and team coaches can delete quizzes"
    on public.quizzes for delete to authenticated
    using (owner_id = (select auth.uid()) or public.is_team_coach(team_id));

create policy "Users can read accessible quiz questions"
    on public.quiz_questions for select to authenticated
    using (public.can_access_quiz(quiz_id));

create policy "Quiz managers can add questions"
    on public.quiz_questions for insert to authenticated
    with check (public.can_manage_quiz(quiz_id));

create policy "Quiz managers can edit questions"
    on public.quiz_questions for update to authenticated
    using (public.can_manage_quiz(quiz_id))
    with check (public.can_manage_quiz(quiz_id));

create policy "Quiz managers can remove questions"
    on public.quiz_questions for delete to authenticated
    using (public.can_manage_quiz(quiz_id));

create policy "Users can read accessible answer options"
    on public.quiz_options for select to authenticated
    using (exists (
        select 1 from public.quiz_questions q
        where q.id = question_id and public.can_access_quiz(q.quiz_id)
    ));

create policy "Quiz managers can add answer options"
    on public.quiz_options for insert to authenticated
    with check (exists (
        select 1 from public.quiz_questions q
        where q.id = question_id and public.can_manage_quiz(q.quiz_id)
    ));

create policy "Quiz managers can edit answer options"
    on public.quiz_options for update to authenticated
    using (exists (
        select 1 from public.quiz_questions q
        where q.id = question_id and public.can_manage_quiz(q.quiz_id)
    ))
    with check (exists (
        select 1 from public.quiz_questions q
        where q.id = question_id and public.can_manage_quiz(q.quiz_id)
    ));

create policy "Quiz managers can remove answer options"
    on public.quiz_options for delete to authenticated
    using (exists (
        select 1 from public.quiz_questions q
        where q.id = question_id and public.can_manage_quiz(q.quiz_id)
    ));

create policy "Quiz managers can view answer keys"
    on public.quiz_answer_keys for select to authenticated
    using (exists (
        select 1 from public.quiz_questions q
        where q.id = question_id and public.can_manage_quiz(q.quiz_id)
    ));

create policy "Quiz managers can add answer keys"
    on public.quiz_answer_keys for insert to authenticated
    with check (exists (
        select 1 from public.quiz_questions q
        where q.id = question_id and public.can_manage_quiz(q.quiz_id)
    ));

create policy "Quiz managers can edit answer keys"
    on public.quiz_answer_keys for update to authenticated
    using (exists (
        select 1 from public.quiz_questions q
        where q.id = question_id and public.can_manage_quiz(q.quiz_id)
    ))
    with check (exists (
        select 1 from public.quiz_questions q
        where q.id = question_id and public.can_manage_quiz(q.quiz_id)
    ));

create policy "Quiz managers can remove answer keys"
    on public.quiz_answer_keys for delete to authenticated
    using (exists (
        select 1 from public.quiz_questions q
        where q.id = question_id and public.can_manage_quiz(q.quiz_id)
    ));

create policy "Users can view their own attempts"
    on public.quiz_attempts for select to authenticated
    using (user_id = (select auth.uid()));

create policy "Coaches can view team attempts"
    on public.quiz_attempts for select to authenticated
    using (exists (
        select 1 from public.quizzes q
        where q.id = quiz_id and public.is_team_coach(q.team_id)
    ));

revoke all on public.profiles, public.teams, public.team_members,
    public.team_invitations, public.quizzes, public.quiz_questions,
    public.quiz_options, public.quiz_answer_keys, public.quiz_attempts
    from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles, public.teams, public.team_members,
    public.team_invitations, public.quizzes, public.quiz_questions,
    public.quiz_options, public.quiz_answer_keys, public.quiz_attempts to authenticated;
grant update on public.quizzes to authenticated;

revoke all on function public.create_team(text) from public;
revoke all on function public.create_team_invitation(uuid, text, text) from public;
revoke all on function public.accept_team_invitation(uuid) from public;
revoke all on function public.create_quiz(text, text, text, uuid, jsonb) from public;
revoke all on function public.submit_quiz_attempt(uuid, integer[]) from public;
revoke all on function public.is_team_member(uuid) from public, anon;
revoke all on function public.is_team_coach(uuid) from public, anon;
revoke all on function public.is_teammate(uuid) from public, anon;
revoke all on function public.can_access_quiz(uuid) from public, anon;
revoke all on function public.can_manage_quiz(uuid) from public, anon;
revoke all on function public.enforce_team_roster_limits() from public, anon, authenticated;
revoke all on function public.enforce_pending_invitation_limits() from public, anon, authenticated;
revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;
revoke all on function public.sync_profile_email() from public, anon, authenticated;
grant execute on function public.create_team(text) to authenticated;
grant execute on function public.create_team_invitation(uuid, text, text) to authenticated;
grant execute on function public.accept_team_invitation(uuid) to authenticated;
grant execute on function public.create_quiz(text, text, text, uuid, jsonb) to authenticated;
grant execute on function public.submit_quiz_attempt(uuid, integer[]) to authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.is_team_coach(uuid) to authenticated;
grant execute on function public.is_teammate(uuid) to authenticated;
grant execute on function public.can_access_quiz(uuid) to authenticated;
grant execute on function public.can_manage_quiz(uuid) to authenticated;
