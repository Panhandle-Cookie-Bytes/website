import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock3, Gamepad2, Heart, Star, Users } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  getQuizAttemptResults,
  listQuizAttempts,
  startQuizAttempt,
  submitQuizAttempt,
} from "../services/quizService";
import { createLiveGame } from "../services/liveGameService";
import {
  getPublicQuizDetail,
  getPublicQuizQuestionPreview,
  ratePublicQuiz,
  setQuizFavorite,
} from "../services/quizExplorerService";
import type { QuizAttemptResultRow, QuizAttemptStart, QuizDetailData, QuizQuestionPreview } from "../types/database";

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

export function QuizDetailPage() {
  const { quizId = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<QuizDetailData | null>(null);
  const [preview, setPreview] = useState<QuizQuestionPreview[]>([]);
  const [personalAttemptCount, setPersonalAttemptCount] = useState(0);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setQuiz(null);
    setPreview([]);
    setPersonalAttemptCount(0);
    setBestScore(null);
    void Promise.all([
      getPublicQuizDetail(quizId),
      user ? listQuizAttempts(quizId, user.id) : Promise.resolve([]),
    ]).then(async ([quizResult, attemptsResult]) => {
      const questionPreview = quizResult.visibility === "public" && quizResult.allow_question_preview
        ? await getPublicQuizQuestionPreview(quizId)
        : [];
      if (!active) return;
      setQuiz(quizResult);
      setPreview(questionPreview);
      const completed = attemptsResult.filter(({ finished_at }) => finished_at !== null);
      setPersonalAttemptCount(completed.length);
      const scores = completed.flatMap(({ score }) => score === null ? [] : [score]);
      setBestScore(scores.length ? Math.max(...scores) : null);
    }).catch((loadError: unknown) => {
      if (active) setError(getErrorMessage(loadError, "Could not load this quiz."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [quizId, user]);

  async function refreshQuiz() {
    const updatedQuiz = await getPublicQuizDetail(quizId);
    setQuiz(updatedQuiz);
  }

  async function handleStart() {
    setActionBusy(true);
    setError(null);
    try {
      const questions = await startQuizAttempt(quizId);
      const firstQuestion = questions[0];
      if (!firstQuestion) throw new Error("No questions are available in this quiz.");
      window.sessionStorage.setItem(`quiz-attempt:${firstQuestion.attempt_id}`, JSON.stringify(questions));
      navigate(`/quizzes/${quizId}/take?attempt=${firstQuestion.attempt_id}`);
    } catch (startError) {
      setError(getErrorMessage(startError, "Could not start this quiz."));
      setActionBusy(false);
    }
  }

  async function handleStartLiveGame() {
    setActionBusy(true);
    setError(null);
    try {
      const { gameId } = await createLiveGame(quizId);
      navigate(`/games/${gameId}`);
    } catch (startError) {
      setError(getErrorMessage(startError, "Could not create a live game."));
      setActionBusy(false);
    }
  }

  async function handleFavorite() {
    if (!quiz) return;
    setActionBusy(true);
    setError(null);
    try {
      await setQuizFavorite(quizId, !quiz.is_favorited);
      await refreshQuiz();
    } catch (favoriteError) {
      setError(getErrorMessage(favoriteError, "Could not update your favorites."));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRate(rating: number) {
    setActionBusy(true);
    setError(null);
    try {
      await ratePublicQuiz(quizId, rating);
      await refreshQuiz();
    } catch (ratingError) {
      setError(getErrorMessage(ratingError, "Could not save your rating."));
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) return <div className="page-status" role="status">Loading quiz details…</div>;
  if (!quiz) {
    return (
      <section className="message-page">
        <span className="eyebrow"><span className="eyebrow-mark" /> Quiz unavailable</span>
        <h1>We can’t open this quiz.</h1>
        <p role="alert">{error ?? "It may be private, a draft, or assigned to another team."}</p>
        <Link className="button button-primary" to="/explore">Explore public quizzes</Link>
      </section>
    );
  }

  return (
    <section className="public-profile-page quiz-detail-page">
      <Link className="back-link" to={quiz.visibility === "public" ? "/explore" : "/quizzes"}><ArrowLeft size={14} aria-hidden="true" /> Back to {quiz.visibility === "public" ? "quiz explorer" : "quiz library"}</Link>
      <article className="panel quiz-detail-card">
        {quiz.cover_image_url && <img className="quiz-detail-cover" src={quiz.cover_image_url} alt="" />}
        <div className="quiz-card-topline">
          <span className="program-tag">{quiz.program}</span>
          <span className={`quiz-status-badge quiz-status-${quiz.status}`}>
            {quiz.status === "draft" ? "Draft" : quiz.visibility === "public" ? "Public" : quiz.visibility === "team" ? "Team-only" : "Private"}
          </span>
        </div>
        <span className="quiz-card-category">{quiz.category}</span>
        <h1>{quiz.title}</h1>
        <p className="quiz-detail-description">{quiz.description || "A focused multiple-choice knowledge check."}</p>
        <div className="quiz-detail-facts">
          <span>{quiz.difficulty} difficulty</span>
          <span><BookOpen size={16} aria-hidden="true" /> {quiz.question_count} questions</span>
          <span><Clock3 size={16} aria-hidden="true" /> About {quiz.estimated_minutes} min</span>
          <span>{quiz.play_count} {quiz.play_count === 1 ? "play" : "plays"}</span>
          <span><Star size={16} aria-hidden="true" /> {quiz.average_rating === null ? "Not rated" : `${quiz.average_rating} / 5`}{quiz.rating_count ? ` · ${quiz.rating_count}` : ""}</span>
          <span><Heart size={16} aria-hidden="true" /> {quiz.favorite_count} saved</span>
          {bestScore !== null && <span>Best score: {bestScore}%</span>}
          {user && personalAttemptCount > 0 && <span>Your completed attempts: {personalAttemptCount}</span>}
        </div>
        <div className="quiz-detail-attribution">
          <span>Created by {quiz.creator_username
            ? <Link to={`/users/${quiz.creator_username}`}>{quiz.creator_display_name}</Link>
            : quiz.creator_display_name}</span>
          {quiz.associated_team && <span><Users size={14} aria-hidden="true" /> {quiz.associated_team}</span>}
          <span>Created {new Date(quiz.created_at).toLocaleDateString()}</span>
        </div>
        {quiz.tags.length > 0 && (
          <div className="quiz-detail-tags" aria-label="Quiz tags">
            {quiz.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        )}
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <div className="quiz-detail-actions">
          {quiz.status === "published" && (quiz.allow_multiple_attempts || personalAttemptCount === 0) && (
            user
              ? <button className="button button-primary" type="button" onClick={() => void handleStart()} disabled={actionBusy}>
                {actionBusy ? "Starting quiz…" : "Start practice"} <ArrowRight size={16} aria-hidden="true" />
              </button>
              : <Link className="button button-primary" to={`/sign-in?next=${encodeURIComponent(`/quizzes/${quizId}`)}`}>Sign in to practice <ArrowRight size={16} aria-hidden="true" /></Link>
          )}
          {quiz.status === "published" && user && !quiz.allow_multiple_attempts && personalAttemptCount > 0 && (
            <p className="quiz-attempt-limit" role="status">You have completed your one allowed attempt.</p>
          )}
          {quiz.status === "published" && user && (
            <button className="button button-secondary" type="button" onClick={() => void handleStartLiveGame()} disabled={actionBusy}>
              <Gamepad2 size={16} aria-hidden="true" /> Start live game
            </button>
          )}
          {quiz.status === "published" && user ? (
            <button className="button button-secondary" type="button" onClick={() => void handleFavorite()} disabled={actionBusy}>
              <Heart size={16} fill={quiz.is_favorited ? "currentColor" : "none"} aria-hidden="true" />
              {quiz.is_favorited ? "Saved to favorites" : "Save to favorites"}
            </button>
          ) : quiz.status === "published" ? (
            <Link className="button button-secondary" to={`/sign-in?next=${encodeURIComponent(`/quizzes/${quizId}`)}`}>Sign in to save</Link>
          ) : null}
          {quiz.visibility === "public" && quiz.status === "published" && (
            user ? (
              <fieldset className="quiz-rating-control" disabled={actionBusy}>
                <legend>{quiz.my_rating ? "Your rating" : "Rate this quiz"}</legend>
                <div role="group" aria-label="Rate quiz from 1 to 5 stars">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      className="quiz-rating-star"
                      key={rating}
                      type="button"
                      aria-label={`${rating} out of 5 stars`}
                      aria-pressed={quiz.my_rating === rating}
                      onClick={() => void handleRate(rating)}
                    ><Star size={18} fill={(quiz.my_rating ?? 0) >= rating ? "currentColor" : "none"} aria-hidden="true" /></button>
                  ))}
                </div>
              </fieldset>
            ) : <Link className="quiz-rating-signin" to={`/sign-in?next=${encodeURIComponent(`/quizzes/${quizId}`)}`}>Sign in to rate this quiz</Link>
          )}
          {quiz.is_editor && (
            <Link className="button button-secondary" to={`/quizzes/${quiz.quiz_id}/edit`}>Edit quiz</Link>
          )}
        </div>
        {preview.length > 0 && (
          <section className="quiz-question-preview">
            <div className="quiz-section-heading">
              <div><span className="eyebrow">Creator-enabled preview</span><h2>Preview questions</h2></div>
              <span className="team-count">{preview.length}</span>
            </div>
            {preview.map((question) => (
              <article className="quiz-preview-question" key={question.question_position}>
                {question.image_url && <img src={question.image_url} alt="" />}
                <h3>{question.question_position}. {question.prompt}</h3>
                <ul>{question.options.map((option, index) => <li key={index}>{option}</li>)}</ul>
              </article>
            ))}
            <p className="quiz-preview-note">Answer keys and explanations are hidden in the preview.</p>
          </section>
        )}
      </article>
    </section>
  );
}

export function QuizTakePage() {
  const { quizId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const attemptId = new URLSearchParams(window.location.search).get("attempt") ?? "";
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<QuizAttemptStart[]>([]);
  const [answers, setAnswers] = useState<Record<string, number | number[]>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const questionDeadlines = useRef(new Map<string, number>());
  const currentQuestion = questions[currentQuestionIndex];

  function isOptionSelected(questionId: string, optionIndex: number): boolean {
    const answer = answers[questionId];
    return Array.isArray(answer) ? answer.includes(optionIndex) : answer === optionIndex;
  }

  useEffect(() => {
    if (!currentQuestion?.time_limit_seconds) {
      setSecondsLeft(null);
      return;
    }

    const deadline = questionDeadlines.current.get(currentQuestion.question_id)
      ?? Date.now() + currentQuestion.time_limit_seconds * 1000;
    questionDeadlines.current.set(currentQuestion.question_id, deadline);

    const updateTimeLeft = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        window.clearInterval(intervalId);
        if (currentQuestionIndex < questions.length - 1) {
          setCurrentQuestionIndex((index) => Math.min(index + 1, questions.length - 1));
        }
      }
    };

    const intervalId = window.setInterval(updateTimeLeft, 250);
    updateTimeLeft();
    return () => window.clearInterval(intervalId);
  }, [currentQuestion, currentQuestionIndex, questions.length]);

  useEffect(() => {
    if (!attemptId) {
      setError("This quiz attempt is missing. Return to the quiz and start a new attempt.");
      setLoading(false);
      return;
    }
    let active = true;
    try {
      const saved = window.sessionStorage.getItem(`quiz-attempt:${attemptId}`);
      if (!saved) throw new Error("This quiz attempt is no longer available in this browser. Start a new attempt.");
      const rows = JSON.parse(saved) as QuizAttemptStart[];
      if (!rows.length || rows.some((row) => row.quiz_id !== quizId || row.attempt_id !== attemptId)) {
        throw new Error("This quiz attempt does not match the selected quiz. Start a new attempt.");
      }
      if (active) {
        setCurrentQuestionIndex(0);
        setQuestions(rows);
      }
    } catch (loadError) {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load this quiz attempt.");
    } finally {
      if (active) setLoading(false);
    }
    return () => { active = false; };
  }, [attemptId, quizId, searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!attemptId || !questions.length) return;
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((index) => index + 1);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const completeAnswers = Object.fromEntries(
        questions.map((question) => [question.question_id, answers[question.question_id] ?? null]),
      );
      await submitQuizAttempt(attemptId, completeAnswers);
      navigate(`/quizzes/${quizId}/results/${attemptId}`, { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit your answers.");
      setBusy(false);
    }
  }

  if (loading) return <div className="page-status" role="status">Preparing your quiz…</div>;
  if (!questions.length) {
    return (
      <section className="message-page">
        <span className="eyebrow"><span className="eyebrow-mark" /> Quiz unavailable</span>
        <h1>Your attempt couldn’t be opened.</h1>
        <p role="alert">{error}</p>
        <Link className="button button-primary" to={`/quizzes/${quizId}`}>Return to quiz</Link>
      </section>
    );
  }

  return (
    <section className="account-page quiz-practice-page">
      <Link className="back-link" to={`/quizzes/${quizId}`}><ArrowLeft size={14} aria-hidden="true" /> Leave quiz</Link>
      <header className="page-heading">
        <span className="eyebrow"><span className="eyebrow-mark" /> Quiz practice</span>
        <h1>{questions[0].quiz_title}</h1>
        <p>Question {currentQuestionIndex + 1} of {questions.length} · You can move on without answering.</p>
      </header>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <form className="quiz-take-form" onSubmit={(event) => void handleSubmit(event)}>
        {currentQuestion && (
          <fieldset className="panel question-take-card" key={currentQuestion.question_id}>
            <legend>
              <span className="question-number">Question {currentQuestion.question_position} of {questions.length}</span>
              <span className="question-prompt">{currentQuestion.prompt}</span>
            </legend>
            <div className="quiz-question-facts">
              <span>{currentQuestion.point_value} {currentQuestion.point_value === 1 ? "point" : "points"}</span>
              {currentQuestion.time_limit_seconds !== null && (
                <span className={secondsLeft === 0 ? "quiz-timer-expired" : ""} role="timer">
                  {secondsLeft === 0 ? "Time expired" : `${secondsLeft ?? currentQuestion.time_limit_seconds} seconds left`}
                </span>
              )}
              {currentQuestion.question_type === "multiple_select" && <span>Select all that apply</span>}
            </div>
            {currentQuestion.image_url && <img className="quiz-question-image" src={currentQuestion.image_url} alt="" />}
            <div className="quiz-answer-options">
              {currentQuestion.options.map((option, optionIndex) => (
                <label
                  className={`quiz-answer-choice${isOptionSelected(currentQuestion.question_id, optionIndex) ? " is-selected" : ""}${secondsLeft === 0 ? " is-disabled" : ""}`}
                  key={optionIndex}
                >
                  <input
                    type={currentQuestion.question_type === "multiple_select" ? "checkbox" : "radio"}
                    name={currentQuestion.question_type === "multiple_select" ? `${currentQuestion.question_id}-${optionIndex}` : currentQuestion.question_id}
                    value={optionIndex}
                    checked={isOptionSelected(currentQuestion.question_id, optionIndex)}
                    disabled={busy || secondsLeft === 0}
                    onChange={(event) => setAnswers((existing) => {
                      if (currentQuestion.question_type !== "multiple_select") {
                        return { ...existing, [currentQuestion.question_id]: optionIndex };
                      }
                      const currentAnswer = existing[currentQuestion.question_id];
                      const current = Array.isArray(currentAnswer) ? currentAnswer : [];
                      const selected = event.target.checked
                        ? [...current, optionIndex]
                        : current.filter((index) => index !== optionIndex);
                      if (selected.length === 0) {
                        const { [currentQuestion.question_id]: _removed, ...remaining } = existing;
                        return remaining;
                      }
                      return { ...existing, [currentQuestion.question_id]: selected.sort((a, b) => a - b) };
                    })}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="quiz-submit-row">
          <span>{Object.keys(answers).length} of {questions.length} answered</span>
          <div className="quiz-question-navigation">
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setCurrentQuestionIndex((index) => Math.max(0, index - 1))}
              disabled={busy || currentQuestionIndex === 0}
            ><ArrowLeft size={15} aria-hidden="true" /> Previous</button>
            {currentQuestionIndex < questions.length - 1
              ? <button className="button button-primary" type="submit" disabled={busy}>
                Next <ArrowRight size={16} aria-hidden="true" />
              </button>
              : <button className="button button-primary" type="submit" disabled={busy}>
                {busy ? "Submitting…" : "Finish quiz"} <CheckCircle2 size={16} aria-hidden="true" />
              </button>}
          </div>
        </div>
      </form>
    </section>
  );
}

export function QuizResultsPage() {
  const { quizId = "", attemptId = "" } = useParams();
  const [rows, setRows] = useState<QuizAttemptResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getQuizAttemptResults(attemptId).then((result) => {
      if (!active) return;
      if (result[0]?.quiz_id !== quizId) throw new Error("These results do not belong to this quiz.");
      setRows(result);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load your quiz results.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [attemptId, quizId]);

  if (loading) return <div className="page-status" role="status">Loading your results…</div>;
  if (!rows.length) {
    return (
      <section className="message-page">
        <span className="eyebrow"><span className="eyebrow-mark" /> Quiz results</span>
        <h1>Results are unavailable.</h1>
        <p role="alert">{error}</p>
        <Link className="button button-primary" to="/quizzes">Back to quiz library</Link>
      </section>
    );
  }

  const summary = rows[0];
  return (
    <section className="account-page quiz-results-page">
      <Link className="back-link" to={`/quizzes/${quizId}`}><ArrowLeft size={14} aria-hidden="true" /> Back to quiz</Link>
      <header className="quiz-result-summary panel">
        <span className="eyebrow"><span className="eyebrow-mark" /> Practice complete</span>
        <h1>{summary.quiz_title}</h1>
        <div className="quiz-score-ring" aria-label={`${summary.score} percent`}>
          <strong>{summary.score}%</strong>
          <span>score</span>
        </div>
        <p>You got {summary.correct_count} of {summary.total_questions} questions correct.</p>
        <Link className="button button-primary" to={`/quizzes/${quizId}`}>Practice again <ArrowRight size={15} aria-hidden="true" /></Link>
      </header>

      <div className="quiz-results-list">
        {rows.map((row) => (
          <article
            className={`panel quiz-result-question${row.is_correct === null ? "" : row.is_correct ? " is-correct" : " is-incorrect"}`}
            key={row.question_id}
          >
            <span className="question-number">Question {row.question_position}</span>
            <h2>{row.prompt}</h2>
            <p className="quiz-selected-answer">
              Your answer: {row.selected_option_indices?.length
                ? row.selected_option_indices.map((index) => row.options[index]).join(", ")
                : "Not answered"}
            </p>
            {row.show_correct_answers && !row.is_correct && row.correct_option_indices && (
              <p className="quiz-correct-answer">
                Correct answer: {row.correct_option_indices.map((index) => row.options[index]).join(", ")}
              </p>
            )}
            {row.show_explanations && row.explanation && <p className="quiz-answer-explanation">{row.explanation}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
