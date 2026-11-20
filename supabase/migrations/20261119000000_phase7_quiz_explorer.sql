begin;

alter table public.quizzes
    add column if not exists difficulty text not null default 'Intermediate'
        check (difficulty in ('Beginner', 'Intermediate', 'Advanced', 'Expert')),
    add column if not exists allow_question_preview boolean not null default false;

update public.quizzes
set category = case
    when lower(pg_catalog.btrim(category)) in ('game rules', 'rules', 'game rule') then 'Game Rules'
    when lower(pg_catalog.btrim(category)) in ('robot missions', 'missions', 'mission strategy') then 'Robot Missions'
    when lower(pg_catalog.btrim(category)) in ('engineering', 'engineering concepts') then 'Engineering'
    when lower(pg_catalog.btrim(category)) in ('programming', 'coding', 'software') then 'Programming'
    when lower(pg_catalog.btrim(category)) = 'cad' then 'CAD'
    when lower(pg_catalog.btrim(category)) in ('electronics', 'electrical') then 'Electronics'
    when lower(pg_catalog.btrim(category)) in ('mechanical design', 'mechanical', 'robot design') then 'Mechanical Design'
    when lower(pg_catalog.btrim(category)) = 'safety' then 'Safety'
    when lower(pg_catalog.btrim(category)) = 'scouting' then 'Scouting'
    when lower(pg_catalog.btrim(category)) in ('team knowledge', 'team') then 'Team Knowledge'
    when lower(pg_catalog.btrim(category)) in ('teammate trivia', 'trivia') then 'Teammate Trivia'
    else 'General Robotics'
end;

alter table public.quizzes drop constraint if exists quizzes_category_check;
alter table public.quizzes
    add constraint quizzes_category_check check (category in (
        'Game Rules', 'Robot Missions', 'Engineering', 'Programming', 'CAD',
        'Electronics', 'Mechanical Design', 'Safety', 'Scouting',
        'Team Knowledge', 'Teammate Trivia', 'General Robotics'
    ));
grant select (difficulty, allow_question_preview) on public.quizzes to authenticated;

create table public.quiz_favorites (
    user_id uuid not null references public.profiles (id) on delete cascade,
    quiz_id uuid not null references public.quizzes (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, quiz_id)
);

create table public.quiz_ratings (
    user_id uuid not null references public.profiles (id) on delete cascade,
    quiz_id uuid not null references public.quizzes (id) on delete cascade,
    rating integer not null check (rating between 1 and 5),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, quiz_id)
);

create index quiz_favorites_quiz_idx on public.quiz_favorites (quiz_id);
create index quiz_ratings_quiz_idx on public.quiz_ratings (quiz_id);

alter table public.quiz_favorites enable row level security;
alter table public.quiz_ratings enable row level security;
revoke all on public.quiz_favorites, public.quiz_ratings from public, anon, authenticated;

drop function if exists public.create_quiz(text, text, text, text, text, text, jsonb);
create function public.create_quiz(
    _title text,
    _description text,
    _program text,
    _category text,
    _visibility text,
    _status text,
    _difficulty text,
    _allow_question_preview boolean,
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
        or _category not in (
            'Game Rules', 'Robot Missions', 'Engineering', 'Programming', 'CAD',
            'Electronics', 'Mechanical Design', 'Safety', 'Scouting',
            'Team Knowledge', 'Teammate Trivia', 'General Robotics'
        )
        or _visibility not in ('private', 'public')
        or _status not in ('draft', 'published')
        or _difficulty not in ('Beginner', 'Intermediate', 'Advanced', 'Expert') then
        raise exception 'Check the quiz title, description, program, category, visibility, status, and difficulty';
    end if;

    insert into public.quizzes (
        created_by, title, description, program, category, visibility, status, difficulty, allow_question_preview
    )
    values (
        (select auth.uid()),
        pg_catalog.btrim(_title),
        pg_catalog.btrim(coalesce(_description, '')),
        _program,
        _category,
        _visibility,
        _status,
        _difficulty,
        coalesce(_allow_question_preview, false)
    )
    returning id into new_quiz_id;

    perform public.replace_quiz_questions(new_quiz_id, _questions);
    return new_quiz_id;
end;
$$;

drop function if exists public.update_quiz(uuid, text, text, text, text, text, text, jsonb);
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
        or _category not in (
            'Game Rules', 'Robot Missions', 'Engineering', 'Programming', 'CAD',
            'Electronics', 'Mechanical Design', 'Safety', 'Scouting',
            'Team Knowledge', 'Teammate Trivia', 'General Robotics'
        )
        or _visibility not in ('private', 'public')
        or _status not in ('draft', 'published')
        or _difficulty not in ('Beginner', 'Intermediate', 'Advanced', 'Expert') then
        raise exception 'Check the quiz title, description, program, category, visibility, status, and difficulty';
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
        category = _category,
        visibility = _visibility,
        status = _status,
        difficulty = _difficulty,
        allow_question_preview = coalesce(_allow_question_preview, false),
        updated_at = now()
    where id = _quiz_id;

    perform public.replace_quiz_questions(_quiz_id, _questions);
end;
$$;

create or replace function public.get_quiz_explorer(
    _program text default null,
    _category text default null,
    _difficulty text default null,
    _search text default null,
    _sort text default 'most_popular',
    _limit integer default 24,
    _offset integer default 0
)
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
    created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    sort_order text := coalesce(_sort, 'most_popular');
begin
    if sort_order not in ('most_popular', 'highest_rated', 'recent', 'most_played', 'shortest') then
        raise exception 'Choose a valid quiz sort order';
    end if;

    return query
    with explorer_quizzes as (
        select
            quiz.id,
            quiz.title,
            quiz.description,
            case when creator.profile_visibility = 'public'
                then creator.display_name else 'Community creator' end as creator_display_name,
            case when creator.profile_visibility = 'public'
                then creator.username else null end as creator_username,
            (
                select pg_catalog.string_agg(public_team.name, ', ' order by public_team.name)
                from (
                    select distinct team.name
                    from public.team_quiz_assignments assignment
                    join public.teams team on team.id = assignment.team_id
                    where assignment.quiz_id = quiz.id and team.visibility = 'public'
                ) public_team
            ) as associated_team,
            quiz.program,
            quiz.category,
            quiz.difficulty,
            (select pg_catalog.count(*)::integer
                from public.quiz_questions question where question.quiz_id = quiz.id) as question_count,
            quiz.created_at,
            (select pg_catalog.count(*)
                from public.quiz_attempts attempt where attempt.quiz_id = quiz.id) as play_count,
            (select pg_catalog.count(*)
                from public.quiz_favorites favorite where favorite.quiz_id = quiz.id) as favorite_count,
            (select pg_catalog.round(pg_catalog.avg(rating.rating)::numeric, 1)
                from public.quiz_ratings rating where rating.quiz_id = quiz.id) as average_rating,
            (select pg_catalog.count(*)
                from public.quiz_ratings rating where rating.quiz_id = quiz.id) as rating_count
        from public.quizzes quiz
        join public.profiles creator on creator.id = quiz.created_by
        where quiz.status = 'published' and quiz.visibility = 'public'
    )
    select
        found_quiz.id,
        found_quiz.title,
        found_quiz.description,
        found_quiz.creator_display_name,
        found_quiz.creator_username,
        found_quiz.associated_team,
        found_quiz.program,
        found_quiz.category,
        found_quiz.difficulty,
        found_quiz.question_count,
        found_quiz.question_count,
        found_quiz.play_count,
        found_quiz.favorite_count,
        found_quiz.average_rating,
        found_quiz.rating_count,
        found_quiz.created_at
    from explorer_quizzes found_quiz
    where (_program is null or found_quiz.program = _program)
        and (_category is null or found_quiz.category = _category)
        and (_difficulty is null or found_quiz.difficulty = _difficulty)
        and (
            nullif(pg_catalog.btrim(coalesce(_search, '')), '') is null
            or found_quiz.title ilike '%' || pg_catalog.btrim(_search) || '%'
            or found_quiz.description ilike '%' || pg_catalog.btrim(_search) || '%'
            or found_quiz.category ilike '%' || pg_catalog.btrim(_search) || '%'
            or found_quiz.program ilike '%' || pg_catalog.btrim(_search) || '%'
            or found_quiz.creator_display_name ilike '%' || pg_catalog.btrim(_search) || '%'
            or coalesce(found_quiz.associated_team, '') ilike '%' || pg_catalog.btrim(_search) || '%'
        )
    order by
        case when sort_order = 'most_popular' then found_quiz.favorite_count end desc,
        case when sort_order in ('most_popular', 'highest_rated') then found_quiz.average_rating end desc nulls last,
        case when sort_order in ('most_popular', 'highest_rated', 'most_played') then found_quiz.play_count end desc,
        case when sort_order = 'recent' then found_quiz.created_at end desc,
        case when sort_order = 'shortest' then found_quiz.question_count end asc,
        found_quiz.created_at desc,
        found_quiz.id
    limit least(greatest(coalesce(_limit, 24), 1), 60)
    offset greatest(coalesce(_offset, 0), 0);
end;
$$;

create or replace function public.get_quiz_detail(_quiz_id uuid)
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
    created_at timestamptz,
    is_favorited boolean,
    my_rating integer,
    is_creator boolean
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
                or (
                    quiz.status = 'published'
                    and (
                        quiz.visibility = 'public'
                        or public.can_access_quiz(quiz.id)
                    )
                )
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
            select pg_catalog.string_agg(public_team.name, ', ' order by public_team.name)
            from (
                select distinct team.name
                from public.team_quiz_assignments assignment
                join public.teams team on team.id = assignment.team_id
                where assignment.quiz_id = quiz.id and team.visibility = 'public'
            ) public_team
        ),
        quiz.program,
        quiz.category,
        quiz.difficulty,
        (select pg_catalog.count(*)::integer from public.quiz_questions question where question.quiz_id = quiz.id),
        (select pg_catalog.count(*)::integer from public.quiz_questions question where question.quiz_id = quiz.id),
        (select pg_catalog.count(*) from public.quiz_attempts attempt where attempt.quiz_id = quiz.id),
        (select pg_catalog.count(*) from public.quiz_favorites favorite where favorite.quiz_id = quiz.id),
        (select pg_catalog.round(pg_catalog.avg(rating.rating)::numeric, 1)
            from public.quiz_ratings rating where rating.quiz_id = quiz.id),
        (select pg_catalog.count(*) from public.quiz_ratings rating where rating.quiz_id = quiz.id),
        quiz.visibility,
        quiz.status,
        quiz.allow_question_preview,
        quiz.created_at,
        exists (
            select 1 from public.quiz_favorites favorite
            where favorite.quiz_id = quiz.id and favorite.user_id = (select auth.uid())
        ),
        (
            select rating.rating from public.quiz_ratings rating
            where rating.quiz_id = quiz.id and rating.user_id = (select auth.uid())
        ),
        quiz.created_by = (select auth.uid())
    from public.quizzes quiz
    join public.profiles creator on creator.id = quiz.created_by
    where quiz.id = _quiz_id;
end;
$$;

create or replace function public.get_public_quiz_question_preview(_quiz_id uuid)
returns table (
    question_position integer,
    prompt text,
    options text[]
)
language sql
stable
security definer
set search_path = ''
as $$
    select question.position, question.prompt, question.options
    from public.quizzes quiz
    join public.quiz_questions question on question.quiz_id = quiz.id
    where quiz.id = _quiz_id
        and quiz.status = 'published'
        and quiz.visibility = 'public'
        and quiz.allow_question_preview
    order by question.position
    limit 5;
$$;

create or replace function public.set_quiz_favorite(_quiz_id uuid, _favorited boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in to save quizzes to favorites';
    end if;
    if not exists (
        select 1 from public.quizzes quiz
        where quiz.id = _quiz_id and quiz.status = 'published'
            and (quiz.visibility = 'public' or public.can_access_quiz(quiz.id))
    ) then
        raise exception 'This quiz is unavailable to your account';
    end if;

    if coalesce(_favorited, false) then
        insert into public.quiz_favorites (user_id, quiz_id)
        values ((select auth.uid()), _quiz_id)
        on conflict (user_id, quiz_id) do nothing;
    else
        delete from public.quiz_favorites
        where user_id = (select auth.uid()) and quiz_id = _quiz_id;
    end if;
end;
$$;

create or replace function public.rate_public_quiz(_quiz_id uuid, _rating integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in to rate a quiz';
    end if;
    if _rating is null or _rating not between 1 and 5 then
        raise exception 'Choose a rating from 1 to 5';
    end if;
    if not exists (
        select 1 from public.quizzes quiz
        where quiz.id = _quiz_id and quiz.status = 'published' and quiz.visibility = 'public'
    ) then
        raise exception 'Only public published quizzes can be rated';
    end if;

    insert into public.quiz_ratings (user_id, quiz_id, rating)
    values ((select auth.uid()), _quiz_id, _rating)
    on conflict (user_id, quiz_id) do update
    set rating = excluded.rating, updated_at = now();
end;
$$;

revoke all on function public.create_quiz(text, text, text, text, text, text, text, boolean, jsonb)
    from public, anon, authenticated;
revoke all on function public.update_quiz(uuid, text, text, text, text, text, text, text, boolean, jsonb)
    from public, anon, authenticated;
revoke all on function public.get_quiz_explorer(text, text, text, text, text, integer, integer)
    from public;
revoke all on function public.get_quiz_detail(uuid) from public;
revoke all on function public.get_public_quiz_question_preview(uuid) from public;
revoke all on function public.set_quiz_favorite(uuid, boolean) from public, anon, authenticated;
revoke all on function public.rate_public_quiz(uuid, integer) from public, anon, authenticated;

grant execute on function public.create_quiz(text, text, text, text, text, text, text, boolean, jsonb)
    to authenticated;
grant execute on function public.update_quiz(uuid, text, text, text, text, text, text, text, boolean, jsonb)
    to authenticated;
grant execute on function public.get_quiz_explorer(text, text, text, text, text, integer, integer)
    to anon, authenticated;
grant execute on function public.get_quiz_detail(uuid) to anon, authenticated;
grant execute on function public.get_public_quiz_question_preview(uuid) to anon, authenticated;
grant execute on function public.set_quiz_favorite(uuid, boolean) to authenticated;
grant execute on function public.rate_public_quiz(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
commit;
