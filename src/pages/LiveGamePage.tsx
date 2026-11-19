import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Clipboard, Crown, LoaderCircle, Radio, RefreshCw, Timer, Trophy, UsersRound } from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  advanceLiveGame,
  cancelLiveGame,
  getLiveGameSnapshot,
  startLiveGame,
  submitLiveGameAnswer,
} from "../services/liveGameService";
import type { LiveGameSnapshotRow } from "../types/database";

export function LiveGamePage() {
  const { gameId = "" } = useParams();
  const [rows, setRows] = useState<LiveGameSnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [copied, setCopied] = useState(false);
  const [pendingOption, setPendingOption] = useState<number | null>(null);
  const lastAutoAdvancePosition = useRef<number | null>(null);

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const nextRows = await getLiveGameSnapshot(gameId);
      setRows(nextRows);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this game room.");
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    void refresh(true);
    const client = supabase;
    if (!client) return;
    const channel = client
      .channel(`live-game-${gameId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "live_games",
        filter: `id=eq.${gameId}`,
      }, () => { void refresh(); })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeError(null);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRealtimeError("Live updates are unavailable. Use Refresh to check the room state.");
        }
      });
    return () => { void client.removeChannel(channel); };
  }, [gameId, refresh]);

  const game = rows[0] ?? null;
  const players = useMemo(
    () => rows.filter((row) => row.player_display_name !== null),
    [rows],
  );
  const ownPlayer = players.find((player) => player.is_current_user) ?? null;
  const answeredCount = players.filter((player) => player.has_answered_current_question).length;
  const deadlineMs = game?.question_deadline ? Date.parse(game.question_deadline) : null;

  useEffect(() => {
    if (!deadlineMs || game?.status !== "running") {
      setSecondsLeft(0);
      return;
    }
    const updateTime = () => setSecondsLeft(Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000)));
    updateTime();
    const timerId = window.setInterval(updateTime, 250);
    return () => window.clearInterval(timerId);
  }, [deadlineMs, game?.status]);

  useEffect(() => {
    if (!game || game.status !== "running" || secondsLeft > 0) return;
    if (!game.question_deadline || Date.parse(game.question_deadline) > Date.now()) return;
    if (lastAutoAdvancePosition.current === game.current_question_position) return;
    lastAutoAdvancePosition.current = game.current_question_position;
    void advanceLiveGame(game.game_id, game.current_question_position, true)
      .then(() => refresh())
      .catch((advanceError: unknown) => {
        setError(advanceError instanceof Error ? advanceError.message : "The question could not be advanced.");
      });
  }, [game, refresh, secondsLeft]);

  async function handleStart() {
    if (!game) return;
    setBusy(true);
    setError(null);
    try {
      await startLiveGame(game.game_id);
      await refresh();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start the game.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdvance() {
    if (!game) return;
    setBusy(true);
    setError(null);
    try {
      await advanceLiveGame(game.game_id, game.current_question_position, false);
      await refresh();
    } catch (advanceError) {
      setError(advanceError instanceof Error ? advanceError.message : "Could not advance the game.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!game) return;
    setBusy(true);
    setError(null);
    try {
      await cancelLiveGame(game.game_id);
      await refresh();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Could not cancel the game.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAnswer(optionIndex: number) {
    if (!game || !ownPlayer || game.status !== "running") return;
    setBusy(true);
    setPendingOption(optionIndex);
    setError(null);
    try {
      await submitLiveGameAnswer(game.game_id, game.current_question_position, optionIndex);
      await refresh();
    } catch (answerError) {
      setError(answerError instanceof Error ? answerError.message : "Your answer could not be submitted.");
    } finally {
      setPendingOption(null);
      setBusy(false);
    }
  }

  async function handleCopyCode() {
    if (!game?.join_code) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(game.join_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (copyError) {
      setError(copyError instanceof Error ? `Could not copy the game code: ${copyError.message}` : "Could not copy the game code.");
    }
  }

  if (loading) {
    return <section className="account-page game-room-page"><p role="status">Loading game room…</p></section>;
  }

  if (!game) {
    return (
      <section className="account-page game-room-page">
        <p className="notice notice-error" role="alert">{error ?? "This game is unavailable."}</p>
        <Link className="button button-secondary" to="/games"><ArrowLeft size={16} aria-hidden="true" /> Back to games</Link>
      </section>
    );
  }

  const ownAnswerSubmitted = ownPlayer?.has_answered_current_question ?? false;
  const isHost = game.is_host;

  return (
    <section className="account-page game-room-page">
      <Link className="text-link game-back-link" to="/games"><ArrowLeft size={15} aria-hidden="true" /> Games</Link>
      <header className="game-room-heading">
        <div>
          <span className="eyebrow"><span className="eyebrow-mark" /> {isHost ? "Host room" : "Player room"}</span>
          <h1>{game.quiz_title}</h1>
          <p>Hosted by {game.host_display_name}</p>
        </div>
        <div className="game-heading-actions">
          <button className="button button-secondary game-refresh-button" type="button" disabled={loading} onClick={() => void refresh(true)}>
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </button>
          <span className={`game-status-badge game-status-${game.status}`}>
            <span aria-hidden="true" /> {game.status}
          </span>
        </div>
      </header>

      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {realtimeError && <p className="notice game-realtime-notice" role="status">{realtimeError}</p>}

      {game.status === "lobby" && (
        <div className="account-panel panel game-lobby-panel">
          <div className="game-lobby-intro">
            <div className="game-card-icon"><Radio size={21} aria-hidden="true" /></div>
            <div>
              <h2>{isHost ? "Your room is ready" : "You’re in the lobby"}</h2>
              <p>{isHost ? "Share the code with players who can access this quiz, then start when everyone is ready." : "Wait for the host to start the game. Keep this page open for live updates."}</p>
            </div>
          </div>
          {isHost && game.join_code && (
            <div className="game-code-share">
              <div><span>Join code</span><strong>{game.join_code}</strong></div>
              <button className="button button-secondary" type="button" onClick={() => void handleCopyCode()}>
                {copied ? <Check size={16} aria-hidden="true" /> : <Clipboard size={16} aria-hidden="true" />}
                {copied ? "Copied" : "Copy code"}
              </button>
            </div>
          )}
          <PlayerList players={players} />
          {isHost ? (
            <div className="game-host-actions">
              <button className="button button-secondary" type="button" disabled={busy} onClick={() => void handleCancel()}>
                Cancel room
              </button>
              <button className="button button-primary" type="button" disabled={busy || players.length === 0} onClick={() => void handleStart()}>
                {busy ? "Starting…" : "Start game"} <Radio size={16} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <p className="game-wait-message" role="status"><LoaderCircle size={16} aria-hidden="true" /> Waiting for the host…</p>
          )}
        </div>
      )}

      {game.status === "running" && (
        <div className="game-play-layout">
          <section className="account-panel panel game-question-panel">
            <div className="game-question-topline">
              <span>Question {game.current_question_position} of {game.question_count}</span>
              <span className={`game-timer${secondsLeft <= 5 ? " game-timer-urgent" : ""}`}>
                <Timer size={16} aria-hidden="true" /> {secondsLeft}s
              </span>
            </div>
            <div className="game-timer-track" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (secondsLeft / 20) * 100)}%` }} />
            </div>
            <h2>{game.question_prompt}</h2>
            {game.question_options && (
              <div className="game-answer-options">
                {game.question_options.map((option, index) => {
                  const selected = ownPlayer?.own_selected_option_index === index;
                  return (
                    <button
                      className={`game-answer-option${selected ? " is-selected" : ""}`}
                      key={`${index}-${option}`}
                      type="button"
                      disabled={!ownPlayer || ownAnswerSubmitted || busy || secondsLeft === 0}
                      onClick={() => void handleAnswer(index)}
                    >
                      <span className="game-option-letter">{String.fromCharCode(65 + index)}</span>
                      <span>{option}</span>
                      {pendingOption === index && <LoaderCircle size={17} aria-label="Submitting answer" />}
                      {selected && pendingOption === null && <Check size={17} aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            )}
            {!ownPlayer && <p className="notice notice-error">You’re not registered as a player in this room.</p>}
            {ownAnswerSubmitted && <p className="game-answer-confirmation" role="status">Answer locked in. Waiting for the next question.</p>}
          </section>
          <aside className="account-panel panel game-score-panel">
            <div className="game-score-heading">
              <div><Trophy size={18} aria-hidden="true" /><h2>Leaderboard</h2></div>
              <span>{answeredCount}/{players.length} answered</span>
            </div>
            <PlayerList players={players} compact />
            {isHost && (
              <button className="button button-primary game-next-button" type="button" disabled={busy} onClick={() => void handleAdvance()}>
                {busy ? "Updating…" : game.current_question_position === game.question_count ? "End game & show results" : "Next question"}
              </button>
            )}
          </aside>
        </div>
      )}

      {game.status === "completed" && (
        <section className="account-panel panel game-results-panel">
          <div className="game-results-heading">
            <span className="game-card-icon"><Trophy size={22} aria-hidden="true" /></span>
            <div><span className="eyebrow"><span className="eyebrow-mark" /> Game complete</span><h2>Final leaderboard</h2></div>
          </div>
          <PlayerList players={players} results />
          <Link className="button button-primary" to="/games">Host or join another game <ArrowLeft size={16} aria-hidden="true" /></Link>
        </section>
      )}

      {game.status === "cancelled" && (
        <section className="account-panel panel game-closed-panel">
          <h2>This game room was cancelled.</h2>
          <p>The host ended this room before the results were finalized.</p>
          <Link className="button button-secondary" to="/games">Back to live games</Link>
        </section>
      )}
    </section>
  );
}

function PlayerList({
  players,
  compact = false,
  results = false,
}: {
  players: LiveGameSnapshotRow[];
  compact?: boolean;
  results?: boolean;
}) {
  if (!players.length) {
    return <div className="game-empty-state"><UsersRound size={20} aria-hidden="true" /><span>No players have joined yet.</span></div>;
  }

  return (
    <ol className={`game-player-list${compact ? " game-player-list-compact" : ""}${results ? " game-player-list-results" : ""}`}>
      {players.map((player, index) => (
        <li key={`${player.player_display_name}-${index}`}>
          <span className="game-player-rank">{index === 0 && results ? <Crown size={15} aria-label="First place" /> : index + 1}</span>
          <span className="game-player-name">{player.player_display_name}{player.is_current_user ? " (you)" : ""}</span>
          {player.has_answered_current_question && !results && <Check className="game-player-answered" size={15} aria-label="Answered" />}
          <strong>{player.player_score ?? 0}<small> pts</small></strong>
        </li>
      ))}
    </ol>
  );
}
