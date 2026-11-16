import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  getQuiz,
  getQuizAttemptResults,
  listQuizAttempts,
  startQuizAttempt,
  submitQuizAttempt,
} from "../services/quizService";
import type { Quiz, QuizAttemptResultRow, QuizAttemptStart } from "../types/database";

export function QuizDetailPage() {
  const { quizId = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([
      getQuiz(quizId),
      user ? listQuizAttempts(quizId, user.id) : Promise.resolve([]),
    ]).then(([quizResult, attemptsResult]) => {
      if (!active) return;
      setQuiz(quizResult);
      const completed = attemptsResult.filter(({ finished_at }) => finished_at !== null);
      setAttemptCount(completed.length);
      const scores = completed.flatMap(({ score }) => score === null ? [] : [score]);
      setBestScore(scores.length ? Math.max(...scores) : null);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load this quiz.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [quizId, user]);

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      const questions = await startQuizAttempt(quizId);
      const firstQuestion = questions[0];
      if (!firstQuestion) throw new Error("No questions are available in this quiz.");
      window.sessionStorage.setItem(`quiz-attempt:${firstQuestion.attempt_id}`, JSON.stringify(questions));
      navigate(`/quizzes/${quizId}/take?attempt=${firstQuestion.attempt_id}`);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start this quiz.");
      setBusy(false);
    }
  }

  if (loading) return <div className="page-status" role="status">Loading quiz details…</div>;
  if (!quiz) {
    return (
      <section className="message-page">
        <span className="eyebrow"><span className="eyebrow-mark" /> Quiz unavailable</span>
        <h1>We can’t open this quiz.</h1>
        <p role="alert">{error ?? "It may be private, a draft, or assigned to another team."}</p>
        <Link className="button button-primary" to="/quizzes">Back to quiz library</Link>
      </section>
    );
  }

  return (
    <section className="public-profile-page quiz-detail-page">
      <Link className="back-link" to="/quizzes"><ArrowLeft size={14} aria-hidden="true" /> Back to quiz library</Link>
      <article className="panel quiz-detail-card">
        <div className="quiz-card-topline">
          <span className="program-tag">{quiz.program}</span>
          <span className={`quiz-status-badge quiz-status-${quiz.status}`}>{quiz.status}</span>
        </div>
        <span className="quiz-card-category">{quiz.category}</span>
        <h1>{quiz.title}</h1>
        <p className="quiz-detail-description">{quiz.description || "A focused multiple-choice knowledge check."}</p>
        <div className="quiz-detail-facts">
          <span><BookOpen size={16} aria-hidden="true" /> Multiple-choice questions</span>
          <span>{quiz.visibility === "public" ? "Public quiz" : "Private or team assignment"}</span>
          {attemptCount > 0 && <span>{attemptCount} completed attempt{attemptCount === 1 ? "" : "s"}</span>}
          {bestScore !== null && <span>Best score: {bestScore}%</span>}
        </div>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <div className="quiz-detail-actions">
          {quiz.status === "published" && (
            <button className="button button-primary" type="button" onClick={() => void handleStart()} disabled={busy}>
              {busy ? "Starting quiz…" : attemptCount ? "Practice again" : "Start quiz"} <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
          {quiz.created_by === user?.id && (
            <Link className="button button-secondary" to={`/quizzes/${quiz.id}/edit`}>Edit quiz</Link>
          )}
        </div>
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
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (active) setQuestions(rows);
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
    setBusy(true);
    setError(null);
    try {
      await submitQuizAttempt(attemptId, answers);
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
        <p>{questions.length} questions · Choose one answer for every question before submitting.</p>
      </header>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <form className="quiz-take-form" onSubmit={(event) => void handleSubmit(event)}>
        {questions.map((question) => (
          <fieldset className="panel question-take-card" key={question.question_id}>
            <legend>
              <span className="question-number">Question {question.question_position} of {questions.length}</span>
              <span className="question-prompt">{question.prompt}</span>
            </legend>
            <div className="quiz-answer-options">
              {question.options.map((option, optionIndex) => (
                <label
                  className={`quiz-answer-choice${answers[question.question_id] === optionIndex ? " is-selected" : ""}`}
                  key={optionIndex}
                >
                  <input
                    type="radio"
                    name={question.question_id}
                    value={optionIndex}
                    checked={answers[question.question_id] === optionIndex}
                    onChange={() => setAnswers((existing) => ({ ...existing, [question.question_id]: optionIndex }))}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="quiz-submit-row">
          <span>{Object.keys(answers).length} of {questions.length} answered</span>
          <button className="button button-primary" type="submit" disabled={busy || Object.keys(answers).length !== questions.length}>
            {busy ? "Submitting…" : "Submit answers"} <CheckCircle2 size={16} aria-hidden="true" />
          </button>
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
          <article className={`panel quiz-result-question${row.is_correct ? " is-correct" : " is-incorrect"}`} key={row.question_id}>
            <span className="question-number">Question {row.question_position}</span>
            <h2>{row.prompt}</h2>
            <p className="quiz-selected-answer">
              Your answer: {row.selected_option_index === null ? "Not answered" : row.options[row.selected_option_index]}
            </p>
            {!row.is_correct && <p className="quiz-correct-answer">Correct answer: {row.options[row.correct_option_index]}</p>}
            {row.explanation && <p className="quiz-answer-explanation">{row.explanation}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
