begin;

update public.team_invitations
set is_active = false
where is_active;

create table public.team_invitation_lookup_limits (
    user_id uuid primary key references public.profiles (id) on delete cascade,
    minute_started_at timestamptz not null,
    minute_attempts integer not null,
    hour_started_at timestamptz not null,
    hour_attempts integer not null
);
alter table public.team_invitation_lookup_limits enable row level security;
revoke all on public.team_invitation_lookup_limits from public, anon, authenticated;

create or replace function public.consume_team_invitation_lookup_limit()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    current_user_id uuid := (select auth.uid());
begin
    if current_user_id is null then
        raise exception 'Sign in to use a team invitation';
    end if;

    insert into public.team_invitation_lookup_limits (
        user_id, minute_started_at, minute_attempts, hour_started_at, hour_attempts
    )
    values (current_user_id, now(), 1, now(), 1)
    on conflict (user_id) do update
    set minute_started_at = case
            when public.team_invitation_lookup_limits.minute_started_at <= now() - interval '1 minute'
                then now()
            else public.team_invitation_lookup_limits.minute_started_at
        end,
        minute_attempts = case
            when public.team_invitation_lookup_limits.minute_started_at <= now() - interval '1 minute'
                then 1
            else public.team_invitation_lookup_limits.minute_attempts + 1
        end,
        hour_started_at = case
            when public.team_invitation_lookup_limits.hour_started_at <= now() - interval '1 hour'
                then now()
            else public.team_invitation_lookup_limits.hour_started_at
        end,
        hour_attempts = case
            when public.team_invitation_lookup_limits.hour_started_at <= now() - interval '1 hour'
                then 1
            else public.team_invitation_lookup_limits.hour_attempts + 1
        end
    where (
            case
                when public.team_invitation_lookup_limits.minute_started_at <= now() - interval '1 minute'
                    then 0
                else public.team_invitation_lookup_limits.minute_attempts
            end
        ) < 20
        and (
            case
                when public.team_invitation_lookup_limits.hour_started_at <= now() - interval '1 hour'
                    then 0
                else public.team_invitation_lookup_limits.hour_attempts
            end
        ) < 100;

    if not found then
        raise exception 'Too many invitation attempts. Wait a minute and try again';
    end if;
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
    random_bytes bytea;
    alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
    perform 1 from public.teams team where team.id = _team_id for update;
    v_current_role := public.get_team_role(_team_id);
    if v_current_role is null or v_current_role not in ('owner', 'administrator', 'coach') then
        raise exception 'You do not have permission to invite people to this team';
    end if;
    if _role is null or _role not in ('student', 'coach') then
        raise exception 'Invitations can add students or coaches only';
    end if;
    if _role = 'coach' and v_current_role not in ('owner', 'administrator') then
        raise exception 'Only the team owner or an administrator can invite a coach';
    end if;
    if _expires_at is not null and (_expires_at <= now() or _expires_at > now() + interval '1 year') then
        raise exception 'Invitation expiration must be within the next year';
    end if;

    loop
        random_bytes := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
        select pg_catalog.string_agg(
            pg_catalog.substr(alphabet, (pg_catalog.get_byte(random_bytes, digit) % pg_catalog.length(alphabet)) + 1, 1),
            ''
        )
        into new_code
        from pg_catalog.generate_series(0, 7) as digits(digit);
        exit when not exists (
            select 1
            from public.team_invitations invitation
            where invitation.invitation_code_hash = pg_catalog.encode(
                pg_catalog.sha256(pg_catalog.convert_to(new_code, 'UTF8')),
                'hex'
            )
        );
    end loop;

    insert into public.team_invitations (team_id, invitation_code_hash, role, created_by, expires_at)
    values (
        _team_id,
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(new_code, 'UTF8')), 'hex'),
        _role,
        (select auth.uid()),
        _expires_at
    );

    update public.team_invitations invitation
    set is_active = false
    where invitation.team_id = _team_id
        and invitation.role = _role
        and invitation.invitation_code_hash <> pg_catalog.encode(
            pg_catalog.sha256(pg_catalog.convert_to(new_code, 'UTF8')),
            'hex'
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
security definer
set search_path = ''
as $$
begin
    perform public.consume_team_invitation_lookup_limit();
    if _code is null or pg_catalog.upper(pg_catalog.btrim(_code)) !~ '^[A-HJ-NP-Z2-9]{8}$' then
        raise exception 'This invitation code is invalid';
    end if;

    return query
    select team.id, team.name, team.team_number, team.program, team.description, invitation.role, invitation.expires_at
    from public.team_invitations invitation
    join public.teams team on team.id = invitation.team_id
    where invitation.invitation_code_hash = pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.upper(pg_catalog.btrim(_code)), 'UTF8')),
        'hex'
    )
        and invitation.is_active
        and (invitation.expires_at is null or invitation.expires_at > now());
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
    perform public.consume_team_invitation_lookup_limit();
    if _code is null or pg_catalog.upper(pg_catalog.btrim(_code)) !~ '^[A-HJ-NP-Z2-9]{8}$' then
        raise exception 'This invitation code is invalid';
    end if;

    select invitation.* into matched_invitation
    from public.team_invitations invitation
    where invitation.invitation_code_hash = pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.upper(pg_catalog.btrim(_code)), 'UTF8')),
        'hex'
    )
        and invitation.is_active
        and (invitation.expires_at is null or invitation.expires_at > now());
    if not found then
        raise exception 'This invitation is invalid, expired, or has been disabled';
    end if;

    perform 1 from public.teams team where team.id = matched_invitation.team_id for update;
    select invitation.* into matched_invitation
    from public.team_invitations invitation
    where invitation.id = matched_invitation.id
        and invitation.is_active
        and (invitation.expires_at is null or invitation.expires_at > now())
    for update;
    if not found then
        raise exception 'This invitation is invalid, expired, or has been disabled';
    end if;
    if exists (
        select 1 from public.team_members member
        where member.team_id = matched_invitation.team_id
            and member.user_id = (select auth.uid())
    ) then
        raise exception 'You are already a member of this team';
    end if;

    select pg_catalog.count(*)::integer into team_member_count
    from public.team_members member
    where member.team_id = matched_invitation.team_id
        and member.role = matched_invitation.role;
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

alter table public.quizzes
    add column team_id uuid references public.teams (id) on delete set null,
    add column tags text[] not null default '{}',
    add column cover_image_path text,
    add column default_question_time_seconds integer not null default 30
        check (default_question_time_seconds between 0 and 600),
    add column randomize_questions boolean not null default false,
    add column randomize_answers boolean not null default false,
    add column show_explanations boolean not null default true,
    add column allow_multiple_attempts boolean not null default true,
    add column show_correct_answers boolean not null default true,
    add column allow_public_duplication boolean not null default false,
    add column allow_team_editing boolean not null default false;

alter table public.quizzes drop constraint if exists quizzes_visibility_check;
alter table public.quizzes
    add constraint quizzes_visibility_check check (visibility in ('private', 'team', 'public')),
    add constraint quizzes_tags_limit_check check (pg_catalog.cardinality(tags) <= 10);

update public.quizzes quiz
set visibility = 'team',
    team_id = (
        select assignment.team_id
        from public.team_quiz_assignments assignment
        where assignment.quiz_id = quiz.id
        order by assignment.assigned_at
        limit 1
    )
where quiz.visibility = 'private'
    and exists (
        select 1 from public.team_quiz_assignments assignment where assignment.quiz_id = quiz.id
    );

alter table public.quiz_questions
    add column question_type text not null default 'multiple_choice'
        check (question_type in ('multiple_choice', 'true_false', 'multiple_select', 'image_multiple_choice')),
    add column correct_option_indices integer[] not null default '{}',
    add column image_path text,
    add column point_value integer not null default 1 check (point_value between 1 and 100),
    add column time_limit_seconds integer check (time_limit_seconds is null or time_limit_seconds between 5 and 600);

update public.quiz_questions
set correct_option_indices = array[correct_option_index];

alter table public.quiz_attempts
    add column quiz_title_snapshot text,
    add column show_explanations boolean not null default true,
    add column show_correct_answers boolean not null default true;

update public.quiz_attempts attempt
set quiz_title_snapshot = quiz.title
from public.quizzes quiz
where quiz.id = attempt.quiz_id;
alter table public.quiz_attempts
    alter column quiz_title_snapshot set not null;

alter table public.quiz_attempt_answers
    add column selected_option_indices integer[] not null default '{}',
    alter column selected_option_index drop not null;

update public.quiz_attempt_answers
set selected_option_indices = array[selected_option_index];

create table public.quiz_attempt_questions (
    attempt_id uuid not null references public.quiz_attempts (id) on delete cascade,
    question_id uuid not null,
    question_position integer not null,
    question_type text not null check (question_type in ('multiple_choice', 'true_false', 'multiple_select', 'image_multiple_choice')),
    prompt text not null,
    options text[] not null,
    correct_option_indices integer[] not null,
    explanation text not null,
    image_path text,
    point_value integer not null check (point_value between 1 and 100),
    time_limit_seconds integer,
    primary key (attempt_id, question_id),
    unique (attempt_id, question_position)
);

insert into public.quiz_attempt_questions (
    attempt_id, question_id, question_position, question_type, prompt, options,
    correct_option_indices, explanation, image_path, point_value, time_limit_seconds
)
select attempt.id, question.id, question.position, question.question_type, question.prompt,
    question.options, question.correct_option_indices, question.explanation,
    question.image_path, question.point_value, question.time_limit_seconds
from public.quiz_attempts attempt
join public.quiz_questions question on question.quiz_id = attempt.quiz_id
on conflict (attempt_id, question_id) do nothing;

alter table public.quiz_attempt_questions enable row level security;
revoke all on public.quiz_attempt_questions from public, anon, authenticated;

create or replace function public.can_access_quiz(_quiz_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.quizzes quiz
        where quiz.id = _quiz_id
            and (
                quiz.created_by = (select auth.uid())
                or (
                    quiz.allow_team_editing
                    and quiz.team_id is not null
                    and public.get_team_role(quiz.team_id) in ('owner', 'administrator', 'coach')
                )
                or (
                    quiz.status = 'published'
                    and (
                        quiz.visibility = 'public'
                        or (
                            quiz.visibility = 'team'
                            and (
                                exists (
                                    select 1 from public.team_members member
                                    where member.team_id = quiz.team_id
                                        and member.user_id = (select auth.uid())
                                )
                                or exists (
                                    select 1
                                    from public.team_quiz_assignments assignment
                                    join public.team_members member on member.team_id = assignment.team_id
                                    where assignment.quiz_id = quiz.id
                                        and member.user_id = (select auth.uid())
                                )
                            )
                        )
                    )
                )
            )
    );
$$;

create or replace function public.can_edit_quiz(_quiz_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.quizzes quiz
        where quiz.id = _quiz_id
            and (
                quiz.created_by = (select auth.uid())
                or (
                    quiz.allow_team_editing
                    and quiz.team_id is not null
                    and public.get_team_role(quiz.team_id) in ('owner', 'administrator', 'coach')
                )
            )
    );
$$;

create or replace function public.replace_quiz_questions(_quiz_id uuid, _questions jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    question_record record;
    question_data jsonb;
    question_position integer;
    question_kind text;
    option_count integer;
    correct_indices integer[];
    correct_index integer;
    image_path_value text;
    options_value text[];
begin
    if not public.can_edit_quiz(_quiz_id) then
        raise exception 'You do not have permission to edit this quiz';
    end if;
    if pg_catalog.jsonb_typeof(_questions) is distinct from 'array'
        or pg_catalog.jsonb_array_length(_questions) not between 1 and 50 then
        raise exception 'A quiz must contain between 1 and 50 questions';
    end if;

    delete from public.quiz_questions question where question.quiz_id = _quiz_id;

    for question_record in
        select item.value, item.ordinality
        from pg_catalog.jsonb_array_elements(_questions) with ordinality as item(value, ordinality)
        order by item.ordinality
    loop
        question_data := question_record.value;
        question_position := question_record.ordinality::integer;
        question_kind := coalesce(question_data ->> 'question_type', 'multiple_choice');

        if pg_catalog.jsonb_typeof(question_data) <> 'object'
            or pg_catalog.jsonb_typeof(question_data -> 'prompt') <> 'string'
            or length(pg_catalog.btrim(question_data ->> 'prompt')) not between 1 and 500
            or question_kind not in ('multiple_choice', 'true_false', 'multiple_select', 'image_multiple_choice')
            or pg_catalog.jsonb_typeof(question_data -> 'options') is distinct from 'array'
            or pg_catalog.jsonb_typeof(question_data -> 'correct_indices') is distinct from 'array'
            or pg_catalog.jsonb_typeof(question_data -> 'point_value') is distinct from 'number' then
            raise exception 'Question % has invalid text, type, choices, or point value', question_position;
        end if;

        option_count := pg_catalog.jsonb_array_length(question_data -> 'options');
        if option_count not between 2 and 6
            or exists (
                select 1
                from pg_catalog.jsonb_array_elements(question_data -> 'options') as option_item(value)
                where pg_catalog.jsonb_typeof(option_item.value) <> 'string'
                    or length(pg_catalog.btrim(option_item.value #>> '{}')) not between 1 and 200
            ) then
            raise exception 'Question % must have between 2 and 6 non-empty answer options', question_position;
        end if;
        if question_kind = 'true_false'
            and (question_data -> 'options') <> '["True", "False"]'::jsonb then
            raise exception 'True-or-false questions must use the True and False choices';
        end if;

        select pg_catalog.array_agg(index_value::integer order by index_value::integer)
        into correct_indices
        from pg_catalog.jsonb_array_elements_text(question_data -> 'correct_indices') as answer(index_value);
        if correct_indices is null
            or pg_catalog.cardinality(correct_indices) < 1
            or (select pg_catalog.count(distinct index_value) from pg_catalog.unnest(correct_indices) as values(index_value))
                <> pg_catalog.cardinality(correct_indices)
            or exists (
                select 1 from pg_catalog.unnest(correct_indices) as values(index_value)
                where index_value < 0 or index_value >= option_count
            )
            or (
                question_kind <> 'multiple_select'
                and pg_catalog.cardinality(correct_indices) <> 1
            )
            or exists (
                select 1
                from pg_catalog.jsonb_array_elements(question_data -> 'correct_indices') as answer(value)
                where pg_catalog.jsonb_typeof(answer.value) <> 'number'
                    or answer.value #>> '{}' !~ '^(0|[1-9][0-9]*)$'
            ) then
            raise exception 'Question % has invalid correct choices', question_position;
        end if;

        if (question_data ->> 'point_value') !~ '^[0-9]+$'
            or (question_data ->> 'point_value')::integer not between 1 and 100 then
            raise exception 'Question % must be worth between 1 and 100 points', question_position;
        end if;
        if question_data ? 'explanation'
            and (pg_catalog.jsonb_typeof(question_data -> 'explanation') <> 'string'
                or length(question_data ->> 'explanation') > 1000) then
            raise exception 'Question % has an invalid explanation', question_position;
        end if;
        if question_data ? 'time_limit_seconds'
            and question_data -> 'time_limit_seconds' <> 'null'::jsonb
            and (
                pg_catalog.jsonb_typeof(question_data -> 'time_limit_seconds') <> 'number'
                or (question_data ->> 'time_limit_seconds') !~ '^[0-9]+$'
                or (question_data ->> 'time_limit_seconds')::integer not between 5 and 600
            ) then
            raise exception 'Question % has an invalid time limit', question_position;
        end if;

        image_path_value := nullif(pg_catalog.btrim(question_data ->> 'image_path'), '');
        if image_path_value is not null and image_path_value !~
            ('^' || (select auth.uid())::text || '/' || _quiz_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
            raise exception 'Question % has an invalid image', question_position;
        end if;
        if question_kind = 'image_multiple_choice' and image_path_value is null then
            raise exception 'Image-based questions need an image';
        end if;

        select pg_catalog.array_agg(pg_catalog.btrim(option_item.value #>> '{}') order by option_item.ordinality)
        into options_value
        from pg_catalog.jsonb_array_elements(question_data -> 'options')
            with ordinality as option_item(value, ordinality);

        insert into public.quiz_questions (
            quiz_id, position, prompt, options, correct_option_index, correct_option_indices,
            explanation, question_type, image_path, point_value, time_limit_seconds
        )
        values (
            _quiz_id,
            question_position,
            pg_catalog.btrim(question_data ->> 'prompt'),
            options_value,
            correct_indices[1],
            correct_indices,
            pg_catalog.btrim(coalesce(question_data ->> 'explanation', '')),
            question_kind,
            image_path_value,
            (question_data ->> 'point_value')::integer,
            case
                when question_data -> 'time_limit_seconds' is null
                    or question_data -> 'time_limit_seconds' = 'null'::jsonb then null
                else (question_data ->> 'time_limit_seconds')::integer
            end
        );
    end loop;
end;
$$;

drop function if exists public.create_quiz(text, text, text, text, text, text, text, boolean, jsonb);
create function public.create_quiz(
    _quiz_id uuid,
    _title text,
    _description text,
    _program text,
    _category text,
    _visibility text,
    _status text,
    _difficulty text,
    _allow_question_preview boolean,
    _team_id uuid,
    _tags text[],
    _cover_image_path text,
    _default_question_time_seconds integer,
    _randomize_questions boolean,
    _randomize_answers boolean,
    _show_explanations boolean,
    _allow_multiple_attempts boolean,
    _show_correct_answers boolean,
    _allow_public_duplication boolean,
    _allow_team_editing boolean,
    _questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    normalized_tags text[];
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in before creating a quiz';
    end if;
    if not public.can_create_quizzes() then
        raise exception 'Quiz creation is disabled by your team settings. Ask a team owner or administrator for permission';
    end if;
    if _quiz_id is null
        or length(pg_catalog.btrim(coalesce(_title, ''))) not between 1 and 120
        or length(coalesce(_description, '')) > 1000
        or _program not in ('FLL', 'FTC', 'FRC', 'General FIRST')
        or _category not in (
            'Game Rules', 'Robot Missions', 'Engineering', 'Programming', 'CAD',
            'Electronics', 'Mechanical Design', 'Safety', 'Scouting',
            'Team Knowledge', 'Teammate Trivia', 'General Robotics'
        )
        or _visibility not in ('private', 'team', 'public')
        or _status not in ('draft', 'published')
        or _difficulty not in ('Beginner', 'Intermediate', 'Advanced', 'Expert')
        or _default_question_time_seconds not between 0 and 600 then
        raise exception 'Check the quiz details, visibility, difficulty, and default question time';
    end if;
    if _visibility = 'team' and _team_id is null then
        raise exception 'Choose a team for a team-only quiz';
    end if;
    if _team_id is not null and not public.is_team_member(_team_id) then
        raise exception 'You must belong to the selected team';
    end if;
    if coalesce(_allow_public_duplication, false) and _visibility <> 'public' then
        raise exception 'Only public quizzes can allow duplication';
    end if;
    if coalesce(pg_catalog.cardinality(_tags), 0) > 10
        or exists (
            select 1 from pg_catalog.unnest(coalesce(_tags, '{}'::text[])) as tag(value)
            where length(pg_catalog.btrim(tag.value)) not between 1 and 30
        ) then
        raise exception 'Use up to 10 tags, each between 1 and 30 characters';
    end if;

    select coalesce(pg_catalog.array_agg(distinct pg_catalog.btrim(tag.value) order by pg_catalog.btrim(tag.value)), '{}')
    into normalized_tags
    from pg_catalog.unnest(coalesce(_tags, '{}'::text[])) as tag(value);

    if _cover_image_path is not null and _cover_image_path !~
        ('^' || (select auth.uid())::text || '/' || _quiz_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
        raise exception 'The cover image is invalid';
    end if;

    insert into public.quizzes (
        id, created_by, title, description, program, category, visibility, status, difficulty,
        allow_question_preview, team_id, tags, cover_image_path, default_question_time_seconds,
        randomize_questions, randomize_answers, show_explanations, allow_multiple_attempts,
        show_correct_answers, allow_public_duplication, allow_team_editing
    )
    values (
        _quiz_id, (select auth.uid()), pg_catalog.btrim(_title), pg_catalog.btrim(coalesce(_description, '')),
        _program, _category, _visibility, _status, _difficulty, coalesce(_allow_question_preview, false),
        _team_id, normalized_tags, _cover_image_path, _default_question_time_seconds,
        coalesce(_randomize_questions, false), coalesce(_randomize_answers, false),
        coalesce(_show_explanations, true), coalesce(_allow_multiple_attempts, true),
        coalesce(_show_correct_answers, true), coalesce(_allow_public_duplication, false),
        coalesce(_allow_team_editing, false)
    );

    perform public.replace_quiz_questions(_quiz_id, _questions);
    return _quiz_id;
end;
$$;

drop function if exists public.update_quiz(uuid, text, text, text, text, text, text, text, boolean, jsonb);
create function public.update_quiz(
    _quiz_id uuid,
    _title text,
    _description text,
    _program text,
    _category text,
    _visibility text,
    _status text,
    _difficulty text,
    _allow_question_preview boolean,
    _team_id uuid,
    _tags text[],
    _cover_image_path text,
    _default_question_time_seconds integer,
    _randomize_questions boolean,
    _randomize_answers boolean,
    _show_explanations boolean,
    _allow_multiple_attempts boolean,
    _show_correct_answers boolean,
    _allow_public_duplication boolean,
    _allow_team_editing boolean,
    _questions jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    normalized_tags text[];
begin
    perform 1 from public.quizzes quiz where quiz.id = _quiz_id for update;
    if not found or not public.can_edit_quiz(_quiz_id) then
        raise exception 'You do not have permission to edit this quiz';
    end if;
    if length(pg_catalog.btrim(coalesce(_title, ''))) not between 1 and 120
        or length(coalesce(_description, '')) > 1000
        or _program not in ('FLL', 'FTC', 'FRC', 'General FIRST')
        or _category not in (
            'Game Rules', 'Robot Missions', 'Engineering', 'Programming', 'CAD',
            'Electronics', 'Mechanical Design', 'Safety', 'Scouting',
            'Team Knowledge', 'Teammate Trivia', 'General Robotics'
        )
        or _visibility not in ('private', 'team', 'public')
        or _status not in ('draft', 'published')
        or _difficulty not in ('Beginner', 'Intermediate', 'Advanced', 'Expert')
        or _default_question_time_seconds not between 0 and 600 then
        raise exception 'Check the quiz details, visibility, difficulty, and default question time';
    end if;
    if _visibility = 'team' and _team_id is null then
        raise exception 'Choose a team for a team-only quiz';
    end if;
    if _team_id is not null and not public.is_team_member(_team_id) then
        raise exception 'You must belong to the selected team';
    end if;
    if coalesce(_allow_public_duplication, false) and _visibility <> 'public' then
        raise exception 'Only public quizzes can allow duplication';
    end if;
    if coalesce(pg_catalog.cardinality(_tags), 0) > 10
        or exists (
            select 1 from pg_catalog.unnest(coalesce(_tags, '{}'::text[])) as tag(value)
            where length(pg_catalog.btrim(tag.value)) not between 1 and 30
        ) then
        raise exception 'Use up to 10 tags, each between 1 and 30 characters';
    end if;

    select coalesce(pg_catalog.array_agg(distinct pg_catalog.btrim(tag.value) order by pg_catalog.btrim(tag.value)), '{}')
    into normalized_tags
    from pg_catalog.unnest(coalesce(_tags, '{}'::text[])) as tag(value);
    if _cover_image_path is not null and _cover_image_path !~
        ('^' || (select auth.uid())::text || '/' || _quiz_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
        raise exception 'The cover image is invalid';
    end if;

    if (_status <> 'published' or _visibility = 'private') and exists (
        select 1 from public.team_quiz_assignments assignment where assignment.quiz_id = _quiz_id
    ) then
        raise exception 'Remove this quiz from team assignments before unpublishing it or making it private';
    end if;

    update public.quizzes
    set title = pg_catalog.btrim(_title),
        description = pg_catalog.btrim(coalesce(_description, '')),
        program = _program,
        category = _category,
        visibility = _visibility,
        status = _status,
        difficulty = _difficulty,
        allow_question_preview = coalesce(_allow_question_preview, false),
        team_id = _team_id,
        tags = normalized_tags,
        cover_image_path = _cover_image_path,
        default_question_time_seconds = _default_question_time_seconds,
        randomize_questions = coalesce(_randomize_questions, false),
        randomize_answers = coalesce(_randomize_answers, false),
        show_explanations = coalesce(_show_explanations, true),
        allow_multiple_attempts = coalesce(_allow_multiple_attempts, true),
        show_correct_answers = coalesce(_show_correct_answers, true),
        allow_public_duplication = coalesce(_allow_public_duplication, false),
        allow_team_editing = coalesce(_allow_team_editing, false),
        updated_at = now()
    where id = _quiz_id;

    perform public.replace_quiz_questions(_quiz_id, _questions);
end;
$$;

drop function if exists public.get_quiz_editor(uuid);
create function public.get_quiz_editor(_quiz_id uuid)
returns table (
    quiz_id uuid,
    title text,
    description text,
    program text,
    category text,
    visibility text,
    status text,
    question_id uuid,
    question_position integer,
    prompt text,
    options text[],
    correct_option_index integer,
    explanation text,
    question_type text,
    correct_option_indices integer[],
    image_path text,
    point_value integer,
    time_limit_seconds integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.can_edit_quiz(_quiz_id) then
        raise exception 'You do not have permission to edit this quiz';
    end if;

    return query
    select quiz.id, quiz.title, quiz.description, quiz.program, quiz.category, quiz.visibility, quiz.status,
        question.id, question.position, question.prompt, question.options,
        question.correct_option_index, question.explanation, question.question_type,
        question.correct_option_indices, question.image_path, question.point_value, question.time_limit_seconds
    from public.quizzes quiz
    left join public.quiz_questions question on question.quiz_id = quiz.id
    where quiz.id = _quiz_id
    order by question.position;
end;
$$;

drop function if exists public.start_quiz_attempt(uuid);
create function public.start_quiz_attempt(_quiz_id uuid)
returns table (
    attempt_id uuid,
    quiz_id uuid,
    quiz_title text,
    question_id uuid,
    question_position integer,
    prompt text,
    options text[],
    question_type text,
    image_path text,
    point_value integer,
    time_limit_seconds integer,
    show_explanations boolean,
    show_correct_answers boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_attempt_id uuid;
    question_total integer;
    selected_quiz public.quizzes%rowtype;
    source_question public.quiz_questions%rowtype;
    shuffled_options text[];
    source_positions integer[];
    shuffled_correct_indices integer[];
    position_number integer := 0;
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in before taking a quiz';
    end if;
    select quiz.* into selected_quiz
    from public.quizzes quiz
    where quiz.id = _quiz_id and quiz.status = 'published'
    for share;
    if not found or not public.can_access_quiz(_quiz_id) then
        raise exception 'This quiz is not available to your account';
    end if;
    if not selected_quiz.allow_multiple_attempts and exists (
        select 1 from public.quiz_attempts attempt
        where attempt.quiz_id = _quiz_id
            and attempt.user_id = (select auth.uid())
            and attempt.finished_at is not null
    ) then
        raise exception 'This quiz allows one completed attempt per account';
    end if;

    select pg_catalog.count(*)::integer into question_total
    from public.quiz_questions question
    where question.quiz_id = _quiz_id;
    if question_total < 1 then
        raise exception 'This quiz does not have any questions yet';
    end if;

    insert into public.quiz_attempts (
        quiz_id, user_id, total_questions, quiz_title_snapshot, show_explanations, show_correct_answers
    )
    values (
        _quiz_id, (select auth.uid()), question_total, selected_quiz.title,
        selected_quiz.show_explanations, selected_quiz.show_correct_answers
    )
    returning id into new_attempt_id;

    for source_question in
        select question.*
        from public.quiz_questions question
        where question.quiz_id = _quiz_id
        order by
            case when selected_quiz.randomize_questions then pg_catalog.random() end,
            question.position
    loop
        position_number := position_number + 1;
        select
            pg_catalog.array_agg(choice.option_value order by choice.shuffle_order),
            pg_catalog.array_agg(choice.source_position order by choice.shuffle_order)
        into shuffled_options, source_positions
        from (
            select option.value as option_value,
                option.ordinality::integer as source_position,
                case when selected_quiz.randomize_answers then pg_catalog.random()
                    else option.ordinality::double precision end as shuffle_order
            from pg_catalog.unnest(source_question.options) with ordinality as option(value, ordinality)
        ) choice;

        select pg_catalog.array_agg(mapping.new_position - 1 order by mapping.new_position)
        into shuffled_correct_indices
        from pg_catalog.unnest(source_positions) with ordinality as mapping(source_position, new_position)
        where mapping.source_position - 1 = any(source_question.correct_option_indices);

        insert into public.quiz_attempt_questions (
            attempt_id, question_id, question_position, question_type, prompt, options,
            correct_option_indices, explanation, image_path, point_value, time_limit_seconds
        )
        values (
            new_attempt_id, source_question.id, position_number, source_question.question_type,
            source_question.prompt, shuffled_options, shuffled_correct_indices,
            source_question.explanation, source_question.image_path, source_question.point_value,
            coalesce(source_question.time_limit_seconds, nullif(selected_quiz.default_question_time_seconds, 0))
        );
    end loop;

    return query
    select new_attempt_id, selected_quiz.id, selected_quiz.title,
        snapshot.question_id, snapshot.question_position, snapshot.prompt, snapshot.options,
        snapshot.question_type, snapshot.image_path, snapshot.point_value, snapshot.time_limit_seconds,
        selected_quiz.show_explanations, selected_quiz.show_correct_answers
    from public.quiz_attempt_questions snapshot
    where snapshot.attempt_id = new_attempt_id
    order by snapshot.question_position;
end;
$$;

drop function if exists public.submit_quiz_attempt(uuid, jsonb);
create function public.submit_quiz_attempt(_attempt_id uuid, _answers jsonb)
returns table (quiz_id uuid, score integer, correct_count integer, total_questions integer, finished_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
    selected_attempt public.quiz_attempts%rowtype;
    answer_record record;
    selected_indices integer[];
    question_snapshot public.quiz_attempt_questions%rowtype;
    actual_correct_count integer;
    points_earned integer;
    points_available integer;
    submitted_at timestamptz;
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in before submitting a quiz';
    end if;
    if pg_catalog.jsonb_typeof(_answers) is distinct from 'object' then
        raise exception 'Quiz answers must be submitted as an object';
    end if;

    select attempt.* into selected_attempt
    from public.quiz_attempts attempt
    where attempt.id = _attempt_id and attempt.user_id = (select auth.uid())
    for update;
    if not found then
        raise exception 'Quiz attempt not found';
    end if;
    if selected_attempt.finished_at is not null then
        raise exception 'This quiz attempt has already been submitted';
    end if;
    if pg_catalog.jsonb_object_length(_answers) <> selected_attempt.total_questions then
        raise exception 'Submit one answer for every question before finishing the quiz';
    end if;

    for answer_record in select entry.key, entry.value from pg_catalog.jsonb_each(_answers) as entry
    loop
        if answer_record.key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
            raise exception 'One or more submitted answers are invalid';
        end if;

        select snapshot.* into question_snapshot
        from public.quiz_attempt_questions snapshot
        where snapshot.attempt_id = selected_attempt.id
            and snapshot.question_id = answer_record.key::uuid;
        if not found then
            raise exception 'One or more submitted answers do not belong to this attempt';
        end if;

        if answer_record.value = 'null'::jsonb then
            continue;
        end if;

        if question_snapshot.question_type = 'multiple_select' then
            if pg_catalog.jsonb_typeof(answer_record.value) is distinct from 'array'
                or pg_catalog.jsonb_array_length(answer_record.value) < 1 then
                raise exception 'Select at least one answer for each question';
            end if;
            if exists (
                select 1
                from pg_catalog.jsonb_array_elements(answer_record.value) as selected(value)
                where pg_catalog.jsonb_typeof(selected.value) <> 'number'
                    or selected.value #>> '{}' !~ '^(0|[1-9][0-9]*)$'
                    or (selected.value #>> '{}')::integer >= pg_catalog.cardinality(question_snapshot.options)
            ) then
                raise exception 'One or more selected options are outside the answer choices';
            end if;
            select pg_catalog.array_agg(selected.value::integer order by selected.value::integer)
            into selected_indices
            from pg_catalog.jsonb_array_elements_text(answer_record.value) as selected(value);
            if pg_catalog.cardinality(selected_indices) <> (
                select pg_catalog.count(distinct selected.value)::integer
                from pg_catalog.unnest(selected_indices) as selected(value)
            ) then
                raise exception 'Duplicate answer choices are not allowed';
            end if;
        else
            if pg_catalog.jsonb_typeof(answer_record.value) <> 'number'
                or answer_record.value #>> '{}' !~ '^(0|[1-9][0-9]*)$'
                or (answer_record.value #>> '{}')::integer >= pg_catalog.cardinality(question_snapshot.options) then
                raise exception 'One or more selected options are outside the answer choices';
            end if;
            selected_indices := array[(answer_record.value #>> '{}')::integer];
        end if;
    end loop;

    insert into public.quiz_attempt_answers (
        attempt_id, question_id, selected_option_index, selected_option_indices, is_correct
    )
    select selected_attempt.id, snapshot.question_id,
        answer_indices[1], answer_indices,
        answer_indices = snapshot.correct_option_indices
    from public.quiz_attempt_questions snapshot
    cross join lateral (
        select case
            when answer.value = 'null'::jsonb then '{}'::integer[]
            when pg_catalog.jsonb_typeof(answer.value) = 'array'
                then array(
                    select selected.value::integer
                    from pg_catalog.jsonb_array_elements_text(answer.value) as selected(value)
                    order by selected.value::integer
                )
            else array[(answer.value #>> '{}')::integer]
        end as answer_indices
        from pg_catalog.jsonb_each(_answers) as answer(key, value)
        where answer.key::uuid = snapshot.question_id
    ) submitted
    where snapshot.attempt_id = selected_attempt.id;

    select
        pg_catalog.count(*) filter (where answer.is_correct)::integer,
        coalesce(pg_catalog.sum(case when answer.is_correct then snapshot.point_value else 0 end), 0)::integer,
        pg_catalog.sum(snapshot.point_value)::integer
    into actual_correct_count, points_earned, points_available
    from public.quiz_attempt_answers answer
    join public.quiz_attempt_questions snapshot
        on snapshot.attempt_id = answer.attempt_id and snapshot.question_id = answer.question_id
    where answer.attempt_id = selected_attempt.id;

    submitted_at := now();
    update public.quiz_attempts attempt
    set finished_at = submitted_at,
        correct_count = actual_correct_count,
        score = pg_catalog.floor(points_earned * 100.0 / points_available)::integer
    where attempt.id = selected_attempt.id;

    return query select selected_attempt.quiz_id,
        pg_catalog.floor(points_earned * 100.0 / points_available)::integer,
        actual_correct_count, selected_attempt.total_questions, submitted_at;
end;
$$;

drop function if exists public.get_quiz_attempt_results(uuid);
create function public.get_quiz_attempt_results(_attempt_id uuid)
returns table (
    quiz_id uuid,
    quiz_title text,
    score integer,
    correct_count integer,
    total_questions integer,
    finished_at timestamptz,
    question_id uuid,
    question_position integer,
    prompt text,
    options text[],
    selected_option_index integer,
    correct_option_index integer,
    is_correct boolean,
    explanation text,
    question_type text,
    selected_option_indices integer[],
    correct_option_indices integer[],
    image_path text,
    point_value integer,
    show_correct_answers boolean,
    show_explanations boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null or not exists (
        select 1 from public.quiz_attempts attempt
        where attempt.id = _attempt_id
            and attempt.user_id = (select auth.uid())
            and attempt.finished_at is not null
    ) then
        raise exception 'Completed quiz attempt not found';
    end if;

    return query
    select attempt.quiz_id, attempt.quiz_title_snapshot, attempt.score, attempt.correct_count,
        attempt.total_questions, attempt.finished_at, snapshot.question_id, snapshot.question_position,
        snapshot.prompt, snapshot.options, answer.selected_option_index,
        case when attempt.show_correct_answers then snapshot.correct_option_indices[1] else null end,
        case when attempt.show_correct_answers then answer.is_correct else null end,
        case when attempt.show_explanations then snapshot.explanation else '' end,
        snapshot.question_type, answer.selected_option_indices,
        case when attempt.show_correct_answers then snapshot.correct_option_indices else null end,
        snapshot.image_path, snapshot.point_value, attempt.show_correct_answers, attempt.show_explanations
    from public.quiz_attempts attempt
    join public.quizzes quiz on quiz.id = attempt.quiz_id
    join public.quiz_attempt_questions snapshot on snapshot.attempt_id = attempt.id
    left join public.quiz_attempt_answers answer
        on answer.attempt_id = snapshot.attempt_id and answer.question_id = snapshot.question_id
    where attempt.id = _attempt_id
        and attempt.user_id = (select auth.uid())
        and attempt.finished_at is not null
    order by snapshot.question_position;
end;
$$;

create or replace function public.get_home_recent_activity(_limit integer default 8)
returns table (
    activity_type text,
    attempt_id uuid,
    quiz_id uuid,
    quiz_title text,
    program text,
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
    requesting_user uuid := (select auth.uid());
begin
    if requesting_user is null then
        raise exception 'Sign in to view recent activity';
    end if;

    return query
    with recent_completed as (
        select 'completed'::text as activity_type, attempt.id as attempt_id,
            quiz.id as quiz_id, attempt.quiz_title_snapshot as quiz_title,
            quiz.program, attempt.score, attempt.correct_count, attempt.total_questions,
            attempt.finished_at as occurred_at
        from public.quiz_attempts attempt
        join public.quizzes quiz on quiz.id = attempt.quiz_id
        where attempt.user_id = requesting_user and attempt.finished_at is not null
        order by attempt.finished_at desc
        limit (least(greatest(coalesce(_limit, 8), 1), 20) + 1) / 2
    ),
    recent_created as (
        select 'created'::text as activity_type, null::uuid as attempt_id,
            quiz.id as quiz_id, quiz.title as quiz_title, quiz.program,
            null::integer as score, null::integer as correct_count,
            null::integer as total_questions, quiz.created_at as occurred_at
        from public.quizzes quiz
        where quiz.created_by = requesting_user
        order by quiz.created_at desc
        limit least(greatest(coalesce(_limit, 8), 1), 20) / 2
    )
    select activity.activity_type, activity.attempt_id, activity.quiz_id,
        activity.quiz_title, activity.program, activity.score, activity.correct_count,
        activity.total_questions, activity.occurred_at
    from (
        select * from recent_completed
        union all
        select * from recent_created
    ) activity
    order by activity.occurred_at desc
    limit least(greatest(coalesce(_limit, 8), 1), 20);
end;
$$;

drop function if exists public.get_quiz_detail(uuid);
create function public.get_quiz_detail(_quiz_id uuid)
returns table (
    quiz_id uuid,
    title text,
    description text,
    creator_display_name text,
    creator_username text,
    associated_team text,
    program text,
    category text,
    difficulty text,
    question_count integer,
    estimated_minutes integer,
    play_count bigint,
    favorite_count bigint,
    average_rating numeric,
    rating_count bigint,
    visibility text,
    status text,
    allow_question_preview boolean,
    allow_multiple_attempts boolean,
    created_at timestamptz,
    is_favorited boolean,
    my_rating integer,
    is_creator boolean,
    tags text[],
    cover_image_path text,
    is_editor boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not exists (
        select 1 from public.quizzes quiz
        where quiz.id = _quiz_id
            and (
                quiz.created_by = (select auth.uid())
                or (quiz.status = 'published' and public.can_access_quiz(quiz.id))
            )
    ) then
        raise exception 'This quiz is unavailable to your account';
    end if;

    return query
    select
        quiz.id,
        quiz.title,
        quiz.description,
        case when creator.profile_visibility = 'public'
            then creator.display_name else 'Community creator' end,
        case when creator.profile_visibility = 'public' then creator.username else null end,
        (
            select pg_catalog.string_agg(team.name, ', ' order by team.name)
            from (
                select distinct public_team.name
                from public.teams public_team
                where public_team.id = quiz.team_id and public_team.visibility = 'public'
                union
                select distinct public_team.name
                from public.team_quiz_assignments assignment
                join public.teams public_team on public_team.id = assignment.team_id
                where assignment.quiz_id = quiz.id and public_team.visibility = 'public'
            ) team
        ),
        quiz.program,
        quiz.category,
        quiz.difficulty,
        (select pg_catalog.count(*)::integer from public.quiz_questions question where question.quiz_id = quiz.id),
        pg_catalog.greatest(
            1,
            (select pg_catalog.count(*)::integer from public.quiz_questions question where question.quiz_id = quiz.id)
        ),
        (select pg_catalog.count(*) from public.quiz_attempts attempt where attempt.quiz_id = quiz.id),
        (select pg_catalog.count(*) from public.quiz_favorites favorite where favorite.quiz_id = quiz.id),
        (select pg_catalog.round(pg_catalog.avg(rating.rating)::numeric, 1)
            from public.quiz_ratings rating where rating.quiz_id = quiz.id),
        (select pg_catalog.count(*) from public.quiz_ratings rating where rating.quiz_id = quiz.id),
        quiz.visibility,
        quiz.status,
        quiz.allow_question_preview,
        quiz.allow_multiple_attempts,
        quiz.created_at,
        exists (
            select 1 from public.quiz_favorites favorite
            where favorite.quiz_id = quiz.id and favorite.user_id = (select auth.uid())
        ),
        (
            select rating.rating from public.quiz_ratings rating
            where rating.quiz_id = quiz.id and rating.user_id = (select auth.uid())
        ),
        quiz.created_by = (select auth.uid()),
        quiz.tags,
        quiz.cover_image_path,
        public.can_edit_quiz(quiz.id)
    from public.quizzes quiz
    join public.profiles creator on creator.id = quiz.created_by
    where quiz.id = _quiz_id;
end;
$$;

drop function if exists public.get_public_quiz_question_preview(uuid);
create function public.get_public_quiz_question_preview(_quiz_id uuid)
returns table (
    question_position integer,
    prompt text,
    options text[],
    image_path text,
    question_type text
)
language sql
stable
security definer
set search_path = ''
as $$
    select question.position, question.prompt, question.options, question.image_path, question.question_type
    from public.quizzes quiz
    join public.quiz_questions question on question.quiz_id = quiz.id
    where quiz.id = _quiz_id
        and quiz.status = 'published'
        and quiz.visibility = 'public'
        and quiz.allow_question_preview
    order by question.position
    limit 5;
$$;

grant select (
    team_id, tags, cover_image_path, default_question_time_seconds, randomize_questions,
    randomize_answers, show_explanations, allow_multiple_attempts, show_correct_answers,
    allow_public_duplication, allow_team_editing
) on public.quizzes to authenticated;

grant select (question_type, correct_option_indices, image_path, point_value, time_limit_seconds)
    on public.quiz_questions to authenticated;

grant select (selected_option_indices) on public.quiz_attempt_answers to authenticated;

create policy "Users can view their quiz attempt question snapshots"
    on public.quiz_attempt_questions for select to authenticated
    using (
        exists (
            select 1 from public.quiz_attempts attempt
            where attempt.id = attempt_id
                and attempt.user_id = (select auth.uid())
                and attempt.finished_at is not null
        )
    );

create or replace function public.can_read_quiz_media(_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    path_parts text[] := storage.foldername(_path);
    media_quiz_id uuid;
begin
    if path_parts is null or pg_catalog.cardinality(path_parts) < 2 then
        return false;
    end if;
    if path_parts[1] = (select auth.uid())::text then
        return true;
    end if;
    if path_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        return false;
    end if;

    media_quiz_id := path_parts[2]::uuid;
    return public.can_access_quiz(media_quiz_id)
        or exists (
            select 1
            from public.quiz_attempt_questions snapshot
            join public.quiz_attempts attempt on attempt.id = snapshot.attempt_id
            where snapshot.image_path = _path
                and attempt.user_id = (select auth.uid())
        );
end;
$$;

create or replace function public.assign_quiz_to_team(
    _team_id uuid,
    _quiz_id uuid,
    _due_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    selected_quiz public.quizzes%rowtype;
begin
    perform 1 from public.teams team where team.id = _team_id for update;
    if coalesce(public.get_team_role(_team_id), '') not in ('owner', 'administrator', 'coach') then
        raise exception 'Only team owners, administrators, and coaches can assign quizzes';
    end if;

    select quiz.* into selected_quiz
    from public.quizzes quiz
    where quiz.id = _quiz_id and quiz.status = 'published';
    if not found then
        raise exception 'Only a published quiz can be assigned';
    end if;
    if selected_quiz.visibility = 'private' then
        raise exception 'Private quizzes are only available to their creator. Change visibility to Team or Public before assigning';
    end if;
    if selected_quiz.visibility = 'team'
        and selected_quiz.created_by <> (select auth.uid())
        and not public.can_edit_quiz(_quiz_id) then
        raise exception 'Only the quiz creator or an authorized team editor can assign this quiz';
    end if;
    if _due_at is not null and _due_at <= now() then
        raise exception 'The due date must be in the future';
    end if;

    insert into public.team_quiz_assignments (team_id, quiz_id, assigned_by, due_at)
    values (_team_id, _quiz_id, (select auth.uid()), _due_at)
    on conflict (team_id, quiz_id) do update
    set assigned_by = excluded.assigned_by,
        due_at = excluded.due_at,
        assigned_at = now();
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quiz-media', 'quiz-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Quiz image access" on storage.objects;
drop policy if exists "Quiz image upload" on storage.objects;
drop policy if exists "Quiz image update" on storage.objects;
drop policy if exists "Quiz image delete" on storage.objects;

create policy "Quiz image access"
    on storage.objects for select to anon, authenticated
    using (bucket_id = 'quiz-media' and public.can_read_quiz_media(name));

create policy "Quiz image upload"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'quiz-media'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

create policy "Quiz image update"
    on storage.objects for update to authenticated
    using (
        bucket_id = 'quiz-media'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    )
    with check (
        bucket_id = 'quiz-media'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

create policy "Quiz image delete"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'quiz-media'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

revoke all on function public.consume_team_invitation_lookup_limit() from public, anon, authenticated;
revoke all on function public.can_edit_quiz(uuid) from public, anon;
revoke all on function public.can_read_quiz_media(text) from public, anon;
revoke all on function public.replace_quiz_questions(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.create_quiz(
    uuid, text, text, text, text, text, text, text, boolean, uuid, text[], text, integer,
    boolean, boolean, boolean, boolean, boolean, boolean, boolean, jsonb
) from public, anon, authenticated;
revoke all on function public.update_quiz(
    uuid, text, text, text, text, text, text, text, boolean, uuid, text[], text, integer,
    boolean, boolean, boolean, boolean, boolean, boolean, boolean, jsonb
) from public, anon, authenticated;
revoke all on function public.get_quiz_editor(uuid) from public, anon, authenticated;
revoke all on function public.start_quiz_attempt(uuid) from public, anon, authenticated;
revoke all on function public.submit_quiz_attempt(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.get_quiz_attempt_results(uuid) from public, anon, authenticated;
revoke all on function public.get_quiz_detail(uuid) from public;
revoke all on function public.get_public_quiz_question_preview(uuid) from public;
revoke all on function public.assign_quiz_to_team(uuid, uuid, timestamptz) from public, anon, authenticated;

grant execute on function public.can_edit_quiz(uuid) to authenticated;
grant execute on function public.can_read_quiz_media(text) to anon, authenticated;
grant execute on function public.create_quiz(
    uuid, text, text, text, text, text, text, text, boolean, uuid, text[], text, integer,
    boolean, boolean, boolean, boolean, boolean, boolean, boolean, jsonb
) to authenticated;
grant execute on function public.update_quiz(
    uuid, text, text, text, text, text, text, text, boolean, uuid, text[], text, integer,
    boolean, boolean, boolean, boolean, boolean, boolean, boolean, jsonb
) to authenticated;
grant execute on function public.get_quiz_editor(uuid) to authenticated;
grant execute on function public.start_quiz_attempt(uuid) to authenticated;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;
grant execute on function public.get_quiz_attempt_results(uuid) to authenticated;
grant execute on function public.get_quiz_detail(uuid) to anon, authenticated;
grant execute on function public.get_public_quiz_question_preview(uuid) to anon, authenticated;
grant execute on function public.assign_quiz_to_team(uuid, uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';
commit;
