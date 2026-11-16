begin;

create table public.quizzes (
    id uuid primary key default pg_catalog.gen_random_uuid(),
    created_by uuid not null references public.profiles (id) on delete cascade,
    title text not null check (length(pg_catalog.btrim(title)) between 1 and 120),
    description text not null default '' check (length(description) <= 1000),
    program text not null check (program in ('FLL', 'FTC', 'FRC', 'General FIRST')),
    category text not null check (length(pg_catalog.btrim(category)) between 1 and 80),
    visibility text not null default 'private' check (visibility in ('private', 'public')),
    status text not null default 'draft' check (status in ('draft', 'published')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index quizzes_creator_idx on public.quizzes (created_by, updated_at desc);
create index quizzes_discovery_idx on public.quizzes (program, category, created_at desc)
    where status = 'published' and visibility = 'public';

create table public.quiz_questions (
    id uuid primary key default pg_catalog.gen_random_uuid(),
    quiz_id uuid not null references public.quizzes (id) on delete cascade,
    position integer not null check (position between 1 and 50),
    prompt text not null check (length(pg_catalog.btrim(prompt)) between 1 and 500),
    options text[] not null check (
        pg_catalog.cardinality(options) between 2 and 6
        and array_position(options, null) is null
    ),
    correct_option_index integer not null check (
        correct_option_index >= 0 and correct_option_index < pg_catalog.cardinality(options)
    ),
    explanation text not null default '' check (length(explanation) <= 1000),
    created_at timestamptz not null default now(),
    unique (quiz_id, position)
);

create table public.team_quiz_assignments (
    team_id uuid not null references public.teams (id) on delete cascade,
    quiz_id uuid not null references public.quizzes (id) on delete cascade,
    assigned_by uuid not null references public.profiles (id) on delete cascade,
    due_at timestamptz,
    assigned_at timestamptz not null default now(),
    primary key (team_id, quiz_id)
);

create index team_quiz_assignments_quiz_idx on public.team_quiz_assignments (quiz_id);

create table public.quiz_attempts (
    id uuid primary key default pg_catalog.gen_random_uuid(),
    quiz_id uuid not null references public.quizzes (id) on delete restrict,
    user_id uuid not null references public.profiles (id) on delete cascade,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    score integer check (score is null or score between 0 and 100),
    correct_count integer check (correct_count is null or correct_count >= 0),
    total_questions integer not null check (total_questions between 1 and 50)
);

create index quiz_attempts_user_idx on public.quiz_attempts (user_id, started_at desc);
create index quiz_attempts_quiz_idx on public.quiz_attempts (quiz_id, started_at desc);

create table public.quiz_attempt_answers (
    attempt_id uuid not null references public.quiz_attempts (id) on delete cascade,
    question_id uuid not null,
    selected_option_index integer not null check (selected_option_index >= 0),
    is_correct boolean not null,
    primary key (attempt_id, question_id)
);

create or replace function public.can_access_quiz(_quiz_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.quizzes q
        where q.id = _quiz_id
            and (
                q.created_by = (select auth.uid())
                or (
                    q.status = 'published'
                    and (
                        q.visibility = 'public'
                        or exists (
                            select 1
                            from public.team_quiz_assignments a
                            join public.team_members tm on tm.team_id = a.team_id
                            where a.quiz_id = q.id
                                and tm.user_id = (select auth.uid())
                        )
                    )
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
    correct_index_text text;
    correct_index integer;
    question_position integer;
    option_count integer;
begin
    if pg_catalog.jsonb_typeof(_questions) is distinct from 'array' then
        raise exception 'A quiz must contain between 1 and 50 questions';
    end if;
    if pg_catalog.jsonb_array_length(_questions) not between 1 and 50 then
        raise exception 'A quiz must contain between 1 and 50 questions';
    end if;

    delete from public.quiz_questions q where q.quiz_id = _quiz_id;

    for question_record in
        select item.value, item.ordinality
        from pg_catalog.jsonb_array_elements(_questions) with ordinality as item(value, ordinality)
        order by item.ordinality
    loop
        question_data := question_record.value;
        question_position := question_record.ordinality::integer;

        if pg_catalog.jsonb_typeof(question_data) <> 'object'
            or pg_catalog.jsonb_typeof(question_data -> 'prompt') <> 'string'
            or length(pg_catalog.btrim(question_data ->> 'prompt')) not between 1 and 500
            or pg_catalog.jsonb_typeof(question_data -> 'correct_index') <> 'number' then
            raise exception 'Question % has invalid question text, options, or correct answer', question_position;
        end if;

        if pg_catalog.jsonb_typeof(question_data -> 'options') is distinct from 'array' then
            raise exception 'Question % must have between 2 and 6 non-empty answer options', question_position;
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

        correct_index_text := question_data ->> 'correct_index';
        if correct_index_text !~ '^(0|[1-9][0-9]*)$' then
            raise exception 'Question % has an invalid correct answer', question_position;
        end if;
        correct_index := correct_index_text::integer;
        if correct_index >= option_count then
            raise exception 'Question % has a correct answer outside its options', question_position;
        end if;

        if question_data ? 'explanation'
            and (pg_catalog.jsonb_typeof(question_data -> 'explanation') <> 'string'
                or length(question_data ->> 'explanation') > 1000) then
            raise exception 'Question % has an invalid explanation', question_position;
        end if;

        insert into public.quiz_questions (
            quiz_id, position, prompt, options, correct_option_index, explanation
        )
        values (
            _quiz_id,
            question_position,
            pg_catalog.btrim(question_data ->> 'prompt'),
            array(
                select pg_catalog.btrim(option_item.value #>> '{}')
                from pg_catalog.jsonb_array_elements(question_data -> 'options')
                    with ordinality as option_item(value, ordinality)
                order by option_item.ordinality
            ),
            correct_index,
            pg_catalog.btrim(coalesce(question_data ->> 'explanation', ''))
        );
    end loop;
end;
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

create or replace function public.update_quiz(
    _quiz_id uuid,
    _title text,
    _description text,
    _program text,
    _category text,
    _visibility text,
    _status text,
    _questions jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null or not exists (
        select 1 from public.quizzes q
        where q.id = _quiz_id and q.created_by = (select auth.uid())
    ) then
        raise exception 'Only the quiz creator can edit this quiz';
    end if;
    if length(pg_catalog.btrim(coalesce(_title, ''))) not between 1 and 120
        or length(coalesce(_description, '')) > 1000
        or _program not in ('FLL', 'FTC', 'FRC', 'General FIRST')
        or length(pg_catalog.btrim(coalesce(_category, ''))) not between 1 and 80
        or _visibility not in ('private', 'public')
        or _status not in ('draft', 'published') then
        raise exception 'Check the quiz title, description, program, category, visibility, and status';
    end if;

    perform 1 from public.quizzes q where q.id = _quiz_id for update;
    if exists (select 1 from public.quiz_attempts a where a.quiz_id = _quiz_id) then
        raise exception 'This quiz already has attempts and its questions can no longer be changed';
    end if;
    if _status <> 'published' and exists (
        select 1 from public.team_quiz_assignments a where a.quiz_id = _quiz_id
    ) then
        raise exception 'Remove this quiz from team assignments before unpublishing it';
    end if;

    update public.quizzes
    set title = pg_catalog.btrim(_title),
        description = pg_catalog.btrim(coalesce(_description, '')),
        program = _program,
        category = pg_catalog.btrim(_category),
        visibility = _visibility,
        status = _status,
        updated_at = now()
    where id = _quiz_id;

    perform public.replace_quiz_questions(_quiz_id, _questions);
end;
$$;

create or replace function public.get_quiz_editor(_quiz_id uuid)
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
    explanation text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null or not exists (
        select 1 from public.quizzes q
        where q.id = _quiz_id and q.created_by = (select auth.uid())
    ) then
        raise exception 'Only the quiz creator can edit this quiz';
    end if;

    return query
    select q.id, q.title, q.description, q.program, q.category, q.visibility, q.status,
        question.id, question.position, question.prompt, question.options,
        question.correct_option_index, question.explanation
    from public.quizzes q
    left join public.quiz_questions question on question.quiz_id = q.id
    where q.id = _quiz_id
    order by question.position;
end;
$$;

create or replace function public.start_quiz_attempt(_quiz_id uuid)
returns table (
    attempt_id uuid,
    quiz_id uuid,
    quiz_title text,
    question_id uuid,
    question_position integer,
    prompt text,
    options text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_attempt_id uuid;
    question_total integer;
    selected_quiz public.quizzes%rowtype;
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in before taking a quiz';
    end if;
    select q.* into selected_quiz
    from public.quizzes q
    where q.id = _quiz_id and q.status = 'published'
    for share;
    if not found or not public.can_access_quiz(_quiz_id) then
        raise exception 'This quiz is not available to your account';
    end if;

    select count(*) into question_total
    from public.quiz_questions question
    where question.quiz_id = _quiz_id;
    if question_total < 1 then
        raise exception 'This quiz does not have any questions yet';
    end if;

    insert into public.quiz_attempts (quiz_id, user_id, total_questions)
    values (_quiz_id, (select auth.uid()), question_total)
    returning id into new_attempt_id;

    return query
    select new_attempt_id, selected_quiz.id, selected_quiz.title,
        question.id, question.position, question.prompt, question.options
    from public.quiz_questions question
    where question.quiz_id = _quiz_id
    order by question.position;
end;
$$;

create or replace function public.submit_quiz_attempt(_attempt_id uuid, _answers jsonb)
returns table (quiz_id uuid, score integer, correct_count integer, total_questions integer, finished_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
    selected_attempt public.quiz_attempts%rowtype;
    answer_record record;
    question_record public.quiz_questions%rowtype;
    selected_index integer;
    actual_correct_count integer;
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
        if answer_record.key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            or pg_catalog.jsonb_typeof(answer_record.value) <> 'number'
            or answer_record.value #>> '{}' !~ '^(0|[1-9][0-9]*)$' then
            raise exception 'One or more submitted answers are invalid';
        end if;

        select question.* into question_record
        from public.quiz_questions question
        where question.id = answer_record.key::uuid
            and question.quiz_id = selected_attempt.quiz_id;
        if not found then
            raise exception 'One or more submitted answers do not belong to this quiz';
        end if;

        selected_index := (answer_record.value #>> '{}')::integer;
        if selected_index >= pg_catalog.cardinality(question_record.options) then
            raise exception 'One or more selected options are outside the answer choices';
        end if;
    end loop;

    insert into public.quiz_attempt_answers (attempt_id, question_id, selected_option_index, is_correct)
    select selected_attempt.id, question.id, (answer_entry.value #>> '{}')::integer,
        (answer_entry.value #>> '{}')::integer = question.correct_option_index
    from pg_catalog.jsonb_each(_answers) as answer_entry
    join public.quiz_questions question
        on question.id = answer_entry.key::uuid and question.quiz_id = selected_attempt.quiz_id;

    select count(*) filter (where answer.is_correct)::integer
    into actual_correct_count
    from public.quiz_attempt_answers answer
    where answer.attempt_id = selected_attempt.id;

    submitted_at := now();
    update public.quiz_attempts attempt
    set finished_at = submitted_at,
        correct_count = actual_correct_count,
        score = pg_catalog.floor(actual_correct_count * 100.0 / selected_attempt.total_questions)::integer
    where attempt.id = selected_attempt.id;

    return query select selected_attempt.quiz_id,
        pg_catalog.floor(actual_correct_count * 100.0 / selected_attempt.total_questions)::integer,
        actual_correct_count, selected_attempt.total_questions, submitted_at;
end;
$$;

create or replace function public.get_quiz_attempt_results(_attempt_id uuid)
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
    explanation text
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
    select attempt.quiz_id, quiz.title, attempt.score, attempt.correct_count,
        attempt.total_questions, attempt.finished_at,
        question.id, question.position, question.prompt, question.options,
        answer.selected_option_index, question.correct_option_index, answer.is_correct,
        question.explanation
    from public.quiz_attempts attempt
    join public.quizzes quiz on quiz.id = attempt.quiz_id
    join public.quiz_questions question on question.quiz_id = quiz.id
    left join public.quiz_attempt_answers answer
        on answer.attempt_id = attempt.id and answer.question_id = question.id
    where attempt.id = _attempt_id
        and attempt.user_id = (select auth.uid())
        and attempt.finished_at is not null
    order by question.position;
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
    team_role text;
    selected_quiz public.quizzes%rowtype;
begin
    perform 1 from public.teams team where team.id = _team_id for update;
    team_role := public.get_team_role(_team_id);
    if team_role is null or team_role not in ('owner', 'administrator', 'coach') then
        raise exception 'Only team owners, administrators, and coaches can assign quizzes';
    end if;

    select quiz.* into selected_quiz
    from public.quizzes quiz
    where quiz.id = _quiz_id and quiz.status = 'published';
    if not found then
        raise exception 'Only a published quiz can be assigned';
    end if;
    if selected_quiz.visibility <> 'public'
        and selected_quiz.created_by <> (select auth.uid()) then
        raise exception 'You can assign public quizzes or quizzes you created';
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

create or replace function public.remove_quiz_assignment(_team_id uuid, _quiz_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if coalesce(public.get_team_role(_team_id), '') not in ('owner', 'administrator', 'coach') then
        raise exception 'Only team owners, administrators, and coaches can manage quiz assignments';
    end if;
    delete from public.team_quiz_assignments
    where team_id = _team_id and quiz_id = _quiz_id;
end;
$$;

alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.team_quiz_assignments enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_attempt_answers enable row level security;

revoke all on public.quizzes, public.quiz_questions, public.team_quiz_assignments,
    public.quiz_attempts, public.quiz_attempt_answers from public, anon, authenticated;

grant select (id, created_by, title, description, program, category, visibility, status, created_at, updated_at)
    on public.quizzes to authenticated;
grant select (team_id, quiz_id, assigned_by, due_at, assigned_at)
    on public.team_quiz_assignments to authenticated;
grant select (id, quiz_id, user_id, started_at, finished_at, score, correct_count, total_questions)
    on public.quiz_attempts to authenticated;
grant select (attempt_id, question_id, selected_option_index, is_correct)
    on public.quiz_attempt_answers to authenticated;

create policy "Users can view accessible published quizzes and their own"
    on public.quizzes for select to authenticated
    using (public.can_access_quiz(id));

create policy "Team members can view their quiz assignments"
    on public.team_quiz_assignments for select to authenticated
    using (public.is_team_member(team_id));

create policy "Users can view their own quiz attempts"
    on public.quiz_attempts for select to authenticated
    using (user_id = (select auth.uid()));

create policy "Users can view their own quiz attempt answers"
    on public.quiz_attempt_answers for select to authenticated
    using (
        exists (
            select 1 from public.quiz_attempts attempt
            where attempt.id = attempt_id
                and attempt.user_id = (select auth.uid())
                and attempt.finished_at is not null
        )
    );

revoke all on function public.can_access_quiz(uuid) from public, anon;
revoke all on function public.replace_quiz_questions(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.create_quiz(text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.update_quiz(uuid, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.get_quiz_editor(uuid) from public, anon, authenticated;
revoke all on function public.start_quiz_attempt(uuid) from public, anon, authenticated;
revoke all on function public.submit_quiz_attempt(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.get_quiz_attempt_results(uuid) from public, anon, authenticated;
revoke all on function public.assign_quiz_to_team(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.remove_quiz_assignment(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_access_quiz(uuid) to authenticated;
grant execute on function public.create_quiz(text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.update_quiz(uuid, text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.get_quiz_editor(uuid) to authenticated;
grant execute on function public.start_quiz_attempt(uuid) to authenticated;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;
grant execute on function public.get_quiz_attempt_results(uuid) to authenticated;
grant execute on function public.assign_quiz_to_team(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.remove_quiz_assignment(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
