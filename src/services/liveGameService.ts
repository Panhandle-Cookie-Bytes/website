import { requireSupabase } from "../lib/supabase";
import type { LiveGameSnapshotRow } from "../types/database";

export async function createLiveGame(quizId: string): Promise<{ gameId: string; joinCode: string }> {
  const { data, error } = await requireSupabase().rpc("create_live_game", { _quiz_id: quizId });
  if (error) throw error;
  const result = data[0];
  if (!result) throw new Error("The game room was not created. Check your game list before retrying.");
  return { gameId: result.game_id, joinCode: result.join_code };
}

export async function joinLiveGame(joinCode: string): Promise<string> {
  const { data, error } = await requireSupabase().rpc("join_live_game", {
    _join_code: joinCode.trim().toUpperCase(),
  });
  if (error) throw error;
  if (!data) throw new Error("The game could not be joined. Check the code and try again.");
  return data;
}

export async function getLiveGameSnapshot(gameId: string): Promise<LiveGameSnapshotRow[]> {
  const { data, error } = await requireSupabase().rpc("get_live_game_snapshot", {
    _game_id: gameId,
  });
  if (error) throw error;
  if (!data.length) throw new Error("This game could not be found or is unavailable to your account.");
  return data;
}

export async function startLiveGame(gameId: string): Promise<void> {
  const { error } = await requireSupabase().rpc("start_live_game", { _game_id: gameId });
  if (error) throw error;
}

export async function submitLiveGameAnswer(
  gameId: string,
  questionPosition: number,
  selectedOptionIndex: number,
): Promise<void> {
  const { error } = await requireSupabase().rpc("submit_live_game_answer", {
    _game_id: gameId,
    _question_position: questionPosition,
    _selected_option_index: selectedOptionIndex,
  });
  if (error) throw error;
}

export async function advanceLiveGame(
  gameId: string,
  expectedQuestionPosition: number,
  expiredOnly: boolean,
): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc("advance_live_game", {
    _game_id: gameId,
    _expected_question_position: expectedQuestionPosition,
    _expired_only: expiredOnly,
  });
  if (error) throw error;
  return data;
}

export async function cancelLiveGame(gameId: string): Promise<void> {
  const { error } = await requireSupabase().rpc("cancel_live_game", { _game_id: gameId });
  if (error) throw error;
}
