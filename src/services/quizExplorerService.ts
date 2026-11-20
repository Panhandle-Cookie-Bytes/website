import { requireSupabase } from "../lib/supabase";
import type {
  Program,
  QuizDetailData,
  QuizDifficulty,
  QuizExplorerRow,
  QuizQuestionPreview,
} from "../types/database";
import { getQuizMediaUrls } from "./quizMediaService";

export type QuizExplorerSort =
  | "most_popular"
  | "highest_rated"
  | "recent"
  | "most_played"
  | "shortest";

export interface QuizExplorerFilters {
  program: Program | "";
  category: string;
  difficulty: QuizDifficulty | "";
  search: string;
  sort: QuizExplorerSort;
  limit: number;
  offset: number;
}

export async function listPublicQuizzes(filters: QuizExplorerFilters): Promise<QuizExplorerRow[]> {
  const { data, error } = await requireSupabase().rpc("get_quiz_explorer", {
    _program: filters.program || null,
    _category: filters.category || null,
    _difficulty: filters.difficulty || null,
    _search: filters.search.trim() || null,
    _sort: filters.sort,
    _limit: filters.limit,
    _offset: filters.offset,
  });
  if (error) throw error;
  return data.map((quiz) => ({
    ...quiz,
    play_count: Number(quiz.play_count),
    favorite_count: Number(quiz.favorite_count),
    rating_count: Number(quiz.rating_count),
    average_rating: quiz.average_rating === null ? null : Number(quiz.average_rating),
  }));
}

export async function getPublicQuizDetail(quizId: string): Promise<QuizDetailData> {
  const { data, error } = await requireSupabase().rpc("get_quiz_detail", {
    _quiz_id: quizId,
  });
  if (error) throw error;
  const quiz = data[0];
  if (!quiz) throw new Error("This quiz could not be found or is unavailable to your account.");
  const imageUrls = await getQuizMediaUrls([quiz.cover_image_path]);
  return {
    ...quiz,
    play_count: Number(quiz.play_count),
    favorite_count: Number(quiz.favorite_count),
    rating_count: Number(quiz.rating_count),
    average_rating: quiz.average_rating === null ? null : Number(quiz.average_rating),
    my_rating: quiz.my_rating === null ? null : Number(quiz.my_rating),
    cover_image_url: quiz.cover_image_path ? imageUrls.get(quiz.cover_image_path) ?? null : null,
  };
}

export async function getPublicQuizQuestionPreview(quizId: string): Promise<QuizQuestionPreview[]> {
  const { data, error } = await requireSupabase().rpc("get_public_quiz_question_preview", {
    _quiz_id: quizId,
  });
  if (error) throw error;
  const imageUrls = await getQuizMediaUrls(data.map((question) => question.image_path));
  return data.map((question) => ({
    ...question,
    image_url: question.image_path ? imageUrls.get(question.image_path) ?? null : null,
  }));
}

export async function setQuizFavorite(quizId: string, favorited: boolean): Promise<void> {
  const { error } = await requireSupabase().rpc("set_quiz_favorite", {
    _quiz_id: quizId,
    _favorited: favorited,
  });
  if (error) throw error;
}

export async function ratePublicQuiz(quizId: string, rating: number): Promise<void> {
  const { error } = await requireSupabase().rpc("rate_public_quiz", {
    _quiz_id: quizId,
    _rating: rating,
  });
  if (error) throw error;
}
