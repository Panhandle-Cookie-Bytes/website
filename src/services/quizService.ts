import { requireSupabase } from "../lib/supabase";
import type {
  Program,
  Quiz,
  QuizAttemptResultRow,
  QuizAttemptStart,
  QuizEditorData,
  QuizQuestionInput,
  QuizStatus,
  TeamRole,
  TeamVisibility,
} from "../types/database";

const QUIZ_COLUMNS = "id,created_by,title,description,program,category,difficulty,visibility,status,allow_question_preview,created_at,updated_at";
const ASSIGNMENT_COLUMNS = "team_id,quiz_id,assigned_by,due_at,assigned_at";

export interface QuizChanges {
  title: string;
  description: string;
  program: Program;
  category: string;
  difficulty: Quiz["difficulty"];
  visibility: TeamVisibility;
  status: QuizStatus;
  allow_question_preview: boolean;
  questions: QuizQuestionInput[];
}

export interface QuizTeamAssignment {
  team_id: string;
  team_name: string;
  due_at: string | null;
  assigned_at: string;
  role: TeamRole;
}

export interface QuizListItem {
  quiz: Quiz;
  attempts: {
    count: number;
    bestScore: number | null;
    latestScore: number | null;
  };
  assignments: QuizTeamAssignment[];
}

export interface TeamAssignedQuiz {
  quiz: Quiz;
  due_at: string | null;
  assigned_at: string;
  attempts: {
    count: number;
    bestScore: number | null;
    latestScore: number | null;
  };
}

export interface QuizAttemptSummary {
  score: number | null;
  finished_at: string | null;
  started_at: string;
}

export async function listQuizAttempts(quizId: string, userId: string): Promise<QuizAttemptSummary[]> {
  const { data, error } = await requireSupabase()
    .from("quiz_attempts")
    .select("score,finished_at,started_at")
    .eq("quiz_id", quizId)
    .eq("user_id", userId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listAccessibleQuizzes(userId: string): Promise<QuizListItem[]> {
  const client = requireSupabase();
  const { data: quizzes, error: quizzesError } = await client
    .from("quizzes")
    .select(QUIZ_COLUMNS)
    .order("updated_at", { ascending: false });
  if (quizzesError) throw quizzesError;
  if (!quizzes.length) return [];

  const quizIds = quizzes.map(({ id }) => id);
  const { data: memberships, error: membershipsError } = await client
    .from("team_members")
    .select("team_id,role")
    .eq("user_id", userId);
  if (membershipsError) throw membershipsError;

  const { data: attempts, error: attemptsError } = await client
    .from("quiz_attempts")
    .select("quiz_id,score,started_at")
    .eq("user_id", userId)
    .in("quiz_id", quizIds)
    .order("started_at", { ascending: false });
  if (attemptsError) throw attemptsError;

  const teamIds = memberships.map(({ team_id }) => team_id);
  const { data: rawAssignments, error: assignmentsError } = teamIds.length
    ? await client
      .from("team_quiz_assignments")
      .select(ASSIGNMENT_COLUMNS)
      .in("team_id", teamIds)
      .in("quiz_id", quizIds)
    : { data: [], error: null };
  if (assignmentsError) throw assignmentsError;

  const assignmentTeamIds = [...new Set(rawAssignments.map(({ team_id }) => team_id))];
  const { data: teams, error: teamsError } = assignmentTeamIds.length
    ? await client.from("teams").select("id,name").in("id", assignmentTeamIds)
    : { data: [], error: null };
  if (teamsError) throw teamsError;

  const teamNames = new Map(teams.map(({ id, name }) => [id, name]));
  const teamRoles = new Map(memberships.map(({ team_id, role }) => [team_id, role]));
  const attemptsByQuiz = new Map<string, typeof attempts>();
  for (const attempt of attempts) {
    const quizAttempts = attemptsByQuiz.get(attempt.quiz_id) ?? [];
    quizAttempts.push(attempt);
    attemptsByQuiz.set(attempt.quiz_id, quizAttempts);
  }
  const assignmentsByQuiz = new Map<string, QuizTeamAssignment[]>();
  for (const assignment of rawAssignments) {
    const quizAssignments = assignmentsByQuiz.get(assignment.quiz_id) ?? [];
    quizAssignments.push({
      team_id: assignment.team_id,
      team_name: teamNames.get(assignment.team_id) ?? "Team",
      due_at: assignment.due_at,
      assigned_at: assignment.assigned_at,
      role: teamRoles.get(assignment.team_id) ?? "student",
    });
    assignmentsByQuiz.set(assignment.quiz_id, quizAssignments);
  }

  return quizzes.map((quiz) => {
    const quizAttempts = attemptsByQuiz.get(quiz.id) ?? [];
    const scores = quizAttempts.flatMap(({ score }) => score === null ? [] : [score]);
    return {
      quiz,
      attempts: {
        count: scores.length,
        bestScore: scores.length ? Math.max(...scores) : null,
        latestScore: scores[0] ?? null,
      },
      assignments: assignmentsByQuiz.get(quiz.id) ?? [],
    };
  });
}

export async function getQuiz(quizId: string): Promise<Quiz> {
  const { data, error } = await requireSupabase()
    .from("quizzes")
    .select(QUIZ_COLUMNS)
    .eq("id", quizId)
    .single();
  if (error) throw error;
  return data;
}

export async function getQuizEditor(quizId: string): Promise<QuizEditorData> {
  const [editorResult, quiz] = await Promise.all([
    requireSupabase().rpc("get_quiz_editor", { _quiz_id: quizId }),
    getQuiz(quizId),
  ]);
  const { data, error } = editorResult;
  if (error) throw error;
  const firstRow = data[0];
  if (!firstRow) throw new Error("This quiz could not be found or you do not have permission to edit it.");
  return {
    quiz,
    questions: data.flatMap((row) => row.question_id && row.prompt && row.options && row.correct_option_index !== null
      ? [{
        prompt: row.prompt,
        options: row.options,
        correct_index: row.correct_option_index,
        explanation: row.explanation ?? "",
      }]
      : []),
  };
}

export async function createQuiz(changes: QuizChanges): Promise<string> {
  const { data, error } = await requireSupabase().rpc("create_quiz", {
    _title: changes.title,
    _description: changes.description,
    _program: changes.program,
    _category: changes.category,
    _difficulty: changes.difficulty,
    _visibility: changes.visibility,
    _status: changes.status,
    _allow_question_preview: changes.allow_question_preview,
    _questions: changes.questions,
  });
  if (error) throw error;
  if (!data) throw new Error("The quiz was saved without an ID. Check your quiz list before retrying.");
  return data;
}

export async function updateQuiz(quizId: string, changes: QuizChanges): Promise<void> {
  const { error } = await requireSupabase().rpc("update_quiz", {
    _quiz_id: quizId,
    _title: changes.title,
    _description: changes.description,
    _program: changes.program,
    _category: changes.category,
    _difficulty: changes.difficulty,
    _visibility: changes.visibility,
    _status: changes.status,
    _allow_question_preview: changes.allow_question_preview,
    _questions: changes.questions,
  });
  if (error) throw error;
}

export async function startQuizAttempt(quizId: string): Promise<QuizAttemptStart[]> {
  const { data, error } = await requireSupabase().rpc("start_quiz_attempt", { _quiz_id: quizId });
  if (error) throw error;
  if (!data.length) throw new Error("This quiz does not have any available questions.");
  return data;
}

export async function submitQuizAttempt(attemptId: string, answers: Record<string, number>) {
  const { data, error } = await requireSupabase().rpc("submit_quiz_attempt", {
    _attempt_id: attemptId,
    _answers: answers,
  });
  if (error) throw error;
  const result = data[0];
  if (!result) throw new Error("Your answers were not submitted. Check your attempt history before retrying.");
  return result;
}

export async function getQuizAttemptResults(attemptId: string): Promise<QuizAttemptResultRow[]> {
  const { data, error } = await requireSupabase().rpc("get_quiz_attempt_results", {
    _attempt_id: attemptId,
  });
  if (error) throw error;
  if (!data.length) throw new Error("Completed quiz results could not be found.");
  return data;
}

export async function listAssignableQuizzes(userId: string): Promise<Quiz[]> {
  const { data, error } = await requireSupabase()
    .from("quizzes")
    .select(QUIZ_COLUMNS)
    .eq("status", "published")
    .order("title", { ascending: true });
  if (error) throw error;
  return data.filter((quiz) => quiz.visibility === "public" || quiz.created_by === userId);
}

export async function assignQuizToTeam(teamId: string, quizId: string, dueAt: string | null): Promise<void> {
  const { error } = await requireSupabase().rpc("assign_quiz_to_team", {
    _team_id: teamId,
    _quiz_id: quizId,
    _due_at: dueAt,
  });
  if (error) throw error;
}

export async function removeQuizAssignment(teamId: string, quizId: string): Promise<void> {
  const { error } = await requireSupabase().rpc("remove_quiz_assignment", {
    _team_id: teamId,
    _quiz_id: quizId,
  });
  if (error) throw error;
}

export async function listTeamAssignedQuizzes(
  teamId: string,
  userId: string,
): Promise<TeamAssignedQuiz[]> {
  const client = requireSupabase();
  const { data: assignments, error: assignmentsError } = await client
    .from("team_quiz_assignments")
    .select(ASSIGNMENT_COLUMNS)
    .eq("team_id", teamId)
    .order("assigned_at", { ascending: false });
  if (assignmentsError) throw assignmentsError;
  if (!assignments.length) return [];

  const quizIds = assignments.map(({ quiz_id }) => quiz_id);
  const [{ data: quizzes, error: quizzesError }, { data: attempts, error: attemptsError }] = await Promise.all([
    client.from("quizzes").select(QUIZ_COLUMNS).in("id", quizIds),
    client.from("quiz_attempts").select("quiz_id,score,started_at")
      .eq("user_id", userId).in("quiz_id", quizIds).order("started_at", { ascending: false }),
  ]);
  if (quizzesError) throw quizzesError;
  if (attemptsError) throw attemptsError;

  const quizzesById = new Map(quizzes.map((quiz) => [quiz.id, quiz]));
  const attemptsByQuiz = new Map<string, typeof attempts>();
  for (const attempt of attempts) {
    const quizAttempts = attemptsByQuiz.get(attempt.quiz_id) ?? [];
    quizAttempts.push(attempt);
    attemptsByQuiz.set(attempt.quiz_id, quizAttempts);
  }

  return assignments.flatMap((assignment) => {
    const quiz = quizzesById.get(assignment.quiz_id);
    if (!quiz) return [];
    const quizAttempts = attemptsByQuiz.get(quiz.id) ?? [];
    const scores = quizAttempts.flatMap(({ score }) => score === null ? [] : [score]);
    return [{
      quiz,
      due_at: assignment.due_at,
      assigned_at: assignment.assigned_at,
      attempts: {
        count: scores.length,
        bestScore: scores.length ? Math.max(...scores) : null,
        latestScore: scores[0] ?? null,
      },
    }];
  });
}
