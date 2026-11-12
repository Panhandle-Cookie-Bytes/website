import { requireSupabase } from "../lib/supabase";
import type { Profile, Program, ProfileVisibility } from "../types/database";

export interface ProfileChanges {
  username: string | null;
  display_name: string;
  bio: string;
  preferred_program: Program | null;
  profile_visibility: ProfileVisibility;
}

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await requireSupabase()
    .from("profiles")
    .select("id,username,display_name,avatar_url,bio,preferred_program,profile_visibility,created_at")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function getPublicProfile(username: string): Promise<Profile | null> {
  const { data, error } = await requireSupabase()
    .from("profiles")
    .select("id,username,display_name,avatar_url,bio,preferred_program,profile_visibility,created_at")
    .eq("username", username.toLowerCase())
    .eq("profile_visibility", "public")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId: string, changes: ProfileChanges): Promise<Profile> {
  const { data, error } = await requireSupabase()
    .from("profiles")
    .update(changes)
    .eq("id", userId)
    .select("id,username,display_name,avatar_url,bio,preferred_program,profile_visibility,created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function updateAvatarPath(userId: string, path: string | null): Promise<void> {
  const { error } = await requireSupabase()
    .from("profiles")
    .update({ avatar_url: path })
    .eq("id", userId);
  if (error) throw error;
}

export async function getAvatarUrl(path: string): Promise<string> {
  const { data, error } = await requireSupabase()
    .storage
    .from("profile-avatars")
    .createSignedUrl(path, 5 * 60);
  if (error) throw error;
  return data.signedUrl;
}
