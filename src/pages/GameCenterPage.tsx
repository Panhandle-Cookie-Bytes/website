import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Gamepad2, Radio, UsersRound } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { createLiveGame, joinLiveGame } from "../services/liveGameService";
import { listAccessibleQuizzes, type QuizListItem } from "../services/quizService";
import { canCreateQuizzes } from "../services/teamService";

const JOIN_CODE_PATTERN = /[^A-HJ-NP-Z2-9]/g;
const JOIN_CODE_LENGTH = 8;

export function GameCenterPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setCanCreate(false);
    setPermissionLoading(true);
    setPermissionError(null);
    void listAccessibleQuizzes(user.id).then((items) => {
      if (active) {
        const published = items.filter(({ quiz }) => quiz.status === "published");
        setQuizzes(published);
        setSelectedQuizId(published[0]?.quiz.id ?? "");
      }
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load your quizzes.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    void canCreateQuizzes().then((allowed) => {
      if (active) setCanCreate(allowed);
    }).catch((permissionLoadError: unknown) => {
      if (active) setPermissionError(permissionLoadError instanceof Error
        ? permissionLoadError.message
        : "Could not check quiz-creation permission.");
    }).finally(() => {
      if (active) setPermissionLoading(false);
    });
    return () => { active = false; };
  }, [user]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedQuizId) return;
    setBusy(true);
    setError(null);
    try {
      const { gameId } = await createLiveGame(selectedQuizId);
      navigate(`/games/${gameId}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the game room.");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const gameId = await joinLiveGame(joinCode);
      navigate(`/games/${gameId}`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join that game.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account-page game-center-page">
      <header className="page-heading">
        <span className="eyebrow"><span className="eyebrow-mark" /> Live competition</span>
        <h1>Live quiz games</h1>
        <p>Host a room from a published quiz or join your team with a game code.</p>
      </header>

      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {permissionError && <p className="notice notice-error" role="alert">Quiz-creation access couldn’t be checked: {permissionError}</p>}

      <div className="game-center-grid">
        <form className="account-panel panel game-center-card" onSubmit={(event) => void handleCreate(event)}>
          <div className="game-card-icon"><Radio size={21} aria-hidden="true" /></div>
          <h2>Host a game</h2>
          <p>Choose a published quiz you can access. The room gets a unique code to share with players.</p>
          {loading ? (
            <p role="status">Loading your published quizzes…</p>
          ) : quizzes.length ? (
            <>
              <label className="field-label" htmlFor="game-quiz">Quiz</label>
              <select
                id="game-quiz"
                className="form-control"
                value={selectedQuizId}
                onChange={(event) => setSelectedQuizId(event.target.value)}
                required
              >
                {quizzes.map(({ quiz }) => (
                  <option key={quiz.id} value={quiz.id}>{quiz.title} · {quiz.program}</option>
                ))}
              </select>
              <button className="button button-primary game-form-button" type="submit" disabled={busy || !selectedQuizId}>
                {busy ? "Creating room…" : "Create game room"} <ArrowRight size={16} aria-hidden="true" />
              </button>
            </>
          ) : (
            <div className="game-empty-state">
              <Gamepad2 size={22} aria-hidden="true" />
              <span>There are no published quizzes available to host.</span>
              {canCreate && <Link className="text-link" to="/quizzes/create">Create a quiz</Link>}
              {!permissionLoading && !canCreate && !permissionError && <span>Ask a team owner or administrator to enable quiz creation.</span>}
            </div>
          )}
        </form>

        <form className="account-panel panel game-center-card" onSubmit={(event) => void handleJoin(event)}>
          <div className="game-card-icon"><UsersRound size={21} aria-hidden="true" /></div>
          <h2>Join a game</h2>
          <p>Enter the 8-character room code from your host. You must have access to that quiz.</p>
          <label className="field-label" htmlFor="game-code">Game code</label>
          <input
            id="game-code"
            className="form-control game-code-input"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(JOIN_CODE_PATTERN, "").slice(0, JOIN_CODE_LENGTH))}
            placeholder="AB23CDEF"
            autoComplete="off"
            inputMode="text"
            maxLength={JOIN_CODE_LENGTH}
            required
          />
          <button className="button button-secondary game-form-button" type="submit" disabled={busy || joinCode.length !== JOIN_CODE_LENGTH}>
            {busy ? "Joining…" : "Join game"} <ArrowRight size={16} aria-hidden="true" />
          </button>
        </form>
      </div>
    </section>
  );
}
