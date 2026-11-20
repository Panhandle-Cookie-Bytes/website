import { requireSupabase } from "../lib/supabase";
import type {
  Team,
  TeamChanges,
  TeamInvitationPreview,
  TeamRole,
} from "../types/database";

const TEAM_COLUMNS = "id,name,team_number,program,description,logo_url,visibility,allow_student_quiz_creation,owner_id,created_at,updated_at";
const MEMBER_COLUMNS = "team_id,user_id,role,joined_at";
const TEAM_LOGO_BUCKET = "team-logos";

export interface MyTeam extends Team {
  role: TeamRole;
  joined_at: string;
}

export interface TeamRosterMember {
  team_id: string;
  user_id: string;
  role: TeamRole;
  joined_at: string;
  profile: {
    display_name: string;
    username: string | null;
    avatar_url: string | null;
    profile_visibility: "private" | "public";
  } | null;
}

export interface TeamDetails {
  team: Team;
  members: TeamRosterMember[];
}

export interface TeamDashboardStats {
  member_count: number;
  student_count: number;
  coach_count: number;
  leadership_count: number;
  assigned_quiz_count: number;
  completed_attempt_count: number;
  active_learner_count: number;
}

export interface TeamActivityItem {
  attempt_id: string;
  member_display_name: string;
  quiz_id: string;
  quiz_title: string;
  score: number;
  correct_count: number;
  total_questions: number;
  occurred_at: string;
}

export interface TeamLeaderboardEntry {
  member_display_name: string;
  average_score: number | null;
  completed_attempts: number;
  correct_answers: number;
}

export interface TeamInvitation {
  id: string;
  role: "coach" | "student";
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

async function addSignedTeamLogos<T extends Team>(teams: T[]): Promise<T[]> {
  const paths = [...new Set(teams.flatMap((team) => team.logo_url ? [team.logo_url] : []))];
  if (!paths.length) return teams;
  const { data, error } = await requireSupabase()
    .storage
    .from(TEAM_LOGO_BUCKET)
    .createSignedUrls(paths, 60 * 60);
  if (error) throw error;

  const signedUrls = new Map<string, string>();
  for (const result of data) {
    if (!result.path || !result.signedUrl) {
      throw new Error(result.error ?? "Could not create a signed URL for a team logo.");
    }
    signedUrls.set(result.path, result.signedUrl);
  }
  return teams.map((team) => team.logo_url
    ? { ...team, logo_url: signedUrls.get(team.logo_url) ?? null }
    : team);
}

export async function listMyTeams(userId: string): Promise<MyTeam[]> {
  const client = requireSupabase();
  const { data: memberships, error: membershipError } = await client
    .from("team_members")
    .select(MEMBER_COLUMNS)
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });
  if (membershipError) throw membershipError;
  if (!memberships.length) return [];

  const { data: teams, error: teamsError } = await client
    .from("teams")
    .select(TEAM_COLUMNS)
    .in("id", memberships.map(({ team_id }) => team_id));
  if (teamsError) throw teamsError;

  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const myTeams = memberships.flatMap((membership) => {
    const team = teamsById.get(membership.team_id);
    return team ? [{ ...team, role: membership.role, joined_at: membership.joined_at }] : [];
  });
  return addSignedTeamLogos(myTeams);
}

export async function listPublicTeams(): Promise<Team[]> {
  const { data, error } = await requireSupabase()
    .from("teams")
    .select(TEAM_COLUMNS)
    .eq("visibility", "public")
    .order("name", { ascending: true });
  if (error) throw error;
  return addSignedTeamLogos(data);
}

export async function getTeamDetails(teamId: string): Promise<TeamDetails> {
  const client = requireSupabase();
  const { data: team, error: teamError } = await client
    .from("teams")
    .select(TEAM_COLUMNS)
    .eq("id", teamId)
    .single();
  if (teamError) throw teamError;

  const { data: memberships, error: membersError } = await client
    .from("team_members")
    .select(MEMBER_COLUMNS)
    .eq("team_id", teamId)
    .order("joined_at", { ascending: true });
  if (membersError) throw membersError;

  const memberIds = memberships.map(({ user_id }) => user_id);
  const { data: profiles, error: profilesError } = memberIds.length
    ? await client
      .from("profiles")
      .select("id,display_name,username,avatar_url,profile_visibility")
      .in("id", memberIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;

  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  return {
    team: (await addSignedTeamLogos([team]))[0],
    members: memberships.map((member) => ({
      ...member,
      profile: profilesById.get(member.user_id) ?? null,
    })),
  };
}

export async function getTeamInvitations(teamId: string): Promise<TeamInvitation[]> {
  const { data, error } = await requireSupabase()
    .from("team_invitations")
    .select("id,role,expires_at,is_active,created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createTeam(
  changes: TeamChanges,
): Promise<string> {
  const { data, error } = await requireSupabase().rpc("create_team", {
    _name: changes.name,
    _team_number: changes.team_number,
    _program: changes.program,
    _description: changes.description,
    _visibility: changes.visibility,
    _allow_student_quiz_creation: changes.allow_student_quiz_creation,
  });
  if (error) throw error;
  if (!data) throw new Error("The team was created without a team ID. Refresh and check your teams.");
  return data;
}

export async function updateTeam(teamId: string, changes: TeamChanges): Promise<void> {
  const { error } = await requireSupabase().rpc("update_team", {
    _team_id: teamId,
    _name: changes.name,
    _team_number: changes.team_number,
    _program: changes.program,
    _description: changes.description,
    _visibility: changes.visibility,
    _allow_student_quiz_creation: changes.allow_student_quiz_creation,
  });
  if (error) throw error;
}

export async function previewTeamInvitation(code: string): Promise<TeamInvitationPreview> {
  const { data, error } = await requireSupabase().rpc("preview_team_invitation", { _code: code.trim().toUpperCase() });
  if (error) throw error;
  const invitation = data[0];
  if (!invitation) throw new Error("This invitation is invalid, expired, or has been disabled.");
  return invitation;
}

export async function joinTeam(code: string): Promise<string> {
  const { data, error } = await requireSupabase().rpc("join_team_with_invitation", { _code: code.trim().toUpperCase() });
  if (error) throw error;
  if (!data) throw new Error("The invitation was accepted but no team was returned. Check My teams.");
  return data;
}

export async function createTeamInvitation(
  teamId: string,
  role: "coach" | "student",
  expiresAt: string | null,
): Promise<{ code: string; expiresAt: string | null }> {
  const { data, error } = await requireSupabase().rpc("create_team_invitation", {
    _team_id: teamId,
    _role: role,
    _expires_at: expiresAt,
  });
  if (error) throw error;
  const invitation = data[0];
  if (!invitation) throw new Error("The invitation was created without a code. Please refresh and check team settings.");
  return { code: invitation.invitation_code, expiresAt: invitation.expires_at };
}

export async function deactivateTeamInvitation(invitationId: string): Promise<void> {
  const { error } = await requireSupabase().rpc("deactivate_team_invitation", {
    _invitation_id: invitationId,
  });
  if (error) throw error;
}

export async function setTeamMemberRole(teamId: string, userId: string, role: Exclude<TeamRole, "owner">): Promise<void> {
  const { error } = await requireSupabase().rpc("set_team_member_role", {
    _team_id: teamId,
    _user_id: userId,
    _new_role: role,
  });
  if (error) throw error;
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  const { error } = await requireSupabase().rpc("remove_team_member", {
    _team_id: teamId,
    _user_id: userId,
  });
  if (error) throw error;
}

export async function leaveTeam(teamId: string): Promise<void> {
  const { error } = await requireSupabase().rpc("leave_team", { _team_id: teamId });
  if (error) throw error;
}

export async function transferTeamOwnership(teamId: string, newOwnerId: string): Promise<void> {
  const { error } = await requireSupabase().rpc("transfer_team_ownership", {
    _team_id: teamId,
    _new_owner_id: newOwnerId,
  });
  if (error) throw error;
}

export async function deleteTeam(teamId: string): Promise<void> {
  const { error } = await requireSupabase().rpc("delete_team", { _team_id: teamId });
  if (error) throw error;
}

export async function getTeamDashboardStats(teamId: string): Promise<TeamDashboardStats> {
  const { data, error } = await requireSupabase().rpc("get_team_dashboard_stats", {
    _team_id: teamId,
  });
  if (error) throw error;
  const stats = data[0];
  if (!stats) throw new Error("Team statistics could not be loaded.");
  return stats;
}

export async function getTeamActivity(teamId: string): Promise<TeamActivityItem[]> {
  const { data, error } = await requireSupabase().rpc("get_team_activity", {
    _team_id: teamId,
    _limit: 8,
  });
  if (error) throw error;
  return data;
}

export async function getTeamLeaderboard(teamId: string): Promise<TeamLeaderboardEntry[]> {
  const { data, error } = await requireSupabase().rpc("get_team_leaderboard", {
    _team_id: teamId,
  });
  if (error) throw error;
  return data;
}

export async function canCreateQuizzes(): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc("can_create_quizzes");
  if (error) throw error;
  if (data === null) throw new Error("Quiz creation permission could not be checked.");
  return data;
}

export async function uploadTeamLogo(teamId: string, file: File): Promise<string | null> {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = extensions[file.type];
  if (!extension) throw new Error("Choose a JPG, PNG, or WebP image.");
  if (file.size > 3 * 1024 * 1024) throw new Error("Team logos must be 3 MB or smaller.");

  const client = requireSupabase();
  const { data: currentTeam, error: teamError } = await client
    .from("teams")
    .select("logo_url")
    .eq("id", teamId)
    .single();
  if (teamError) throw teamError;

  const path = `${teamId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await client.storage.from(TEAM_LOGO_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error: saveError } = await client.rpc("set_team_logo", {
    _team_id: teamId,
    _logo_path: path,
  });
  if (saveError) {
    const { error: cleanupError } = await client.storage.from(TEAM_LOGO_BUCKET).remove([path]);
    if (cleanupError) {
      throw new Error(`Could not save the team logo: ${saveError.message}. The uploaded file could not be removed: ${cleanupError.message}`);
    }
    throw saveError;
  }

  if (currentTeam.logo_url) {
    const { error: cleanupError } = await client.storage.from(TEAM_LOGO_BUCKET).remove([currentTeam.logo_url]);
    if (cleanupError) {
      return `The new logo was saved, but the previous image could not be removed: ${cleanupError.message}`;
    }
  }
  return null;
}

export async function removeTeamLogo(teamId: string): Promise<string | null> {
  const client = requireSupabase();
  const { data: currentTeam, error: teamError } = await client
    .from("teams")
    .select("logo_url")
    .eq("id", teamId)
    .single();
  if (teamError) throw teamError;

  const { error: saveError } = await client.rpc("set_team_logo", {
    _team_id: teamId,
    _logo_path: null,
  });
  if (saveError) throw saveError;

  if (currentTeam.logo_url) {
    const { error: cleanupError } = await client.storage.from(TEAM_LOGO_BUCKET).remove([currentTeam.logo_url]);
    if (cleanupError) {
      return `The logo was removed from the team, but the stored image could not be deleted: ${cleanupError.message}`;
    }
  }
  return null;
}
