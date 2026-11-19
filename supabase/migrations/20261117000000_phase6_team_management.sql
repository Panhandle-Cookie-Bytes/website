begin;

alter table public.teams
    add column if not exists allow_student_quiz_creation boolean not null default false;

grant select (allow_student_quiz_creation) on public.teams to authenticated;

drop function if exists public.create_team(text, text, text, text, text);
create or replace function public.create_team(
    _name text,
    _team_number text,
    _program text,
    _description text,
    _visibility text,
    _allow_student_quiz_creation boolean default false
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

    insert into public.teams (
        name, team_number, program, description, visibility, owner_id, allow_student_quiz_creation
    )
    values (
        pg_catalog.btrim(_name),
        pg_catalog.upper(pg_catalog.btrim(_team_number)),
        _program,
        pg_catalog.btrim(coalesce(_description, '')),
        _visibility,
        (select auth.uid()),
        coalesce(_allow_student_quiz_creation, false)
    )
    returning id into new_team_id;

    insert into public.team_members (team_id, user_id, role)
    values (new_team_id, (select auth.uid()), 'owner');

    return new_team_id;
end;
$$;

drop function if exists public.update_team(uuid, text, text, text, text, text);
create or replace function public.update_team(
    _team_id uuid,
    _name text,
    _team_number text,
    _program text,
    _description text,
    _visibility text,
    _allow_student_quiz_creation boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform 1 from public.teams t where t.id = _team_id for update;
    if not found or coalesce(public.get_team_role(_team_id), '') not in ('owner', 'administrator') then
        raise exception 'Only the team owner or an administrator can edit team settings';
    end if;

    update public.teams
    set name = pg_catalog.btrim(_name),
        team_number = pg_catalog.upper(pg_catalog.btrim(_team_number)),
        program = _program,
        description = pg_catalog.btrim(coalesce(_description, '')),
        visibility = _visibility,
        allow_student_quiz_creation = coalesce(_allow_student_quiz_creation, false),
        updated_at = now()
    where id = _team_id;
end;
$$;

create or replace function public.can_create_quizzes()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select (select auth.uid()) is not null
        and (
            not exists (
                select 1 from public.team_members student_membership
                where student_membership.user_id = (select auth.uid())
                    and student_membership.role = 'student'
            )
            or exists (
                select 1
                from public.team_members membership
                join public.teams team on team.id = membership.team_id
                where membership.user_id = (select auth.uid())
                    and (
                        membership.role in ('owner', 'administrator', 'coach')
                        or (membership.role = 'student' and team.allow_student_quiz_creation)
                    )
            )
        );
$$;

create or replace function public.create_quiz(
    _title text,
    _description text,
    _program text,
    _category text,
    _visibility text,
    _status text,
    _questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_quiz_id uuid;
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in before creating a quiz';
    end if;
    if not public.can_create_quizzes() then
        raise exception 'Quiz creation is disabled by your team settings. Ask a team owner or administrator for permission';
    end if;
    if length(pg_catalog.btrim(coalesce(_title, ''))) not between 1 and 120
        or length(coalesce(_description, '')) > 1000
        or _program not in ('FLL', 'FTC', 'FRC', 'General FIRST')
        or length(pg_catalog.btrim(coalesce(_category, ''))) not between 1 and 80
        or _visibility not in ('private', 'public')
        or _status not in ('draft', 'published') then
        raise exception 'Check the quiz title, description, program, category, visibility, and status';
    end if;

    insert into public.quizzes (created_by, title, description, program, category, visibility, status)
    values (
        (select auth.uid()),
        pg_catalog.btrim(_title),
        pg_catalog.btrim(coalesce(_description, '')),
        _program,
        pg_catalog.btrim(_category),
        _visibility,
        _status
    )
    returning id into new_quiz_id;

    perform public.replace_quiz_questions(new_quiz_id, _questions);
    return new_quiz_id;
end;
$$;

create or replace function public.get_team_dashboard_stats(_team_id uuid)
returns table (
    member_count integer,
    student_count integer,
    coach_count integer,
    leadership_count integer,
    assigned_quiz_count integer,
    completed_attempt_count integer,
    active_learner_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.is_team_member(_team_id) then
        raise exception 'Only team members can view team statistics';
    end if;

    return query
    select
        (select pg_catalog.count(*)::integer from public.team_members m where m.team_id = _team_id),
        (select pg_catalog.count(*)::integer from public.team_members m where m.team_id = _team_id and m.role = 'student'),
        (select pg_catalog.count(*)::integer from public.team_members m where m.team_id = _team_id and m.role = 'coach'),
        (select pg_catalog.count(*)::integer from public.team_members m where m.team_id = _team_id and m.role in ('owner', 'administrator')),
        (select pg_catalog.count(*)::integer from public.team_quiz_assignments a where a.team_id = _team_id),
        (select pg_catalog.count(*)::integer
            from public.quiz_attempts attempt
            where attempt.finished_at is not null
                and attempt.score is not null
                and exists (
                    select 1
                    from public.team_quiz_assignments assignment
                    join public.team_members member on member.team_id = assignment.team_id
                    where assignment.team_id = _team_id
                        and assignment.quiz_id = attempt.quiz_id
                        and member.user_id = attempt.user_id
                )),
        (select pg_catalog.count(distinct attempt.user_id)::integer
            from public.quiz_attempts attempt
            where attempt.finished_at is not null
                and attempt.score is not null
                and exists (
                    select 1
                    from public.team_quiz_assignments assignment
                    join public.team_members member on member.team_id = assignment.team_id
                    where assignment.team_id = _team_id
                        and assignment.quiz_id = attempt.quiz_id
                        and member.user_id = attempt.user_id
                ));
end;
$$;

create or replace function public.get_team_activity(_team_id uuid, _limit integer default 8)
returns table (
    attempt_id uuid,
    member_display_name text,
    quiz_id uuid,
    quiz_title text,
    score integer,
    correct_count integer,
    total_questions integer,
    occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_current_role text;
begin
    v_current_role := public.get_team_role(_team_id);
    if v_current_role is null then
        raise exception 'Only team members can view team activity';
    end if;
    if _limit is null or _limit < 1 or _limit > 20 then
        raise exception 'Activity limit must be between 1 and 20';
    end if;

    return query
    select
        attempt.id,
        profile.display_name,
        quiz.id,
        quiz.title,
        attempt.score,
        attempt.correct_count,
        attempt.total_questions,
        attempt.finished_at
    from public.team_quiz_assignments assignment
    join public.quizzes quiz on quiz.id = assignment.quiz_id
    join public.quiz_attempts attempt
        on attempt.quiz_id = assignment.quiz_id
        and attempt.finished_at is not null
        and attempt.score is not null
    join public.team_members member
        on member.team_id = assignment.team_id
        and member.user_id = attempt.user_id
    join public.profiles profile on profile.id = member.user_id
    where assignment.team_id = _team_id
        and (
            v_current_role in ('owner', 'administrator', 'coach')
            or attempt.user_id = (select auth.uid())
        )
    order by attempt.finished_at desc
    limit _limit;
end;
$$;

create or replace function public.get_team_leaderboard(_team_id uuid)
returns table (
    member_display_name text,
    average_score numeric,
    completed_attempts integer,
    correct_answers integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.is_team_member(_team_id) then
        raise exception 'Only team members can view the team leaderboard';
    end if;

    return query
    select
        profile.display_name,
        pg_catalog.avg(attempt.score),
        pg_catalog.count(attempt.id)::integer,
        coalesce(pg_catalog.sum(attempt.correct_count), 0)::integer
    from public.team_members member
    join public.profiles profile on profile.id = member.user_id
    left join public.quiz_attempts attempt
        on attempt.user_id = member.user_id
        and attempt.finished_at is not null
        and attempt.score is not null
        and exists (
            select 1 from public.team_quiz_assignments assignment
            where assignment.team_id = _team_id and assignment.quiz_id = attempt.quiz_id
        )
    where member.team_id = _team_id
    group by member.user_id, member.joined_at, profile.display_name
    order by pg_catalog.avg(attempt.score) desc nulls last,
        pg_catalog.count(attempt.id) desc,
        pg_catalog.sum(attempt.correct_count) desc nulls last,
        member.joined_at asc;
end;
$$;

create or replace function public.set_team_logo(_team_id uuid, _logo_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if coalesce(public.get_team_role(_team_id), '') not in ('owner', 'administrator') then
        raise exception 'Only the team owner or an administrator can change the team logo';
    end if;
    if _logo_path is not null and _logo_path !~ (
        '^' || _team_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$'
    ) then
        raise exception 'Choose a valid uploaded team logo';
    end if;

    update public.teams
    set logo_url = _logo_path, updated_at = now()
    where id = _team_id;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-logos', 'team-logos', false, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = 3145728,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

drop policy if exists "Team members can view accessible team logos" on storage.objects;
drop policy if exists "Team managers can upload team logos" on storage.objects;
drop policy if exists "Team managers can delete team logos" on storage.objects;

create policy "Team members can view accessible team logos"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'team-logos'
        and exists (
            select 1 from public.teams team
            where team.id::text = (storage.foldername(name))[1]
                and (team.visibility = 'public' or public.is_team_member(team.id))
        )
    );

create policy "Team managers can upload team logos"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'team-logos'
        and exists (
            select 1 from public.teams team
            where team.id::text = (storage.foldername(name))[1]
                and public.get_team_role(team.id) in ('owner', 'administrator')
        )
    );

create policy "Team managers can delete team logos"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'team-logos'
        and exists (
            select 1 from public.teams team
            where team.id::text = (storage.foldername(name))[1]
                and public.get_team_role(team.id) in ('owner', 'administrator')
        )
    );

create or replace function public.generate_live_game_join_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    random_bytes bytea;
    random_index integer;
    generated_code text;
begin
    loop
        random_bytes := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
        generated_code := '';
        foreach random_index in array array[0, 1, 2, 3, 4, 5, 7, 8] loop
            generated_code := generated_code
                || pg_catalog.substr(alphabet, (pg_catalog.get_byte(random_bytes, random_index) & 31) + 1, 1);
        end loop;
        exit when not exists (
            select 1 from public.live_game_secrets secret where secret.join_code = generated_code
        );
    end loop;
    return generated_code;
end;
$$;

alter table public.live_game_secrets
    drop constraint if exists live_game_secrets_join_code_check;

do $$
declare
    existing_game record;
begin
    for existing_game in select secret.game_id from public.live_game_secrets secret loop
        update public.live_game_secrets
        set join_code = public.generate_live_game_join_code()
        where game_id = existing_game.game_id;
    end loop;
end;
$$;

alter table public.live_game_secrets
    add constraint live_game_secrets_join_code_check
    check (join_code ~ '^[A-HJ-NP-Z2-9]{8}$');

create or replace function public.create_live_game(_quiz_id uuid)
returns table (game_id uuid, join_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_game_id uuid := pg_catalog.gen_random_uuid();
    new_join_code text := public.generate_live_game_join_code();
    question_total integer;
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in to host a live game';
    end if;
    if not exists (
        select 1 from public.quizzes q
        where q.id = _quiz_id
            and q.status = 'published'
            and public.can_access_quiz(q.id)
    ) then
        raise exception 'This published quiz is unavailable to your account';
    end if;

    select pg_catalog.count(*)::integer into question_total
    from public.quiz_questions qq
    where qq.quiz_id = _quiz_id;
    if question_total < 1 or question_total > 50 then
        raise exception 'Live games require a quiz with 1 to 50 questions';
    end if;

    insert into public.live_games (id, quiz_id)
    values (new_game_id, _quiz_id);

    insert into public.live_game_secrets (game_id, host_user_id, join_code)
    values (new_game_id, (select auth.uid()), new_join_code);

    insert into public.live_game_questions (game_id, position, prompt, options, correct_option_index)
    select new_game_id, qq.position, qq.prompt, qq.options, qq.correct_option_index
    from public.quiz_questions qq
    where qq.quiz_id = _quiz_id
    order by qq.position;

    return query select new_game_id, new_join_code;
end;
$$;

revoke all on function public.create_team(text, text, text, text, text, boolean)
    from public, anon, authenticated;
revoke all on function public.update_team(uuid, text, text, text, text, text, boolean)
    from public, anon, authenticated;
revoke all on function public.can_create_quizzes() from public, anon;
revoke all on function public.create_quiz(text, text, text, text, text, text, jsonb)
    from public, anon, authenticated;
revoke all on function public.get_team_dashboard_stats(uuid) from public, anon, authenticated;
revoke all on function public.get_team_activity(uuid, integer) from public, anon, authenticated;
revoke all on function public.get_team_leaderboard(uuid) from public, anon, authenticated;
revoke all on function public.set_team_logo(uuid, text) from public, anon, authenticated;
revoke all on function public.generate_live_game_join_code() from public, anon, authenticated;

grant execute on function public.create_team(text, text, text, text, text, boolean) to authenticated;
grant execute on function public.update_team(uuid, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.can_create_quizzes() to authenticated;
grant execute on function public.create_quiz(text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.get_team_dashboard_stats(uuid) to authenticated;
grant execute on function public.get_team_activity(uuid, integer) to authenticated;
grant execute on function public.get_team_leaderboard(uuid) to authenticated;
grant execute on function public.set_team_logo(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
