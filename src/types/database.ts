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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
