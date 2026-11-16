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
};

export type QuizStatus = "draft" | "published";

export type Quiz = {
  id: string;
  created_by: string;
  title: string;
  description: string;
  program: Program;
  category: string;
  visibility: TeamVisibility;
  status: QuizStatus;
  created_at: string;
  updated_at: string;
};

export type QuizQuestion = {
  id: string;
  quiz_id: string;
  position: number;
  prompt: string;
  options: string[];
  correct_option_index: number;
  explanation: string;
  created_at: string;
};

export type QuizQuestionInput = {
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
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
};

export type QuizAttemptStart = {
  attempt_id: string;
  quiz_id: string;
  quiz_title: string;
  question_id: string;
  question_position: number;
  prompt: string;
  options: string[];
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
  correct_option_index: number;
  is_correct: boolean | null;
  explanation: string;
};

export type TeamQuizAssignment = {
  team_id: string;
  quiz_id: string;
  assigned_by: string;
  due_at: string | null;
  assigned_at: string;
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
          visibility?: TeamVisibility;
          status?: QuizStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string;
          program?: Program;
          category?: string;
          visibility?: TeamVisibility;
          status?: QuizStatus;
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
          explanation?: string;
          created_at?: string;
        };
        Update: {
          position?: number;
          prompt?: string;
          options?: string[];
          correct_option_index?: number;
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
        };
        Insert: {
          id?: string;
          quiz_id: string;
          user_id: string;
          started_at?: string;
          finished_at?: string | null;
          score?: number | null;
          correct_count?: number | null;
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
          selected_option_index: number;
          is_correct: boolean;
        };
        Insert: {
          attempt_id: string;
          question_id: string;
          selected_option_index: number;
          is_correct: boolean;
        };
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
        };
        Returns: undefined;
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
          _title: string;
          _description: string;
          _program: Program;
          _category: string;
          _visibility: TeamVisibility;
          _status: QuizStatus;
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
          _visibility: TeamVisibility;
          _status: QuizStatus;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
