import { requireSupabase } from "../lib/supabase";
import type { Program, Quiz } from "../types/database";

export interface PopularQuiz extends Omit<Quiz, "created_by"> {
  attempt_count: number;
}

export interface HomeDashboardStats {
  quizzes_completed: number;
  average_score: number | null;
  correct_answers: number;
  current_streak: number;
}

export interface HomeActivity {
  activity_type: "completed" | "created";
  attempt_id: string | null;
  quiz_id: string;
  quiz_title: string;
  program: Program;
  score: number | null;
  correct_count: number | null;
  total_questions: number | null;
  occurred_at: string;
}

export async function listPopularPublicQuizzes(limit = 6): Promise<PopularQuiz[]> {
  const { data, error } = await requireSupabase().rpc("get_popular_public_quizzes", {
    _limit: limit,
  });
  if (error) throw error;
  return data.map((quiz) => ({ ...quiz, attempt_count: Number(quiz.attempt_count) }));
}

export async function getHomeDashboardStats(): Promise<HomeDashboardStats> {
  const { data, error } = await requireSupabase().rpc("get_home_dashboard_stats");
  if (error) throw error;
  const stats = data[0];
  if (!stats) throw new Error("Dashboard statistics could not be loaded.");
  return {
    quizzes_completed: Number(stats.quizzes_completed),
    average_score: stats.average_score === null ? null : Number(stats.average_score),
    correct_answers: Number(stats.correct_answers),
    current_streak: Number(stats.current_streak),
  };
}

export async function getHomeRecentActivity(limit = 8): Promise<HomeActivity[]> {
  const { data, error } = await requireSupabase().rpc("get_home_recent_activity", {
    _limit: limit,
  });
  if (error) throw error;
  return data;
}
