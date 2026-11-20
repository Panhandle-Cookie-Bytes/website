import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Clock3, Search, Star, Users } from "lucide-react";
import { QUIZ_CATEGORIES, QUIZ_DIFFICULTIES } from "../content/quizTaxonomy";
import { listPublicQuizzes, type QuizExplorerSort } from "../services/quizExplorerService";
import type { Program, QuizDifficulty, QuizExplorerRow } from "../types/database";

const programs: Program[] = ["FLL", "FTC", "FRC", "General FIRST"];
const pageSize = 24;
const sortOptions: { value: QuizExplorerSort; label: string }[] = [
  { value: "most_popular", label: "Most popular" },
  { value: "highest_rated", label: "Highest rated" },
  { value: "recent", label: "Recently created" },
  { value: "most_played", label: "Most played" },
  { value: "shortest", label: "Shortest quizzes" },
];

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

export function QuizExplorerPage() {
  const [quizzes, setQuizzes] = useState<QuizExplorerRow[]>([]);
  const [program, setProgram] = useState<Program | "">("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState<QuizDifficulty | "">("");
  const [sort, setSort] = useState<QuizExplorerSort>("most_popular");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void listPublicQuizzes({
      program,
      category,
      difficulty,
      search,
      sort,
      limit: pageSize,
      offset: page * pageSize,
    }).then((result) => {
      if (!active) return;
      setQuizzes((existing) => page === 0 ? result : [...existing, ...result]);
      setHasMore(result.length === pageSize);
    }).catch((loadError: unknown) => {
      if (active) setError(getErrorMessage(loadError, "Could not load public quizzes."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [program, category, difficulty, search, sort, page]);

  function resetPage(change: () => void) {
    setQuizzes([]);
    setHasMore(false);
    setPage(0);
    change();
  }

  return (
    <section className="account-page quiz-explorer-page">
      <header className="page-heading quiz-explorer-heading">
        <span className="eyebrow"><span className="eyebrow-mark" /> Community quiz library</span>
        <h1>Explore quizzes</h1>
        <p>Discover public practice quizzes shared by FIRST teams and robotics learners.</p>
      </header>

      <div className="quiz-explorer-toolbar panel">
        <label className="quiz-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Search public quizzes</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search quizzes, creators, teams, or topics…"
          />
        </label>
        <label className="quiz-filter-select">
          <span className="sr-only">Filter by FIRST program</span>
          <select aria-label="FIRST program" value={program} onChange={(event) => resetPage(() => setProgram(event.target.value as Program | ""))}>
            <option value="">All FIRST programs</option>
            {programs.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="quiz-filter-select">
          <span className="sr-only">Filter by category</span>
          <select aria-label="Category" value={category} onChange={(event) => resetPage(() => setCategory(event.target.value))}>
            <option value="">All categories</option>
            {QUIZ_CATEGORIES.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="quiz-filter-select">
          <span className="sr-only">Filter by difficulty</span>
          <select aria-label="Difficulty" value={difficulty} onChange={(event) => resetPage(() => setDifficulty(event.target.value as QuizDifficulty | ""))}>
            <option value="">All difficulties</option>
            {QUIZ_DIFFICULTIES.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="quiz-filter-select quiz-sort-select">
          <span className="sr-only">Sort public quizzes</span>
          <select aria-label="Sort quizzes" value={sort} onChange={(event) => resetPage(() => setSort(event.target.value as QuizExplorerSort))}>
            {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="notice notice-error" role="alert">Public quizzes couldn’t load: {error}</p>}
      <div className="quiz-explorer-results-bar">
        <span>{loading && page === 0 ? "Searching public quizzes…" : `${quizzes.length}${hasMore ? "+" : ""} public ${quizzes.length === 1 ? "quiz" : "quizzes"}`}</span>
        <span>Only published public quizzes appear here.</span>
      </div>

      {loading && page === 0 ? (
        <p className="page-status" role="status">Finding quizzes for your next practice session…</p>
      ) : quizzes.length ? (
        <>
          <div className="quiz-card-grid quiz-explorer-grid">
            {quizzes.map((quiz) => (
              <article className="panel quiz-card explorer-quiz-card" key={quiz.quiz_id}>
                <div className="quiz-card-topline">
                  <span className="program-tag">{quiz.program}</span>
                  <span className="quiz-status-badge quiz-status-published">Public</span>
                </div>
                <span className="quiz-card-category">{quiz.category}</span>
                <h2><Link to={`/quizzes/${quiz.quiz_id}`}>{quiz.title}</Link></h2>
                <p>{quiz.description || "A focused robotics knowledge check shared with the community."}</p>
                <div className="explorer-quiz-attribution">
                  <span>By {quiz.creator_username
                    ? <Link to={`/users/${quiz.creator_username}`}>{quiz.creator_display_name}</Link>
                    : quiz.creator_display_name}</span>
                  {quiz.associated_team && <span><Users size={13} aria-hidden="true" /> {quiz.associated_team}</span>}
                </div>
                <div className="explorer-quiz-tags">
                  <span className={`explorer-difficulty difficulty-${quiz.difficulty.toLowerCase()}`}>{quiz.difficulty}</span>
                </div>
                <div className="explorer-quiz-stats">
                  <span><BookOpen size={14} aria-hidden="true" /> {quiz.question_count} questions</span>
                  <span><Clock3 size={14} aria-hidden="true" /> ~{quiz.estimated_minutes} min</span>
                  <span><Star size={14} aria-hidden="true" /> {quiz.average_rating === null ? "Not rated" : `${quiz.average_rating} (${quiz.rating_count})`}</span>
                  <span>{quiz.play_count} {quiz.play_count === 1 ? "play" : "plays"}</span>
                </div>
                <div className="quiz-card-actions">
                  <Link className="text-link" to={`/quizzes/${quiz.quiz_id}`}>View quiz <ArrowRight size={14} aria-hidden="true" /></Link>
                </div>
              </article>
            ))}
          </div>
          {hasMore && (
            <div className="quiz-explorer-more">
              <button
                className="button button-secondary"
                type="button"
                disabled={loading}
                onClick={() => setPage((current) => current + 1)}
              >
                {loading ? "Loading…" : "Load more quizzes"}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="panel quiz-empty-state">
          <span className="team-empty-icon"><BookOpen size={23} aria-hidden="true" /></span>
          <h2>{error ? "Public quizzes are unavailable." : "No quizzes match those filters."}</h2>
          <p>{error ? "Try again later." : "Try another search or clear one of the filters to see more quizzes."}</p>
          {!error && <button className="button button-secondary" type="button" onClick={() => {
            setSearchInput("");
            setSearch("");
            setProgram("");
            setCategory("");
            setDifficulty("");
            setSort("most_popular");
            setPage(0);
          }}>Clear filters</button>}
        </div>
      )}
    </section>
  );
}
