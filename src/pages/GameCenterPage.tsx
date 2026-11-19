import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Gamepad2, Radio, UsersRound } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { createLiveGame, joinLiveGame } from "../services/liveGameService";
import { listAccessibleQuizzes, type QuizListItem } from "../services/quizService";

export function GameCenterPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
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
              <Link className="text-link" to="/quizzes/create">Create a quiz</Link>
            </div>
          )}
        </form>

        <form className="account-panel panel game-center-card" onSubmit={(event) => void handleJoin(event)}>
          <div className="game-card-icon"><UsersRound size={21} aria-hidden="true" /></div>
          <h2>Join a game</h2>
          <p>Enter the 16-character room code from your host. You must have access to that quiz.</p>
          <label className="field-label" htmlFor="game-code">Game code</label>
          <input
            id="game-code"
            className="form-control game-code-input"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g, "").slice(0, 16))}
            placeholder="A1B2C3D4E5F60718"
            autoComplete="off"
            inputMode="text"
            maxLength={16}
            required
          />
          <button className="button button-secondary game-form-button" type="submit" disabled={busy || joinCode.length !== 16}>
            {busy ? "Joining…" : "Join game"} <ArrowRight size={16} aria-hidden="true" />
          </button>
        </form>
      </div>
    </section>
  );
}
