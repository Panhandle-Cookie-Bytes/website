import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, CirclePlus, Search } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { listAccessibleQuizzes, type QuizListItem } from "../services/quizService";

export function QuizzesPage() {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState("all");
  const [showMyDrafts, setShowMyDrafts] = useState(true);

  useEffect(() => {
    let active = true;
    if (!user) return;
    void listAccessibleQuizzes(user.id).then((result) => {
      if (active) setQuizzes(result);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load quizzes.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [user]);

  const visibleQuizzes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return quizzes.filter(({ quiz, assignments }) => {
      if (quiz.status === "draft" && !showMyDrafts) return false;
      if (programFilter !== "all" && quiz.program !== programFilter) return false;
      if (!query) return true;
      return quiz.title.toLowerCase().includes(query)
        || quiz.description.toLowerCase().includes(query)
        || quiz.category.toLowerCase().includes(query)
        || assignments.some(({ team_name }) => team_name.toLowerCase().includes(query));
    });
  }, [quizzes, search, programFilter, showMyDrafts]);

  const draftCount = quizzes.filter(({ quiz }) => quiz.status === "draft").length;
  const assignedCount = quizzes.filter(({ assignments }) => assignments.length > 0).length;

  return (
    <section className="account-page quizzes-page">
      <header className="page-heading quiz-library-heading">
        <div>
          <span className="eyebrow"><span className="eyebrow-mark" /> Practice makes progress</span>
          <h1>Quiz library</h1>
          <p>Discover robotics knowledge checks, work through team assignments, or build a quiz of your own.</p>
        </div>
        <Link className="button button-primary" to="/quizzes/create">
          <CirclePlus size={16} aria-hidden="true" /> Create a quiz
        </Link>
      </header>

      {error && <p className="notice notice-error" role="alert">{error}</p>}

      <div className="quiz-library-stats">
        <span><BookOpen size={16} aria-hidden="true" /> {quizzes.length} accessible quizzes</span>
        <span>{assignedCount} assigned to your teams</span>
        <span>{draftCount} of your drafts</span>
      </div>

      <div className="quiz-filter-bar panel">
        <label className="quiz-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Search quizzes</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quizzes, topics, or teams…" />
        </label>
        <label className="quiz-filter-select">
          <span className="sr-only">Filter by program</span>
          <select value={programFilter} onChange={(event) => setProgramFilter(event.target.value)}>
            <option value="all">All programs</option>
            <option value="FTC">FTC</option>
            <option value="FLL">FLL</option>
            <option value="FRC">FRC</option>
            <option value="General FIRST">General FIRST</option>
          </select>
        </label>
        <label className="quiz-draft-toggle">
          <input type="checkbox" checked={showMyDrafts} onChange={(event) => setShowMyDrafts(event.target.checked)} />
          Include my drafts
        </label>
      </div>

      {loading ? (
        <p className="page-status" role="status">Loading your quiz library…</p>
      ) : visibleQuizzes.length ? (
        <div className="quiz-card-grid">
          {visibleQuizzes.map(({ quiz, attempts, assignments }) => {
            const isOwner = quiz.created_by === user?.id;
            return (
              <article className="panel quiz-card" key={quiz.id}>
                <div className="quiz-card-topline">
                  <span className="program-tag">{quiz.program}</span>
                  <span className={`quiz-status-badge quiz-status-${quiz.status}`}>{quiz.status}</span>
                </div>
                <span className="quiz-card-category">{quiz.category}</span>
                <h2><Link to={`/quizzes/${quiz.id}`}>{quiz.title}</Link></h2>
                <p>{quiz.description || "A focused robotics knowledge check. Open the quiz to see more details."}</p>
                <div className="quiz-card-meta">
                  <span>{quiz.visibility === "public" ? "Public quiz" : isOwner ? "Your private quiz" : "Team quiz"}</span>
                  <span>{attempts.count ? `${attempts.count} attempt${attempts.count === 1 ? "" : "s"}` : "Not attempted"}</span>
                </div>
                {assignments.length > 0 && (
                  <div className="quiz-assignment-tags">
                    {assignments.map((assignment) => (
                      <span key={assignment.team_id}>{assignment.team_name}</span>
                    ))}
                  </div>
                )}
                {attempts.latestScore !== null && (
                  <p className="quiz-latest-score">Latest score <strong>{attempts.latestScore}%</strong></p>
                )}
                <div className="quiz-card-actions">
                  {quiz.status === "published" && (
                    <Link className="text-link" to={`/quizzes/${quiz.id}`}>
                      {attempts.count ? "Practice again" : "View quiz"} <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  )}
                  {isOwner && (
                    <Link className="text-link quiz-edit-link" to={`/quizzes/${quiz.id}/edit`}>Edit quiz</Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel quiz-empty-state">
          <span className="team-empty-icon"><BookOpen size={23} aria-hidden="true" /></span>
          <h2>{search || programFilter !== "all" ? "No quizzes match those filters." : "Your quiz library is ready."}</h2>
          <p>
            {search || programFilter !== "all"
              ? "Try a different search or program."
              : "Create the first quiz for your team, or ask a coach to assign one."}
          </p>
          {!search && programFilter === "all" && (
            <Link className="button button-primary" to="/quizzes/create">Create a quiz</Link>
          )}
        </div>
      )}
    </section>
  );
}
