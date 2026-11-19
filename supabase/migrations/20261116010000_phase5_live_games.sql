begin;

create table public.live_games (
    id uuid primary key default pg_catalog.gen_random_uuid(),
    quiz_id uuid not null references public.quizzes (id) on delete restrict,
    status text not null default 'lobby'
        check (status in ('lobby', 'running', 'completed', 'cancelled')),
    current_question_position integer not null default 0 check (current_question_position >= 0),
    question_started_at timestamptz,
    question_deadline timestamptz,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '12 hours'),
    finished_at timestamptz,
    updated_at timestamptz not null default now()
);

create index live_games_quiz_idx on public.live_games (quiz_id);

create table public.live_game_secrets (
    game_id uuid primary key references public.live_games (id) on delete cascade,
    host_user_id uuid not null references public.profiles (id) on delete restrict,
    join_code text not null unique check (join_code ~ '^[A-F0-9]{16}$')
);

create index live_game_secrets_host_idx on public.live_game_secrets (host_user_id, game_id);

create table public.live_game_players (
    id uuid primary key default pg_catalog.gen_random_uuid(),
    game_id uuid not null references public.live_games (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    display_name text not null,
    score integer not null default 0 check (score >= 0),
    current_streak integer not null default 0 check (current_streak >= 0),
    joined_at timestamptz not null default now(),
    unique (game_id, user_id),
    unique (id, game_id)
);

create index live_game_players_game_idx
    on public.live_game_players (game_id, score desc, joined_at);

create table public.live_game_questions (
    id uuid primary key default pg_catalog.gen_random_uuid(),
    game_id uuid not null references public.live_games (id) on delete cascade,
    position integer not null check (position between 1 and 50),
    prompt text not null,
    options text[] not null,
    correct_option_index integer not null,
    unique (game_id, position),
    unique (id, game_id),
    check (
        pg_catalog.cardinality(options) between 2 and 6
        and correct_option_index >= 0
        and correct_option_index < pg_catalog.cardinality(options)
    )
);

create table public.live_game_answers (
    game_id uuid not null,
    player_id uuid not null,
    question_id uuid not null,
    selected_option_index integer not null check (selected_option_index >= 0),
    is_correct boolean not null,
    score_awarded integer not null check (score_awarded >= 0),
    answered_at timestamptz not null default now(),
    primary key (player_id, question_id),
    foreign key (player_id, game_id)
        references public.live_game_players (id, game_id) on delete cascade,
    foreign key (question_id, game_id)
        references public.live_game_questions (id, game_id) on delete cascade
);

create index live_game_answers_game_idx on public.live_game_answers (game_id, question_id);

alter table public.live_games enable row level security;
alter table public.live_game_secrets enable row level security;
alter table public.live_game_players enable row level security;
alter table public.live_game_questions enable row level security;
alter table public.live_game_answers enable row level security;

revoke all on public.live_games, public.live_game_secrets, public.live_game_players,
    public.live_game_questions, public.live_game_answers from public, anon, authenticated;

grant select (
    id, quiz_id, status, current_question_position, question_started_at,
    question_deadline, created_at, expires_at, finished_at, updated_at
) on public.live_games to authenticated;

create or replace function public.is_live_game_member(_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.live_games g
        join public.live_game_secrets s on s.game_id = g.id
        where g.id = _game_id
            and (
                s.host_user_id = (select auth.uid())
                or exists (
                    select 1
                    from public.live_game_players p
                    where p.game_id = g.id and p.user_id = (select auth.uid())
                )
            )
    );
$$;

create policy "Game hosts and players can view safe room state"
    on public.live_games for select to authenticated
    using (public.is_live_game_member(id));

create or replace function public.create_live_game(_quiz_id uuid)
returns table (game_id uuid, join_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_game_id uuid := pg_catalog.gen_random_uuid();
    new_join_code text := pg_catalog.upper(
        pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16)
    );
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

create or replace function public.join_live_game(_join_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    target_game public.live_games%rowtype;
    member_display_name text;
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in to join a live game';
    end if;

    select g.* into target_game
    from public.live_games g
    join public.live_game_secrets s on s.game_id = g.id
    where s.join_code = pg_catalog.upper(pg_catalog.btrim(_join_code))
    for update of g;

    if not found or target_game.status <> 'lobby' or target_game.expires_at <= now() then
        raise exception 'This game code is invalid or the lobby is closed';
    end if;
    if not public.can_access_quiz(target_game.quiz_id) then
        raise exception 'You do not have access to this quiz';
    end if;

    select p.display_name into member_display_name
    from public.profiles p
    where p.id = (select auth.uid());
    if member_display_name is null or pg_catalog.length(pg_catalog.btrim(member_display_name)) = 0 then
        raise exception 'Complete your profile display name before joining a game';
    end if;

    insert into public.live_game_players (game_id, user_id, display_name)
    values (target_game.id, (select auth.uid()), pg_catalog.btrim(member_display_name))
    on conflict (game_id, user_id) do nothing;

    update public.live_games set updated_at = now() where id = target_game.id;
    return target_game.id;
end;
$$;

create or replace function public.get_live_game_snapshot(_game_id uuid)
returns table (
    game_id uuid,
    quiz_id uuid,
    quiz_title text,
    host_display_name text,
    is_host boolean,
    join_code text,
    status text,
    current_question_position integer,
    question_count integer,
    question_prompt text,
    question_options text[],
    question_started_at timestamptz,
    question_deadline timestamptz,
    player_display_name text,
    player_score integer,
    player_streak integer,
    is_current_user boolean,
    has_answered_current_question boolean,
    own_selected_option_index integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null or not public.is_live_game_member(_game_id) then
        raise exception 'This game is unavailable to your account';
    end if;

    return query
    select
        g.id,
        g.quiz_id,
        qz.title,
        host_profile.display_name,
        secret.host_user_id = (select auth.uid()),
        case when secret.host_user_id = (select auth.uid()) then secret.join_code else null end,
        g.status,
        g.current_question_position,
        (select pg_catalog.count(*)::integer from public.live_game_questions qcount where qcount.game_id = g.id),
        question.prompt,
        question.options,
        g.question_started_at,
        g.question_deadline,
        player.display_name,
        player.score,
        player.current_streak,
        coalesce(player.user_id = (select auth.uid()), false),
        (answer.player_id is not null),
        case when player.user_id = (select auth.uid()) then answer.selected_option_index else null end
    from public.live_games g
    join public.quizzes qz on qz.id = g.quiz_id
    join public.live_game_secrets secret on secret.game_id = g.id
    join public.profiles host_profile on host_profile.id = secret.host_user_id
    left join public.live_game_questions question
        on question.game_id = g.id and question.position = g.current_question_position
    left join public.live_game_players player on player.game_id = g.id
    left join public.live_game_answers answer
        on answer.game_id = g.id
        and answer.player_id = player.id
        and answer.question_id = question.id
    where g.id = _game_id
    order by player.score desc nulls last, player.joined_at asc;
end;
$$;

create or replace function public.start_live_game(_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    target_game public.live_games%rowtype;
begin
    select g.* into target_game
    from public.live_games g
    where g.id = _game_id
    for update;

    if not found or not exists (
        select 1 from public.live_game_secrets secret
        where secret.game_id = _game_id and secret.host_user_id = (select auth.uid())
    ) then
        raise exception 'Only this game’s host can start it';
    end if;
    if target_game.status <> 'lobby' or target_game.expires_at <= now() then
        raise exception 'This lobby is closed';
    end if;
    if not exists (select 1 from public.live_game_players p where p.game_id = _game_id) then
        raise exception 'At least one player must join before the game starts';
    end if;

    update public.live_games
    set status = 'running',
        current_question_position = 1,
        question_started_at = now(),
        question_deadline = now() + interval '20 seconds',
        updated_at = now()
    where id = _game_id;
end;
$$;

create or replace function public.submit_live_game_answer(
    _game_id uuid,
    _question_position integer,
    _selected_option_index integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    target_game public.live_games%rowtype;
    target_player public.live_game_players%rowtype;
    target_question public.live_game_questions%rowtype;
    was_correct boolean;
    awarded_score integer;
begin
    select g.* into target_game
    from public.live_games g
    where g.id = _game_id
    for update;

    if not found or target_game.status <> 'running'
        or target_game.current_question_position <> _question_position
        or target_game.question_deadline <= now() then
        raise exception 'This question is no longer accepting answers';
    end if;

    select p.* into target_player
    from public.live_game_players p
    where p.game_id = _game_id and p.user_id = (select auth.uid());
    if not found then
        raise exception 'Join this game before answering';
    end if;

    select q.* into target_question
    from public.live_game_questions q
    where q.game_id = _game_id and q.position = _question_position;
    if not found or _selected_option_index < 0
        or _selected_option_index >= pg_catalog.cardinality(target_question.options) then
        raise exception 'Choose one of the available answers';
    end if;
    if exists (
        select 1
        from public.live_game_answers answer
        where answer.player_id = target_player.id
            and answer.question_id = target_question.id
    ) then
        raise exception 'You have already answered this question';
    end if;

    was_correct := _selected_option_index = target_question.correct_option_index;
    awarded_score := case when was_correct then
        1000 + greatest(
            0,
            pg_catalog.floor(
                500 * greatest(
                    0::numeric,
                    1 - extract(epoch from (now() - target_game.question_started_at)) / 20
                )
            )::integer
        )
        else 0
    end;

    insert into public.live_game_answers (
        game_id, player_id, question_id, selected_option_index, is_correct, score_awarded
    ) values (
        _game_id, target_player.id, target_question.id, _selected_option_index, was_correct, awarded_score
    );

    update public.live_games set updated_at = now() where id = _game_id;
end;
$$;

create or replace function public.advance_live_game(
    _game_id uuid,
    _expected_question_position integer,
    _expired_only boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    target_game public.live_games%rowtype;
    next_position integer;
    is_host boolean;
begin
    select g.* into target_game
    from public.live_games g
    where g.id = _game_id
    for update;

    if not found or target_game.status <> 'running'
        or target_game.current_question_position <> _expected_question_position then
        return false;
    end if;

    select secret.host_user_id = (select auth.uid()) into is_host
    from public.live_game_secrets secret
    where secret.game_id = _game_id;

    if not coalesce(is_host, false) then
        if not _expired_only or target_game.question_deadline > now()
            or not exists (
                select 1 from public.live_game_players p
                where p.game_id = _game_id and p.user_id = (select auth.uid())
            ) then
            raise exception 'Only a player can advance an expired question when the host is away';
        end if;
    elsif _expired_only and target_game.question_deadline > now() then
        return false;
    end if;

    update public.live_game_players player
    set score = player.score + coalesce((
            select answer.score_awarded
            from public.live_game_answers answer
            join public.live_game_questions question on question.id = answer.question_id
            where answer.player_id = player.id
                and answer.game_id = _game_id
                and question.position = _expected_question_position
                and answer.is_correct
        ), 0),
        current_streak = case when exists (
            select 1
            from public.live_game_answers answer
            join public.live_game_questions question on question.id = answer.question_id
            where answer.player_id = player.id
                and answer.game_id = _game_id
                and question.position = _expected_question_position
                and answer.is_correct
        ) then player.current_streak + 1 else 0 end
    where player.game_id = _game_id;

    select pg_catalog.max(question.position) into next_position
    from public.live_game_questions question
    where question.game_id = _game_id;

    if _expected_question_position >= next_position then
        update public.live_games
        set status = 'completed',
            finished_at = now(),
            question_deadline = null,
            updated_at = now()
        where id = _game_id;
    else
        update public.live_games
        set current_question_position = _expected_question_position + 1,
            question_started_at = now(),
            question_deadline = now() + interval '20 seconds',
            updated_at = now()
        where id = _game_id;
    end if;

    return true;
end;
$$;

create or replace function public.cancel_live_game(_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.live_games
    set status = 'cancelled',
        finished_at = now(),
        question_deadline = null,
        updated_at = now()
    where id = _game_id
        and status in ('lobby', 'running')
        and exists (
            select 1 from public.live_game_secrets secret
            where secret.game_id = live_games.id
                and secret.host_user_id = (select auth.uid())
        );

    if not found then
        raise exception 'Only the host can cancel an active game';
    end if;
end;
$$;

revoke all on function public.is_live_game_member(uuid) from public, anon;
revoke all on function public.create_live_game(uuid) from public, anon, authenticated;
revoke all on function public.join_live_game(text) from public, anon, authenticated;
revoke all on function public.get_live_game_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.start_live_game(uuid) from public, anon, authenticated;
revoke all on function public.submit_live_game_answer(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.advance_live_game(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.cancel_live_game(uuid) from public, anon, authenticated;

grant execute on function public.is_live_game_member(uuid) to authenticated;
grant execute on function public.create_live_game(uuid) to authenticated;
grant execute on function public.join_live_game(text) to authenticated;
grant execute on function public.get_live_game_snapshot(uuid) to authenticated;
grant execute on function public.start_live_game(uuid) to authenticated;
grant execute on function public.submit_live_game_answer(uuid, integer, integer) to authenticated;
grant execute on function public.advance_live_game(uuid, integer, boolean) to authenticated;
grant execute on function public.cancel_live_game(uuid) to authenticated;

do $$
begin
    if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
        and not exists (
            select 1 from pg_catalog.pg_publication_tables
            where pubname = 'supabase_realtime'
                and schemaname = 'public'
                and tablename = 'live_games'
        ) then
        execute 'alter publication supabase_realtime add table public.live_games';
    end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
