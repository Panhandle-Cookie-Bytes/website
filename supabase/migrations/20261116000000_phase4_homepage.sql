begin;

create or replace function public.get_popular_public_quizzes(_limit integer default 6)
returns table (
    id uuid,
    title text,
    description text,
    program text,
    category text,
    visibility text,
    status text,
    created_at timestamptz,
    updated_at timestamptz,
    attempt_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
    select quiz.id, quiz.title, quiz.description, quiz.program,
        quiz.category, quiz.visibility, quiz.status, quiz.created_at, quiz.updated_at,
        count(attempt.id) as attempt_count
    from public.quizzes quiz
    left join public.quiz_attempts attempt
        on attempt.quiz_id = quiz.id and attempt.finished_at is not null
    where quiz.status = 'published' and quiz.visibility = 'public'
    group by quiz.id
    order by count(attempt.id) desc, quiz.created_at desc
    limit least(greatest(coalesce(_limit, 6), 1), 12);
$$;

create or replace function public.get_home_dashboard_stats()
returns table (
    quizzes_completed bigint,
    average_score numeric,
    correct_answers bigint,
    current_streak integer
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
        raise exception 'Sign in to view dashboard statistics';
    end if;

    return query
    with completed as (
        select attempt.score, attempt.correct_count, attempt.finished_at::date as finished_day
        from public.quiz_attempts attempt
        where attempt.user_id = requesting_user and attempt.finished_at is not null
    ),
    activity_days as (
        select distinct completed.finished_day
        from completed
    ),
    ranked_days as (
        select activity_days.finished_day,
            row_number() over (order by activity_days.finished_day desc) as day_rank
        from activity_days
    ),
    latest_day as (
        select max(activity_days.finished_day) as finished_day
        from activity_days
    ),
    totals as (
        select count(*)::bigint as quizzes_completed,
            avg(completed.score) as average_score,
            coalesce(sum(completed.correct_count), 0)::bigint as correct_answers
        from completed
    )
    select
        totals.quizzes_completed,
        totals.average_score,
        totals.correct_answers,
        case
            when latest_day.finished_day >= current_date - 1 then (
                select count(*)::integer
                from ranked_days
                where ranked_days.finished_day = latest_day.finished_day - (ranked_days.day_rank - 1)::integer
            )
            else 0
        end
    from totals
    cross join latest_day;
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
            quiz.id as quiz_id, quiz.title as quiz_title,
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
    select activity.activity_type, activity.attempt_id, activity.quiz_id, activity.quiz_title, activity.program,
        activity.score, activity.correct_count, activity.total_questions, activity.occurred_at
    from (
        select * from recent_completed
        union all
        select * from recent_created
    ) as activity
    order by activity.occurred_at desc
    limit least(greatest(coalesce(_limit, 8), 1), 20);
end;
$$;

revoke all on function public.get_popular_public_quizzes(integer) from public;
revoke all on function public.get_home_dashboard_stats() from public, anon;
revoke all on function public.get_home_recent_activity(integer) from public, anon;

grant execute on function public.get_popular_public_quizzes(integer) to anon, authenticated;
grant execute on function public.get_home_dashboard_stats() to authenticated;
grant execute on function public.get_home_recent_activity(integer) to authenticated;

notify pgrst, 'reload schema';
commit;
