export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Program = "FLL" | "FTC" | "FRC" | "General FIRST";
export type ProfileVisibility = "private" | "public";

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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
