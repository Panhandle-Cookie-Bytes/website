import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  BookOpenCheck,
  Bot,
  ChartNoAxesCombined,
  CirclePlus,
  Clock3,
  Gamepad2,
  Flame,
  GraduationCap,
  PenLine,
  Share2,
  ShieldCheck,
  Trophy,
  UsersRound,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { getHomeDashboardStats, getHomeRecentActivity, listPopularPublicQuizzes, type HomeActivity, type HomeDashboardStats, type PopularQuiz } from "../services/homeService";
import { listAccessibleQuizzes, type QuizListItem } from "../services/quizService";
import { listMyTeams, type MyTeam } from "../services/teamService";
import type { Program } from "../types/database";

const features = [
  {
    icon: PenLine,
    title: "Create custom quizzes",
    description: "Turn the topics your team is learning into focused multiple-choice practice.",
  },
  {
    icon: Gamepad2,
    title: "Play live quiz games",
    description: "Live team game rooms are planned. For now, start a self-paced quiz and build your score.",
  },
  {
    icon: BookOpenCheck,
    title: "Learn FIRST game rules",
    description: "Practice the rules, strategy, and details that make a difference on the field.",
  },
  {
    icon: UsersRound,
    title: "Challenge teammates",
    description: "Coaches can assign quizzes so teammates can practice the same material.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Track your progress",
    description: "Review real scores and answers after each completed quiz.",
  },
  {
    icon: Share2,
    title: "Share quizzes with teams",
    description: "Publish public quizzes and make them available to other robotics teams.",
  },
];

interface DashboardData {
  teams: MyTeam[];
  quizzes: QuizListItem[];
  stats: HomeDashboardStats;
  activity: HomeActivity[];
}

function PopularQuizCards({ quizzes, loading, error }: {
  quizzes: PopularQuiz[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <section className="home-popular-section" id="popular-quizzes">
      <div className="home-section-heading">
        <div>
          <span className="eyebrow"><span className="eyebrow-mark" /> Community favorites</span>
          <h2>Popular quizzes</h2>
          <p>Real public quizzes, ranked by completed attempts.</p>
        </div>
        <Link className="text-link" to="/sign-up">Join to explore <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
      {error && <p className="notice notice-error" role="alert">Public quizzes couldn’t load: {error}</p>}
      {loading ? (
        <p className="page-status" role="status">Finding popular public quizzes…</p>
      ) : quizzes.length ? (
        <div className="quiz-card-grid">
          {quizzes.map((quiz) => (
            <article className="panel quiz-card home-popular-card" key={quiz.id}>
              <div className="quiz-card-topline">
                <span className="program-tag">{quiz.program}</span>
                <span className="quiz-card-category">{quiz.category}</span>
              </div>
              <h3>{quiz.title}</h3>
              <p>{quiz.description || "A community quiz for robotics learners."}</p>
              <div className="quiz-card-meta">
                <span>{quiz.attempt_count} completed {quiz.attempt_count === 1 ? "attempt" : "attempts"}</span>
                <Link className="text-link" to="/sign-up">Practice <ArrowRight size={14} aria-hidden="true" /></Link>
              </div>
            </article>
          ))}
        </div>
      ) : !error ? (
        <div className="panel home-empty-state">
          <BookOpenCheck size={22} aria-hidden="true" />
          <p>No public quizzes yet. Create an account and be the first to share one.</p>
        </div>
      ) : null}
    </section>
  );
}

function DashboardHome({ displayName, userId, preferredProgram, profileError }: {
  displayName: string;
  userId: string;
  preferredProgram: Program | null;
  profileError: string | null;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([
      listMyTeams(userId),
      listAccessibleQuizzes(userId),
      getHomeDashboardStats(),
      getHomeRecentActivity(),
    ]).then(([teams, quizzes, stats, activity]) => {
      if (active) setData({ teams, quizzes, stats, activity });
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load your dashboard.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [userId]);

  const recommendations = useMemo(() => {
    if (!data) return [];
    return data.quizzes
      .filter(({ quiz }) => quiz.status === "published")
      .sort((left, right) => {
        const leftAssigned = left.assignments.length ? 1 : 0;
        const rightAssigned = right.assignments.length ? 1 : 0;
        if (leftAssigned !== rightAssigned) return rightAssigned - leftAssigned;
        const leftPreferred = quizProgramMatches(left.quiz.program, preferredProgram) ? 1 : 0;
        const rightPreferred = quizProgramMatches(right.quiz.program, preferredProgram) ? 1 : 0;
        return rightPreferred - leftPreferred
          || right.quiz.updated_at.localeCompare(left.quiz.updated_at);
      })
      .slice(0, 3);
  }, [data, preferredProgram]);

  return (
    <div className="home-dashboard">
      <section className="home-welcome panel">
        <div>
          <span className="eyebrow"><span className="eyebrow-mark" /> Your robotics workspace</span>
          <h1>Welcome back, <span>{displayName}</span>.</h1>
          <p>Pick up where you left off: practice a quiz, check your team’s assignments, or make something new.</p>
        </div>
        <div className="home-welcome-mark" aria-hidden="true"><Bot size={42} /></div>
      </section>

      {profileError && (
        <div className="notice notice-error" role="alert">
          Your account is signed in, but your profile could not load: {profileError}{" "}
          <Link to="/profile">Review your profile settings</Link>
        </div>
      )}
      {error && <p className="notice notice-error" role="alert">Your dashboard couldn’t load: {error}</p>}

      <section className="home-quick-actions" aria-label="Quick actions">
        <Link className="home-action-card home-action-primary" to="/quizzes/create">
          <span><CirclePlus size={19} aria-hidden="true" /></span><strong>Create Quiz</strong><ArrowRight size={16} aria-hidden="true" />
        </Link>
        <Link className="home-action-card" to="/teams/join">
          <span><UsersRound size={19} aria-hidden="true" /></span><strong>Join Team</strong><ArrowRight size={16} aria-hidden="true" />
        </Link>
        <Link className="home-action-card" to="/quizzes">
          <span><Gamepad2 size={19} aria-hidden="true" /></span><strong>Start a Game</strong><ArrowRight size={16} aria-hidden="true" />
        </Link>
        <Link className="home-action-card" to="/quizzes">
          <span><BookOpenCheck size={19} aria-hidden="true" /></span><strong>Explore Quizzes</strong><ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>

      <section className="home-stats-grid" aria-label="Your learning statistics">
        {[
          { label: "Quizzes completed", value: data?.stats.quizzes_completed, icon: BookOpenCheck },
          { label: "Average score", value: data ? data.stats.average_score === null ? "—" : `${Math.round(data.stats.average_score)}%` : undefined, icon: Trophy },
          { label: "Questions correct", value: data?.stats.correct_answers, icon: GraduationCap },
          { label: "Day streak", value: data?.stats.current_streak, icon: Flame },
        ].map(({ label, value, icon: Icon }) => (
          <article className="panel home-stat-card" key={label}>
            <span className="home-stat-icon"><Icon size={18} aria-hidden="true" /></span>
            <span>{label}</span>
            <strong>{loading ? "…" : value ?? (error ? "—" : 0)}</strong>
          </article>
        ))}
      </section>

      <div className="home-dashboard-columns">
        <section className="panel home-dashboard-panel">
          <div className="home-panel-heading">
            <div><span className="eyebrow">Your crew</span><h2>My teams</h2></div>
            <Link className="text-link" to="/teams">All teams <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          {loading ? <p className="home-panel-status">Loading your teams…</p> : data?.teams.length ? (
            <div className="home-team-list">
              {data.teams.slice(0, 4).map((team) => (
                <Link className="home-team-row" to={`/teams/${team.id}`} key={team.id}>
                  <span className="home-team-icon"><Bot size={18} aria-hidden="true" /></span>
                  <span className="home-team-details"><strong>{team.name}</strong><span>Team {team.team_number} · {team.program}</span></span>
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : !error ? (
            <div className="home-inline-empty">
              <p>You haven’t joined a team yet.</p>
              <Link className="text-link" to="/teams/join">Join with an invite <ArrowRight size={14} aria-hidden="true" /></Link>
              <Link className="text-link" to="/teams">Create a team <ArrowRight size={14} aria-hidden="true" /></Link>
            </div>
          ) : null}
        </section>

        <section className="panel home-dashboard-panel">
          <div className="home-panel-heading">
            <div><span className="eyebrow">Keep your momentum</span><h2>Recent activity</h2></div>
            <Clock3 size={18} aria-hidden="true" />
          </div>
          {loading ? <p className="home-panel-status">Loading recent activity…</p> : data?.activity.length ? (
            <div className="home-activity-list">
              {data.activity.slice(0, 6).map((item, index) => (
                <Link className="home-activity-row" to={item.activity_type === "completed" && item.attempt_id
                  ? `/quizzes/${item.quiz_id}/results/${item.attempt_id}`
                  : `/quizzes/${item.quiz_id}`} key={`${item.activity_type}-${item.quiz_id}-${item.occurred_at}-${index}`}>
                  <span className={`home-activity-icon${item.activity_type === "completed" ? " is-completed" : ""}`}>
                    {item.activity_type === "completed" ? <Trophy size={15} aria-hidden="true" /> : <PenLine size={15} aria-hidden="true" />}
                  </span>
                  <span className="home-activity-details">
                    <strong>{item.activity_type === "completed" ? "Completed" : "Created"} · {item.quiz_title}</strong>
                    <span>{item.program} · {new Date(item.occurred_at).toLocaleDateString()}</span>
                  </span>
                  {item.score !== null && <span className="home-activity-score">{item.score}%</span>}
                </Link>
              ))}
            </div>
          ) : !error ? (
            <div className="home-inline-empty"><p>No quiz activity yet. Start your first practice quiz.</p><Link className="text-link" to="/quizzes">Explore quizzes <ArrowRight size={14} aria-hidden="true" /></Link></div>
          ) : null}
        </section>
      </div>

      <section className="home-recommendations">
        <div className="home-section-heading">
          <div><span className="eyebrow"><span className="eyebrow-mark" /> Pick up a new skill</span><h2>Recommended for you</h2><p>Team assignments and public quizzes{preferredProgram ? ` for ${preferredProgram}` : ""}.</p></div>
          <Link className="text-link" to="/quizzes">Quiz library <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
        {loading ? <p className="home-panel-status">Finding your next quiz…</p> : error ? null : recommendations.length ? (
          <div className="quiz-card-grid">
            {recommendations.map(({ quiz, assignments, attempts }) => (
              <article className="panel quiz-card" key={quiz.id}>
                <div className="quiz-card-topline"><span className="program-tag">{quiz.program}</span><span className="quiz-card-category">{quiz.category}</span></div>
                <h3><Link to={`/quizzes/${quiz.id}`}>{quiz.title}</Link></h3>
                <p>{quiz.description || "A focused robotics knowledge check."}</p>
                <div className="quiz-card-meta"><span>{assignments.length ? "Assigned to your team" : "Public quiz"}</span><span>{attempts.count ? `${attempts.latestScore}% latest` : "Ready to practice"}</span></div>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel home-empty-state"><BookOpenCheck size={22} aria-hidden="true" /><p>No recommendations yet. Try the quiz library or ask your coach to assign a quiz.</p><Link className="text-link" to="/quizzes">Explore quizzes <ArrowRight size={14} aria-hidden="true" /></Link></div>
        )}
      </section>
    </div>
  );
}

function quizProgramMatches(quizProgram: Program, preferredProgram: Program | null) {
  return preferredProgram !== null && quizProgram === preferredProgram;
}

export function HomePage() {
  const { user, profile, profileError, loading: authLoading } = useAuth();
  const [popularQuizzes, setPopularQuizzes] = useState<PopularQuiz[]>([]);
  const [popularLoading, setPopularLoading] = useState(true);
  const [popularError, setPopularError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      setPopularLoading(false);
      return;
    }
    let active = true;
    void listPopularPublicQuizzes(6).then((result) => {
      if (active) setPopularQuizzes(result);
    }).catch((loadError: unknown) => {
      if (active) setPopularError(loadError instanceof Error ? loadError.message : "Could not load public quizzes.");
    }).finally(() => {
      if (active) setPopularLoading(false);
    });
    return () => { active = false; };
  }, [authLoading, user]);

  if (authLoading) {
    return <div className="home-auth-loading" role="status">Restoring your robotics workspace…</div>;
  }

  if (user) {
    return (
      <DashboardHome
        displayName={profile?.display_name || "FIRST learner"}
        userId={user.id}
        preferredProgram={profile?.preferred_program ?? null}
        profileError={profileError}
      />
    );
  }

  return (
    <>
      <section className="hero-section">
        <div className="hero-grid">
          <div className="hero-copy">
            <span className="eyebrow"><span className="eyebrow-mark" /> Built for FIRST teams</span>
            <h1>Learn Robotics.<br />Challenge Your Team.<br /><span>Get Competition Ready.</span></h1>
            <p className="hero-description">
              A collaborative quiz platform built for FIRST Robotics teams. Master game rules,
              test your engineering knowledge, and compete with teammates.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" to="/sign-up">Get Started <ArrowRight size={17} aria-hidden="true" /></Link>
              <a className="button button-secondary" href="#popular-quizzes">Explore Quizzes <ArrowDown size={16} aria-hidden="true" /></a>
            </div>
            <div className="hero-proof"><span className="proof-icon"><ShieldCheck size={17} aria-hidden="true" /></span>For curious builders, thoughtful teammates, and future innovators</div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
            <div className="art-node node-top" /><div className="art-node node-side" />
            <div className="robot-blueprint">
              <div className="blueprint-topline"><span>FIELD NOTES</span><span>FQ / 001</span></div>
              <div className="blueprint-grid">
                <div className="robot-frame">
                  <span className="robot-wheel wheel-left" /><span className="robot-wheel wheel-right" />
                  <span className="robot-base" /><span className="robot-upright" />
                  <span className="robot-arm arm-left" /><span className="robot-arm arm-right" />
                  <span className="robot-sensor" /><span className="robot-center" />
                </div>
                <div className="blueprint-label label-top">DESIGN<br />ITERATE</div>
                <div className="blueprint-label label-bottom">TEST<br />IMPROVE</div>
                <span className="blueprint-cross cross-one">+</span><span className="blueprint-cross cross-two">+</span>
              </div>
              <div className="blueprint-footer"><span>IDEAS INTO MOTION</span><span className="signal"><i /><i /><i /></span></div>
            </div>
            <div className="art-caption caption-top"><span className="caption-dot" /> BUILD WITH PURPOSE</div>
            <div className="art-caption caption-bottom">LEARN <b>·</b> TEST <b>·</b> REPEAT</div>
          </div>
        </div>
      </section>

      <section className="community-strip" aria-label="Supported FIRST programs">
        <span>One community</span><i /><span>FIRST LEGO League</span><i /><span>FIRST Tech Challenge</span><i /><span>FIRST Robotics Competition</span>
      </section>

      <section className="content-section" id="what-you-can-do">
        <div className="section-heading">
          <span className="eyebrow"><span className="eyebrow-mark" /> A smarter way to practice</span>
          <h2>More than memorizing.<br /><span>Ready for the real world.</span></h2>
          <p>Great robots start with curious, capable people. Build knowledge that moves your whole team forward.</p>
        </div>
        <div className="feature-grid">
          {features.map(({ icon: Icon, title, description }, index) => (
            <article className="feature-card" key={title}>
              <span className="feature-number">0{index + 1}</span>
              <span className="feature-icon"><Icon size={20} strokeWidth={1.8} aria-hidden="true" /></span>
              <h3>{title}</h3><p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <PopularQuizCards quizzes={popularQuizzes} loading={popularLoading} error={popularError} />

      <section className="steps-section" id="how-it-works">
        <div className="steps-intro">
          <span className="eyebrow"><span className="eyebrow-mark" /> Start where you are</span>
          <h2>Small steps.<br /><span>Big breakthroughs.</span></h2>
          <p>Find a team, choose what to learn, then turn practice into progress.</p>
          <Link className="text-link" to="/sign-up">Create your free account <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
        <ol className="steps-list">
          <li><span className="step-count">01</span><div><h3>Join or create a team</h3><p>Find your crew or set up a team space with your teammates and coach.</p></div></li>
          <li><span className="step-count">02</span><div><h3>Find or create a quiz</h3><p>Explore public quizzes, practice an assignment, or write your own questions.</p></div></li>
          <li><span className="step-count">03</span><div><h3>Learn, practice, compete</h3><p>Answer questions, review your results, and keep building your knowledge.</p></div></li>
        </ol>
      </section>

      <section className="closing-section">
        <div className="closing-mark" aria-hidden="true"><Bot size={30} strokeWidth={1.6} /></div>
        <div><span className="eyebrow">The next great idea starts here</span><h2>Ready to build what’s next?</h2><p>Join a community that learns by asking better questions.</p></div>
        <Link className="button button-light" to="/sign-up">Get Started <ArrowRight size={17} aria-hidden="true" /></Link>
      </section>
    </>
  );
}
