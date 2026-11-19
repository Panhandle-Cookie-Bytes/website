import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Activity, ArrowLeft, ArrowRight, BookOpen, GraduationCap, Settings, Shield, Trophy, Users } from "lucide-react";
import { TeamQuizAssignments } from "../components/TeamQuizAssignments";
import { useAuth } from "../contexts/AuthContext";
import {
  getTeamDetails,
  getTeamActivity,
  getTeamDashboardStats,
  getTeamLeaderboard,
  leaveTeam,
  removeTeamMember,
  setTeamMemberRole,
  type TeamActivityItem,
  type TeamDashboardStats,
  type TeamDetails,
  type TeamLeaderboardEntry,
} from "../services/teamService";
import type { TeamRole } from "../types/database";

function roleLabel(role: TeamRole) {
  return role === "administrator" ? "Administrator" : role[0].toUpperCase() + role.slice(1);
}

export function TeamDashboardPage() {
  const { teamId = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [details, setDetails] = useState<TeamDetails | null>(null);
  const [stats, setStats] = useState<TeamDashboardStats | null>(null);
  const [activity, setActivity] = useState<TeamActivityItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<TeamLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyMember, setBusyMember] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    const teamDetails = await getTeamDetails(teamId);
    setDetails(teamDetails);
    setInsightsError(null);
    if (!teamDetails.members.some((member) => member.user_id === user?.id)) {
      setStats(null);
      setActivity([]);
      setLeaderboard([]);
      return;
    }
    setStats(null);
    setActivity([]);
    setLeaderboard([]);
    try {
      const [teamStats, teamActivity, teamLeaderboard] = await Promise.all([
        getTeamDashboardStats(teamId),
        getTeamActivity(teamId),
        getTeamLeaderboard(teamId),
      ]);
      setStats(teamStats);
      setActivity(teamActivity);
      setLeaderboard(teamLeaderboard);
    } catch (insightLoadError) {
      setInsightsError(insightLoadError instanceof Error
        ? insightLoadError.message
        : "Could not load team statistics and activity.");
    }
  }, [teamId, user?.id]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadTeam().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load this team.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [loadTeam]);

  const currentMember = details?.members.find((member) => member.user_id === user?.id);
  const role = currentMember?.role;
  const canManageRoles = role === "owner" || role === "administrator";
  const canInvite = role === "owner" || role === "administrator" || role === "coach";

  async function handleRoleChange(memberId: string, newRole: Exclude<TeamRole, "owner">) {
    setBusyMember(memberId);
    setError(null);
    try {
      await setTeamMemberRole(teamId, memberId, newRole);
      await loadTeam();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not update this member’s role.");
    } finally {
      setBusyMember(null);
    }
  }

  async function handleRemove(memberId: string) {
    const member = details?.members.find(({ user_id }) => user_id === memberId);
    if (!member || !window.confirm(`Remove ${member.profile?.display_name ?? "this member"} from the team?`)) return;
    setBusyMember(memberId);
    setError(null);
    try {
      await removeTeamMember(teamId, memberId);
      await loadTeam();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not remove this member.");
    } finally {
      setBusyMember(null);
    }
  }

  async function handleLeave() {
    if (!window.confirm("Leave this team? You’ll need a new invitation to rejoin.")) return;
    setError(null);
    try {
      await leaveTeam(teamId);
      navigate("/teams", { replace: true });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not leave this team.");
    }
  }

  if (loading) return <div className="page-status" role="status">Loading your team…</div>;
  if (!details) {
    return (
      <section className="message-page">
        <span className="eyebrow"><span className="eyebrow-mark" /> Team unavailable</span>
        <h1>We can’t open this team.</h1>
        <p role="alert">{error ?? "It may have been deleted, or your account may no longer be a member."}</p>
        <Link className="button button-primary" to="/teams">Back to my teams</Link>
      </section>
    );
  }
  const isMember = details.members.some((member) => member.user_id === user?.id);
  if (!isMember && details.team.visibility === "public") {
    return (
      <section className="public-profile-page team-public-page">
        <Link className="back-link" to="/teams"><ArrowLeft size={14} aria-hidden="true" /> Back to my teams</Link>
        <article className="panel team-public-card">
          {details.team.logo_url && <img className="team-public-logo" src={details.team.logo_url} alt={`${details.team.name} logo`} />}
          <span className="eyebrow">{details.team.program} · Team {details.team.team_number} · Public</span>
          <h1>{details.team.name}</h1>
          <p>{details.team.description || "A FIRST team space for learning and building together."}</p>
          <div className="team-public-note">
            <Users size={18} aria-hidden="true" />
            <span>Team roster and member details are visible only to members.</span>
          </div>
          <Link className="button button-primary" to="/teams/join">Join with an invitation code</Link>
        </article>
      </section>
    );
  }
  if (!isMember) {
    return (
      <section className="message-page">
        <span className="eyebrow"><span className="eyebrow-mark" /> Team membership required</span>
        <h1>This team isn’t in your spaces.</h1>
        <p>Join with an invitation code to access its roster and team dashboard.</p>
        <Link className="button button-primary" to="/teams/join">Enter an invitation code</Link>
      </section>
    );
  }

  const { team, members } = details;
  return (
    <section className="account-page teams-page">
      <Link className="back-link" to="/teams"><ArrowLeft size={14} aria-hidden="true" /> Back to my teams</Link>
      <header className="team-hero panel">
        <div className="team-hero-icon">
          {team.logo_url
            ? <img src={team.logo_url} alt={`${team.name} logo`} />
            : <Users size={27} aria-hidden="true" />}
        </div>
        <div className="team-hero-copy">
          <span className="eyebrow">{team.program} · Team {team.team_number}</span>
          <h1>{team.name}</h1>
          <p>{team.description || "A FIRST team space for learning and building together."}</p>
          <span className={`privacy-badge${team.visibility === "public" ? " privacy-public" : ""}`}>
            {team.visibility === "public" ? "Public team" : "Private team"}
          </span>
        </div>
        <div className="team-hero-actions">
          {canInvite && (
            <Link className="button button-primary" to={`/teams/${team.id}/settings#invitations`}>
              Invite members <ArrowRight size={15} aria-hidden="true" />
            </Link>
          )}
          {(role === "owner" || role === "administrator" || role === "coach") && (
            <Link className="button button-secondary" to={`/teams/${team.id}/settings`}>
              <Settings size={15} aria-hidden="true" /> Team settings
            </Link>
          )}
        </div>
      </header>

      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {insightsError && <p className="notice notice-error" role="alert">Team insights couldn’t load: {insightsError}</p>}

      <div className="team-stat-grid" aria-label="Team statistics">
        <div className="panel team-stat"><Users size={18} aria-hidden="true" /><strong>{stats?.member_count ?? "—"}</strong><span>Members</span></div>
        <div className="panel team-stat"><GraduationCap size={18} aria-hidden="true" /><strong>{stats ? `${stats.student_count} / 15` : "—"}</strong><span>Students</span></div>
        <div className="panel team-stat"><Shield size={18} aria-hidden="true" /><strong>{stats ? `${stats.coach_count} / 4` : "—"}</strong><span>Coaches</span></div>
        <div className="panel team-stat"><BookOpen size={18} aria-hidden="true" /><strong>{stats?.assigned_quiz_count ?? "—"}</strong><span>Assigned quizzes</span></div>
        <div className="panel team-stat"><Trophy size={18} aria-hidden="true" /><strong>{stats?.completed_attempt_count ?? "—"}</strong><span>Quiz completions</span></div>
        <div className="panel team-stat"><Activity size={18} aria-hidden="true" /><strong>{stats?.active_learner_count ?? "—"}</strong><span>Active learners</span></div>
      </div>

      <TeamQuizAssignments
        teamId={team.id}
        userId={user?.id ?? ""}
        canManage={canInvite}
      />

      <div className="team-insights-grid">
        <section className="panel account-panel team-insight-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{role === "student" ? "Your progress" : "Team progress"}</span>
              <h2>{role === "student" ? "Your recent activity" : "Recent team activity"}</h2>
            </div>
            <span className="security-icon"><Activity size={18} aria-hidden="true" /></span>
          </div>
          {insightsError ? (
            <p className="team-empty">Recent activity is unavailable.</p>
          ) : activity.length ? (
            <div className="team-activity-list">
              {activity.map((item) => (
                <article className="team-activity-row" key={item.attempt_id}>
                  <span className="team-activity-mark"><BookOpen size={15} aria-hidden="true" /></span>
                  <div className="team-activity-copy">
                    <strong>{item.member_display_name} completed <Link to={`/quizzes/${item.quiz_id}`}>{item.quiz_title}</Link></strong>
                    <span>{item.correct_count}/{item.total_questions} correct · {new Date(item.occurred_at).toLocaleDateString()}</span>
                  </div>
                  <strong className="team-activity-score">{item.score}%</strong>
                </article>
              ))}
            </div>
          ) : (
            <p className="team-empty">Completed attempts on assigned quizzes will appear here.</p>
          )}
        </section>

        <section className="panel account-panel team-insight-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Assigned quiz results</span><h2>Team leaderboard</h2></div>
            <span className="security-icon"><Trophy size={18} aria-hidden="true" /></span>
          </div>
          {insightsError ? (
            <p className="team-empty">The leaderboard is unavailable.</p>
          ) : leaderboard.some((entry) => entry.average_score !== null) ? (
            <ol className="team-leaderboard-list">
              {leaderboard.filter((entry) => entry.average_score !== null).map((entry, index) => (
                <li className="team-leaderboard-row" key={`${entry.member_display_name}-${index}`}>
                  <span className="team-leaderboard-rank">{index + 1}</span>
                  <span className="team-leaderboard-name">{entry.member_display_name}</span>
                  <span className="team-leaderboard-meta">{entry.completed_attempts} completed · {entry.correct_answers} correct</span>
                  <strong>{Math.round(entry.average_score ?? 0)}%</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="team-empty">The leaderboard will appear after teammates complete assigned quizzes.</p>
          )}
        </section>
      </div>

      <section className="panel account-panel team-roster-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">People in this space</span><h2>Team roster</h2></div>
          <span className="team-count">{members.length}</span>
        </div>
        {members.length ? (
          <div className="team-roster">
            {members.map((member) => {
              const isCurrentUser = member.user_id === user?.id;
              const canChange = canManageRoles
                && member.role !== "owner"
                && (role === "owner" || member.role !== "administrator" || isCurrentUser);
              const canRemove = member.role !== "owner" && (
                role === "owner"
                || (role === "administrator" && member.role !== "administrator")
                || (role === "coach" && member.role === "student")
              );
              return (
                <article className="roster-row" key={member.user_id}>
                  <span className="roster-avatar" aria-hidden="true">
                    {(member.profile?.display_name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="roster-member-copy">
                    <strong>{member.profile?.display_name ?? "FIRST member"}{isCurrentUser ? " (you)" : ""}</strong>
                    <span>{member.profile?.username ? `@${member.profile.username}` : `Joined ${new Date(member.joined_at).toLocaleDateString()}`}</span>
                  </span>
                  {canChange ? (
                    <label className="sr-only" htmlFor={`role-${member.user_id}`}>Role for {member.profile?.display_name ?? "member"}</label>
                  ) : null}
                  {canChange ? (
                    <select
                      id={`role-${member.user_id}`}
                      className="role-select"
                      value={member.role}
                      disabled={busyMember === member.user_id}
                      onChange={(event) => void handleRoleChange(member.user_id, event.target.value as Exclude<TeamRole, "owner">)}
                    >
                      {(role === "owner" || member.role === "administrator") && (
                        <option value="administrator">Administrator</option>
                      )}
                      <option value="coach">Coach</option>
                      <option value="student">Student</option>
                    </select>
                  ) : (
                    <span className="role-badge">{roleLabel(member.role)}</span>
                  )}
                  {canRemove && (
                    <button
                      className="text-button roster-remove"
                      type="button"
                      disabled={busyMember === member.user_id}
                      onClick={() => void handleRemove(member.user_id)}
                    >
                      Remove
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="team-empty">No team members are visible.</p>
        )}
        {role && role !== "owner" && (
          <div className="team-leave-row">
            <p>You can leave this team at any time.</p>
            <button className="button button-secondary" type="button" onClick={() => void handleLeave()}>Leave team</button>
          </div>
        )}
      </section>
    </section>
  );
}
