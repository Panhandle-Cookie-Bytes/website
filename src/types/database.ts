export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Program = "FLL" | "FTC" | "FRC" | "General FIRST";
export type ProfileVisibility = "private" | "public";
export type TeamVisibility = "private" | "public";
export type QuizVisibility = "private" | "team" | "public";
export type TeamRole = "owner" | "administrator" | "coach" | "student";

export type Profile = {
  id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  preferred_program: Program | null;
  profile_visibility: ProfileVisibility;
  created_at: string;
};

export type Team = {
  id: string;
  name: string;
  team_number: string;
  program: Program;
  description: string;
  logo_url: string | null;
  visibility: TeamVisibility;
  allow_student_quiz_creation: boolean;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export type TeamMember = {
  team_id: string;
  user_id: string;
  role: TeamRole;
  joined_at: string;
};

export type TeamInvitation = {
  id: string;
  team_id: string;
  invitation_code_hash: string;
  role: "coach" | "student";
  created_by: string;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

export type TeamInvitationPreview = {
  team_id: string;
  team_name: string;
  team_number: string;
  program: Program;
  team_description: string;
  invited_role: "coach" | "student";
  expires_at: string | null;
};

export type TeamChanges = {
  name: string;
  team_number: string;
  program: Program;
  description: string;
  visibility: TeamVisibility;
  allow_student_quiz_creation: boolean;
};

export type QuizStatus = "draft" | "published";

export type Quiz = {
  id: string;
  created_by: string;
  title: string;
  description: string;
  program: Program;
  category: string;
  difficulty: QuizDifficulty;
  visibility: QuizVisibility;
  status: QuizStatus;
  allow_question_preview: boolean;
  team_id: string | null;
  tags: string[];
  cover_image_path: string | null;
  default_question_time_seconds: number;
  randomize_questions: boolean;
  randomize_answers: boolean;
  show_explanations: boolean;
  allow_multiple_attempts: boolean;
  show_correct_answers: boolean;
  allow_public_duplication: boolean;
  allow_team_editing: boolean;
  created_at: string;
  updated_at: string;
};

export type QuizDifficulty = "Beginner" | "Intermediate" | "Advanced" | "Expert";

export type QuizExplorerRow = {
  quiz_id: string;
  title: string;
  description: string;
  creator_display_name: string;
  creator_username: string | null;
  associated_team: string | null;
  program: Program;
  category: string;
  difficulty: QuizDifficulty;
  question_count: number;
  estimated_minutes: number;
  play_count: number;
  favorite_count: number;
  average_rating: number | null;
  rating_count: number;
  created_at: string;
};

export type QuizDetailData = QuizExplorerRow & {
  visibility: QuizVisibility;
  status: QuizStatus;
  allow_question_preview: boolean;
  allow_multiple_attempts: boolean;
  is_favorited: boolean;
  my_rating: number | null;
  is_creator: boolean;
  is_editor: boolean;
  tags: string[];
  cover_image_path: string | null;
  cover_image_url: string | null;
};

export type QuizQuestionType =
  | "multiple_choice"
  | "true_false"
  | "multiple_select"
  | "image_multiple_choice";

export type QuizQuestionPreview = {
  question_position: number;
  prompt: string;
  options: string[];
  image_path: string | null;
  image_url: string | null;
  question_type: QuizQuestionType;
};

export type QuizQuestion = {
  id: string;
  quiz_id: string;
  position: number;
  prompt: string;
  options: string[];
  correct_option_index: number;
  question_type: QuizQuestionType;
  correct_option_indices: number[];
  image_path: string | null;
  point_value: number;
  time_limit_seconds: number | null;
  explanation: string;
  created_at: string;
};

export type QuizQuestionInput = {
  question_type: QuizQuestionType;
  prompt: string;
  options: string[];
  correct_index: number;
  correct_indices: number[];
  explanation: string;
  image_path: string | null;
  image_url?: string | null;
  point_value: number;
  time_limit_seconds: number | null;
};

export type QuizEditorData = {
  quiz: Quiz;
  questions: QuizQuestionInput[];
};

export type QuizAttemptQuestion = {
  question_id: string;
  question_position: number;
  prompt: string;
  options: string[];
  question_type: QuizQuestionType;
  image_path: string | null;
  image_url: string | null;
  point_value: number;
  time_limit_seconds: number | null;
  show_explanations: boolean;
  show_correct_answers: boolean;
};

export type QuizAttemptStart = {
  attempt_id: string;
  quiz_id: string;
  quiz_title: string;
  question_id: string;
  question_position: number;
  prompt: string;
  options: string[];
  question_type: QuizQuestionType;
  image_path: string | null;
  image_url: string | null;
  point_value: number;
  time_limit_seconds: number | null;
  show_explanations: boolean;
  show_correct_answers: boolean;
};

export type QuizAttemptResultRow = {
  quiz_id: string;
  quiz_title: string;
  score: number;
  correct_count: number;
  total_questions: number;
  finished_at: string;
  question_id: string;
  question_position: number;
  prompt: string;
  options: string[];
  selected_option_index: number | null;
  correct_option_index: number | null;
  is_correct: boolean | null;
  explanation: string;
  question_type: QuizQuestionType;
  selected_option_indices: number[] | null;
  correct_option_indices: number[] | null;
  image_path: string | null;
  image_url: string | null;
  point_value: number;
  show_correct_answers: boolean;
  show_explanations: boolean;
};

export type TeamQuizAssignment = {
  team_id: string;
  quiz_id: string;
  assigned_by: string;
  due_at: string | null;
  assigned_at: string;
};

export type LiveGameStatus = "lobby" | "running" | "completed" | "cancelled";

export type LiveGameSnapshotRow = {
  game_id: string;
  quiz_id: string;
  quiz_title: string;
  host_display_name: string;
  is_host: boolean;
  join_code: string | null;
  status: LiveGameStatus;
  current_question_position: number;
  question_count: number;
  question_prompt: string | null;
  question_options: string[] | null;
  question_started_at: string | null;
  question_deadline: string | null;
  player_display_name: string | null;
  player_score: number | null;
  player_streak: number | null;
  is_current_user: boolean;
  has_answered_current_question: boolean;
  own_selected_option_index: number | null;
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          username?: string | null;
          display_name?: string;
          avatar_url?: string | null;
          bio?: string;
          preferred_program?: Program | null;
          profile_visibility?: ProfileVisibility;
          created_at?: string;
        };
        Update: {
          username?: string | null;
          display_name?: string;
          avatar_url?: string | null;
          bio?: string;
          preferred_program?: Program | null;
          profile_visibility?: ProfileVisibility;
        };
        Relationships: [];
      };
      teams: {
        Row: Team;
        Insert: {
          id?: string;
          name: string;
          team_number: string;
          program: Program;
          description?: string;
          logo_url?: string | null;
          visibility?: TeamVisibility;
          allow_student_quiz_creation?: boolean;
          owner_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          team_number?: string;
          program?: Program;
          description?: string;
          logo_url?: string | null;
          visibility?: TeamVisibility;
          allow_student_quiz_creation?: boolean;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      team_members: {
        Row: TeamMember;
        Insert: {
          team_id: string;
          user_id: string;
          role: TeamRole;
          joined_at?: string;
        };
        Update: {
          role?: TeamRole;
          joined_at?: string;
        };
        Relationships: [];
      };
      team_invitations: {
        Row: TeamInvitation;
        Insert: {
          id?: string;
          team_id: string;
          invitation_code_hash: string;
          role: "coach" | "student";
          created_by: string;
          expires_at?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          role?: "coach" | "student";
          expires_at?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      quizzes: {
        Row: Quiz;
        Insert: {
          id?: string;
          created_by: string;
          title: string;
          description?: string;
          program: Program;
          category: string;
          difficulty?: QuizDifficulty;
          visibility?: QuizVisibility;
          status?: QuizStatus;
          allow_question_preview?: boolean;
          team_id?: string | null;
          tags?: string[];
          cover_image_path?: string | null;
          default_question_time_seconds?: number;
          randomize_questions?: boolean;
          randomize_answers?: boolean;
          show_explanations?: boolean;
          allow_multiple_attempts?: boolean;
          show_correct_answers?: boolean;
          allow_public_duplication?: boolean;
          allow_team_editing?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string;
          program?: Program;
          category?: string;
          difficulty?: QuizDifficulty;
          visibility?: QuizVisibility;
          status?: QuizStatus;
          allow_question_preview?: boolean;
          team_id?: string | null;
          tags?: string[];
          cover_image_path?: string | null;
          default_question_time_seconds?: number;
          randomize_questions?: boolean;
          randomize_answers?: boolean;
          show_explanations?: boolean;
          allow_multiple_attempts?: boolean;
          show_correct_answers?: boolean;
          allow_public_duplication?: boolean;
          allow_team_editing?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      quiz_questions: {
        Row: QuizQuestion;
        Insert: {
          id?: string;
          quiz_id: string;
          position: number;
          prompt: string;
          options: string[];
          correct_option_index: number;
          question_type?: QuizQuestionType;
          correct_option_indices?: number[];
          image_path?: string | null;
          point_value?: number;
          time_limit_seconds?: number | null;
          explanation?: string;
          created_at?: string;
        };
        Update: {
          position?: number;
          prompt?: string;
          options?: string[];
          correct_option_index?: number;
          question_type?: QuizQuestionType;
          correct_option_indices?: number[];
          image_path?: string | null;
          point_value?: number;
          time_limit_seconds?: number | null;
          explanation?: string;
        };
        Relationships: [];
      };
      team_quiz_assignments: {
        Row: TeamQuizAssignment;
        Insert: {
          team_id: string;
          quiz_id: string;
          assigned_by: string;
          due_at?: string | null;
          assigned_at?: string;
        };
        Update: {
          assigned_by?: string;
          due_at?: string | null;
          assigned_at?: string;
        };
        Relationships: [];
      };
      quiz_attempts: {
        Row: {
          id: string;
          quiz_id: string;
          user_id: string;
          started_at: string;
          finished_at: string | null;
          score: number | null;
          correct_count: number | null;
          total_questions: number;
          quiz_title_snapshot: string;
          show_explanations: boolean;
          show_correct_answers: boolean;
        };
        Insert: {
          id?: string;
          quiz_id: string;
          user_id: string;
          started_at?: string;
          finished_at?: string | null;
          score?: number | null;
          correct_count?: number | null;
          show_explanations?: boolean;
          show_correct_answers?: boolean;
          quiz_title_snapshot: string;
          total_questions: number;
        };
        Update: {
          finished_at?: string | null;
          score?: number | null;
          correct_count?: number | null;
        };
        Relationships: [];
      };
      quiz_attempt_answers: {
        Row: {
          attempt_id: string;
          question_id: string;
          selected_option_index: number | null;
          selected_option_indices: number[];
          is_correct: boolean;
        };
        Insert: {
          attempt_id: string;
          question_id: string;
          selected_option_index: number | null;
          selected_option_indices: number[];
          is_correct: boolean;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      live_games: {
        Row: {
          id: string;
          quiz_id: string;
          status: LiveGameStatus;
          current_question_position: number;
          question_started_at: string | null;
          question_deadline: string | null;
          created_at: string;
          expires_at: string;
          finished_at: string | null;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_team: {
        Args: {
          _name: string;
          _team_number: string;
          _program: Program;
          _description: string;
          _visibility: TeamVisibility;
          _allow_student_quiz_creation?: boolean;
        };
        Returns: string;
      };
      update_team: {
        Args: {
          _team_id: string;
          _name: string;
          _team_number: string;
          _program: Program;
          _description: string;
          _visibility: TeamVisibility;
          _allow_student_quiz_creation: boolean;
        };
        Returns: undefined;
      };
      can_create_quizzes: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      create_team_invitation: {
        Args: {
          _team_id: string;
          _role: "coach" | "student";
          _expires_at?: string | null;
        };
        Returns: {
          invitation_code: string;
          expires_at: string | null;
          invited_role: string;
        }[];
      };
      preview_team_invitation: {
        Args: { _code: string };
        Returns: TeamInvitationPreview[];
      };
      join_team_with_invitation: {
        Args: { _code: string };
        Returns: string;
      };
      deactivate_team_invitation: {
        Args: { _invitation_id: string };
        Returns: undefined;
      };
      set_team_member_role: {
        Args: { _team_id: string; _user_id: string; _new_role: Exclude<TeamRole, "owner"> };
        Returns: undefined;
      };
      remove_team_member: {
        Args: { _team_id: string; _user_id: string };
        Returns: undefined;
      };
      leave_team: {
        Args: { _team_id: string };
        Returns: undefined;
      };
      transfer_team_ownership: {
        Args: { _team_id: string; _new_owner_id: string };
        Returns: undefined;
      };
      delete_team: {
        Args: { _team_id: string };
        Returns: undefined;
      };
      can_access_quiz: {
        Args: { _quiz_id: string };
        Returns: boolean;
      };
      create_quiz: {
        Args: {
          _quiz_id: string;
          _title: string;
          _description: string;
          _program: Program;
          _category: string;
          _visibility: QuizVisibility;
          _status: QuizStatus;
          _difficulty: QuizDifficulty;
          _allow_question_preview: boolean;
          _team_id: string | null;
          _tags: string[];
          _cover_image_path: string | null;
          _default_question_time_seconds: number;
          _randomize_questions: boolean;
          _randomize_answers: boolean;
          _show_explanations: boolean;
          _allow_multiple_attempts: boolean;
          _show_correct_answers: boolean;
          _allow_public_duplication: boolean;
          _allow_team_editing: boolean;
          _questions: Json;
        };
        Returns: string;
      };
      update_quiz: {
        Args: {
          _quiz_id: string;
          _title: string;
          _description: string;
          _program: Program;
          _category: string;
          _visibility: QuizVisibility;
          _status: QuizStatus;
          _difficulty: QuizDifficulty;
          _allow_question_preview: boolean;
          _team_id: string | null;
          _tags: string[];
          _cover_image_path: string | null;
          _default_question_time_seconds: number;
          _randomize_questions: boolean;
          _randomize_answers: boolean;
          _show_explanations: boolean;
          _allow_multiple_attempts: boolean;
          _show_correct_answers: boolean;
          _allow_public_duplication: boolean;
          _allow_team_editing: boolean;
          _questions: Json;
        };
        Returns: undefined;
      };
      get_quiz_editor: {
        Args: { _quiz_id: string };
        Returns: {
          quiz_id: string;
          title: string;
          description: string;
          program: string;
          category: string;
          visibility: string;
          status: string;
          question_id: string | null;
          question_position: number | null;
          prompt: string | null;
          options: string[] | null;
          correct_option_index: number | null;
          explanation: string | null;
          question_type: QuizQuestionType | null;
          correct_option_indices: number[] | null;
          image_path: string | null;
          point_value: number | null;
          time_limit_seconds: number | null;
        }[];
      };
      start_quiz_attempt: {
        Args: { _quiz_id: string };
        Returns: QuizAttemptStart[];
      };
      submit_quiz_attempt: {
        Args: { _attempt_id: string; _answers: Json };
        Returns: {
          quiz_id: string;
          score: number;
          correct_count: number;
          total_questions: number;
          finished_at: string;
        }[];
      };
      get_quiz_attempt_results: {
        Args: { _attempt_id: string };
        Returns: QuizAttemptResultRow[];
      };
      assign_quiz_to_team: {
        Args: { _team_id: string; _quiz_id: string; _due_at?: string | null };
        Returns: undefined;
      };
      remove_quiz_assignment: {
        Args: { _team_id: string; _quiz_id: string };
        Returns: undefined;
      };
      get_popular_public_quizzes: {
        Args: { _limit?: number };
        Returns: {
          id: string;
          title: string;
          description: string;
          program: Program;
          category: string;
          visibility: QuizVisibility;
          status: QuizStatus;
          created_at: string;
          updated_at: string;
          attempt_count: number;
        }[];
      };
      get_quiz_explorer: {
        Args: {
          _program?: string | null;
          _category?: string | null;
          _difficulty?: string | null;
          _search?: string | null;
          _sort?: string | null;
          _limit?: number | null;
          _offset?: number | null;
        };
        Returns: QuizExplorerRow[];
      };
      get_quiz_detail: {
        Args: { _quiz_id: string };
        Returns: QuizDetailData[];
      };
      get_public_quiz_question_preview: {
        Args: { _quiz_id: string };
        Returns: QuizQuestionPreview[];
      };
      set_quiz_favorite: {
        Args: { _quiz_id: string; _favorited: boolean };
        Returns: undefined;
      };
      rate_public_quiz: {
        Args: { _quiz_id: string; _rating: number };
        Returns: undefined;
      };
      get_home_dashboard_stats: {
        Args: Record<string, never>;
        Returns: {
          quizzes_completed: number;
          average_score: number | null;
          correct_answers: number;
          current_streak: number;
        }[];
      };
      get_home_recent_activity: {
        Args: { _limit?: number };
        Returns: {
          activity_type: "completed" | "created";
          attempt_id: string | null;
          quiz_id: string;
          quiz_title: string;
          program: Program;
          score: number | null;
          correct_count: number | null;
          total_questions: number | null;
          occurred_at: string;
        }[];
      };
      create_live_game: {
        Args: { _quiz_id: string };
        Returns: { game_id: string; join_code: string }[];
      };
      join_live_game: {
        Args: { _join_code: string };
        Returns: string;
      };
      get_live_game_snapshot: {
        Args: { _game_id: string };
        Returns: LiveGameSnapshotRow[];
      };
      start_live_game: {
        Args: { _game_id: string };
        Returns: undefined;
      };
      submit_live_game_answer: {
        Args: {
          _game_id: string;
          _question_position: number;
          _selected_option_index: number;
        };
        Returns: undefined;
      };
      advance_live_game: {
        Args: {
          _game_id: string;
          _expected_question_position: number;
          _expired_only?: boolean;
        };
        Returns: boolean;
      };
      cancel_live_game: {
        Args: { _game_id: string };
        Returns: undefined;
      };
      get_team_dashboard_stats: {
        Args: { _team_id: string };
        Returns: {
          member_count: number;
          student_count: number;
          coach_count: number;
          leadership_count: number;
          assigned_quiz_count: number;
          completed_attempt_count: number;
          active_learner_count: number;
        }[];
      };
      get_team_activity: {
        Args: { _team_id: string; _limit?: number };
        Returns: {
          attempt_id: string;
          member_display_name: string;
          quiz_id: string;
          quiz_title: string;
          score: number;
          correct_count: number;
          total_questions: number;
          occurred_at: string;
        }[];
      };
      get_team_leaderboard: {
        Args: { _team_id: string };
        Returns: {
          member_display_name: string;
          average_score: number | null;
          completed_attempts: number;
          correct_answers: number;
        }[];
      };
      set_team_logo: {
        Args: { _team_id: string; _logo_path: string | null };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
