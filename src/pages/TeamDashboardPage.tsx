import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Settings, Shield, Users } from "lucide-react";
import { TeamQuizAssignments } from "../components/TeamQuizAssignments";
import { useAuth } from "../contexts/AuthContext";
import {
  getTeamDetails,
  leaveTeam,
  removeTeamMember,
  setTeamMemberRole,
  type TeamDetails,
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
  const [loading, setLoading] = useState(true);
  const [busyMember, setBusyMember] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    const result = await getTeamDetails(teamId);
    setDetails(result);
  }, [teamId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getTeamDetails(teamId).then((result) => {
      if (active) setDetails(result);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load this team.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [teamId]);

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
  const studentCount = members.filter(({ role: memberRole }) => memberRole === "student").length;
  const coachCount = members.filter(({ role: memberRole }) => memberRole === "coach").length;
  const leadershipCount = members.filter(({ role: memberRole }) => memberRole === "owner" || memberRole === "administrator").length;

  return (
    <section className="account-page teams-page">
      <Link className="back-link" to="/teams"><ArrowLeft size={14} aria-hidden="true" /> Back to my teams</Link>
      <header className="team-hero panel">
        <div className="team-hero-icon"><Users size={27} aria-hidden="true" /></div>
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

      <div className="team-stat-grid" aria-label="Team roster counts">
        <div className="panel team-stat"><Users size={18} aria-hidden="true" /><strong>{studentCount} / 15</strong><span>Students</span></div>
        <div className="panel team-stat"><Shield size={18} aria-hidden="true" /><strong>{coachCount} / 4</strong><span>Coaches</span></div>
        <div className="panel team-stat"><Settings size={18} aria-hidden="true" /><strong>{leadershipCount}</strong><span>Owners &amp; administrators</span></div>
      </div>

      <TeamQuizAssignments
        teamId={team.id}
        userId={user?.id ?? ""}
        canManage={canInvite}
      />

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
