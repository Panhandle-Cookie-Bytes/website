import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, CalendarClock, Trash2 } from "lucide-react";
import {
  assignQuizToTeam,
  listAssignableQuizzes,
  listTeamAssignedQuizzes,
  removeQuizAssignment,
  type TeamAssignedQuiz,
} from "../services/quizService";
import type { Quiz } from "../types/database";

interface TeamQuizAssignmentsProps {
  teamId: string;
  userId: string;
  canManage: boolean;
}

function localDateTimeToIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function dueLabel(value: string | null) {
  if (!value) return "No due date";
  const date = new Date(value);
  return `${date.toLocaleDateString()}${date.getHours() || date.getMinutes() ? ` at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`;
}

export function TeamQuizAssignments({ teamId, userId, canManage }: TeamQuizAssignmentsProps) {
  const [assignments, setAssignments] = useState<TeamAssignedQuiz[]>([]);
  const [availableQuizzes, setAvailableQuizzes] = useState<Quiz[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [assigned, available] = await Promise.all([
      listTeamAssignedQuizzes(teamId, userId),
      canManage ? listAssignableQuizzes(userId) : Promise.resolve([]),
    ]);
    setAssignments(assigned);
    setAvailableQuizzes(available.filter((quiz) => !assigned.some((item) => item.quiz.id === quiz.id)));
    setSelectedQuizId((current) => available.some((quiz) =>
      quiz.id === current && !assigned.some((item) => item.quiz.id === quiz.id))
      ? current
      : available.find((quiz) => !assigned.some((item) => item.quiz.id === quiz.id))?.id ?? "");
  }, [canManage, teamId, userId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void reload().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load assigned quizzes.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [reload]);

  async function handleAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedQuizId) {
      setError("Create or publish a quiz before assigning it.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await assignQuizToTeam(teamId, selectedQuizId, localDateTimeToIso(dueAt));
      setDueAt("");
      await reload();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Could not assign this quiz.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(quizId: string, title: string) {
    if (!window.confirm(`Remove "${title}" from this team’s assigned quizzes? Existing quiz attempts are not deleted.`)) return;
    setBusy(true);
    setError(null);
    try {
      await removeQuizAssignment(teamId, quizId);
      await reload();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove this assignment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel account-panel team-assigned-quizzes">
      <div className="panel-heading">
        <div><span className="eyebrow">{canManage ? "Coach tools" : "Team practice"}</span><h2>Assigned quizzes</h2></div>
        <span className="security-icon"><BookOpen size={18} aria-hidden="true" /></span>
      </div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}

      {canManage && (
        <form className="team-assign-quiz-form" onSubmit={(event) => void handleAssign(event)}>
          <label className="field">
            <span>Published quiz</span>
            <select value={selectedQuizId} onChange={(event) => setSelectedQuizId(event.target.value)} disabled={availableQuizzes.length === 0}>
              {availableQuizzes.length
                ? availableQuizzes.map((quiz) => (
                  <option value={quiz.id} key={quiz.id}>{quiz.title} · {quiz.program}</option>
                ))
                : <option value="">No quizzes available to assign</option>}
            </select>
          </label>
          <label className="field">
            <span>Due date <small>optional</small></span>
            <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </label>
          <button className="button button-primary" type="submit" disabled={busy || !selectedQuizId}>
            {busy ? "Assigning…" : "Assign quiz"} <ArrowRight size={15} aria-hidden="true" />
          </button>
          {!availableQuizzes.length && (
            <p className="field-hint">Only published public quizzes and published quizzes you created can be assigned. <Link to="/quizzes">Open quiz library</Link>.</p>
          )}
        </form>
      )}

      {loading ? (
        <p className="team-empty">Loading assigned quizzes…</p>
      ) : assignments.length ? (
        <div className="team-assignment-list">
          {assignments.map(({ quiz, due_at, attempts }) => (
            <article className="team-assignment-row" key={quiz.id}>
              <span className="team-card-icon"><BookOpen size={18} aria-hidden="true" /></span>
              <div className="team-assignment-copy">
                <Link to={`/quizzes/${quiz.id}`}>{quiz.title}</Link>
                <span>{quiz.program} · {quiz.category}</span>
                <span className="team-assignment-due"><CalendarClock size={13} aria-hidden="true" /> {dueLabel(due_at)}</span>
                {attempts.count > 0 && (
                  <span>{attempts.count} completed attempt{attempts.count === 1 ? "" : "s"}{attempts.latestScore !== null ? ` · Latest ${attempts.latestScore}%` : ""}</span>
                )}
              </div>
              <Link className="button button-secondary button-small" to={`/quizzes/${quiz.id}`}>
                {attempts.count ? "Practice" : "Start"} <ArrowRight size={13} aria-hidden="true" />
              </Link>
              {canManage && (
                <button
                  className="icon-button quiz-delete-button"
                  type="button"
                  aria-label={`Remove ${quiz.title} assignment`}
                  disabled={busy}
                  onClick={() => void handleRemove(quiz.id, quiz.title)}
                ><Trash2 size={15} aria-hidden="true" /></button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="team-empty">
          <p>{canManage
            ? "No quizzes are assigned to this team yet. Publish a quiz and assign it to get started."
            : "Your coach hasn’t assigned any quizzes to this team yet."}</p>
        </div>
      )}
    </section>
  );
}
