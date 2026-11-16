import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy, KeyRound, Shield, Trash2 } from "lucide-react";
import { TeamForm } from "../components/TeamForm";
import { TeamQuizAssignments } from "../components/TeamQuizAssignments";
import { useAuth } from "../contexts/AuthContext";
import {
  createTeamInvitation,
  deactivateTeamInvitation,
  deleteTeam,
  getTeamDetails,
  getTeamInvitations,
  transferTeamOwnership,
  updateTeam,
  type TeamDetails,
  type TeamInvitation,
} from "../services/teamService";
import type { TeamChanges } from "../types/database";

function expirationValue(days: string): string | null {
  if (days === "never") return null;
  const date = new Date();
  date.setDate(date.getDate() + Number(days));
  return date.toISOString();
}

function expirationLabel(expiresAt: string | null) {
  return expiresAt ? `Expires ${new Date(expiresAt).toLocaleDateString()}` : "Never expires";
}

export function TeamSettingsPage() {
  const { teamId = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [details, setDetails] = useState<TeamDetails | null>(null);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    const [teamDetails, teamInvitations] = await Promise.all([
      getTeamDetails(teamId),
      getTeamInvitations(teamId),
    ]);
    setDetails(teamDetails);
    setInvitations(teamInvitations);
  }, [teamId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadPage().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load team settings.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [loadPage]);

  const currentMember = details?.members.find((member) => member.user_id === user?.id);
  const role = currentMember?.role;
  const canEditSettings = role === "owner" || role === "administrator";
  const canManageInvitations = canEditSettings || role === "coach";
  const activeInvitations = invitations.filter((invitation) => invitation.is_active);

  async function handleSave(changes: TeamChanges) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await updateTeam(teamId, changes);
      await loadPage();
      setMessage("Team settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save team settings.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const invitedRole = String(formData.get("role") ?? "student") as "student" | "coach";
    const expiration = String(formData.get("expiration") ?? "7");
    setBusy(true);
    setError(null);
    setMessage(null);
    setCode(null);
    try {
      const invitation = await createTeamInvitation(teamId, invitedRole, expirationValue(expiration));
      setCode(invitation.code);
      setExpiresAt(invitation.expiresAt);
      await loadPage();
      setMessage("Invitation created. Copy the link now; the code is only shown once.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create an invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyLink() {
    if (!code) return;
    const link = new URL(`/teams/join?code=${encodeURIComponent(code)}`, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(link);
      setMessage("Invitation link copied.");
    } catch (copyError) {
      setError(copyError instanceof Error ? `Could not copy the invitation link: ${copyError.message}` : "Could not copy the invitation link. Copy it from your browser address bar after opening it.");
    }
  }

  async function handleDisable(invitation: TeamInvitation) {
    if (!window.confirm("Disable this invitation? Anyone with its link will no longer be able to join.")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await deactivateTeamInvitation(invitation.id);
      await loadPage();
      setMessage("Invitation disabled.");
      setCode(null);
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : "Could not disable the invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function handleTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newOwnerId = String(new FormData(event.currentTarget).get("newOwner") ?? "");
    const newOwnerName = details?.members.find(({ user_id }) => user_id === newOwnerId)?.profile?.display_name;
    if (!newOwnerId || !window.confirm(`Transfer team ownership to ${newOwnerName ?? "this member"}? You will become an administrator.`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await transferTeamOwnership(teamId, newOwnerId);
      await loadPage();
      setMessage("Ownership transferred. You are now an administrator.");
    } catch (transferError) {
      setError(transferError instanceof Error ? transferError.message : "Could not transfer ownership.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTeam() {
    const teamName = details?.team.name ?? "this team";
    if (!window.confirm(`Permanently delete ${teamName}? Members and invitations will also be removed. This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteTeam(teamId);
      navigate("/teams", { replace: true });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the team.");
      setBusy(false);
    }
  }

  if (loading) return <div className="page-status" role="status">Loading team settings…</div>;
  if (!details || !currentMember) {
    return (
      <section className="message-page">
        <span className="eyebrow"><span className="eyebrow-mark" /> Team unavailable</span>
        <h1>We can’t open these settings.</h1>
        <p role="alert">{error ?? "You may no longer be a member of this team."}</p>
        <Link className="button button-primary" to="/teams">Back to my teams</Link>
      </section>
    );
  }
  if (!canManageInvitations) {
    return (
      <section className="message-page">
        <span className="eyebrow"><span className="eyebrow-mark" /> Team permissions</span>
        <h1>These settings are limited.</h1>
        <p>Only team owners, administrators, and coaches can manage team invitations or settings.</p>
        <Link className="button button-primary" to={`/teams/${teamId}`}>Back to the team</Link>
      </section>
    );
  }

  const ownerCandidates = details.members.filter(({ user_id }) => user_id !== user?.id);

  return (
    <section className="account-page teams-page">
      <Link className="back-link" to={`/teams/${teamId}`}><ArrowLeft size={14} aria-hidden="true" /> Back to {details.team.name}</Link>
      <header className="page-heading">
        <span className="eyebrow"><span className="eyebrow-mark" /> {details.team.name}</span>
        <h1>Team settings</h1>
        <p>Manage your team profile, invitations, and membership.</p>
      </header>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {message && <p className="notice notice-success" role="status">{message}</p>}

      {canEditSettings && (
        <section className="panel account-panel team-settings-section">
          <div className="panel-heading">
            <div><span className="eyebrow">Team profile</span><h2>Details and visibility</h2></div>
            <span className="security-icon"><Shield size={18} aria-hidden="true" /></span>
          </div>
          <TeamForm initialTeam={details.team} busy={busy} submitLabel="Save team settings" onSubmit={handleSave} />
        </section>
      )}

      {canManageInvitations && (
        <TeamQuizAssignments
          teamId={teamId}
          userId={user?.id ?? ""}
          canManage={canManageInvitations}
        />
      )}

      {canManageInvitations && (
        <section className="panel account-panel team-settings-section" id="invitations">
          <div className="panel-heading">
            <div><span className="eyebrow">Grow your roster</span><h2>Invitations</h2></div>
            <span className="security-icon"><KeyRound size={18} aria-hidden="true" /></span>
          </div>
          <p className="panel-description">
            {activeInvitations.length
              ? "Generating a new invitation replaces the active code for that role. Student and coach codes can both remain active. Each code is stored securely and shown only once."
              : "Create a secure invitation link for a student or coach. The code is stored securely and shown only once."}
          </p>
          <form className="form-stack invitation-form" onSubmit={(event) => void handleCreateInvitation(event)}>
            <div className="form-row">
              <label className="field">
                <span>Invite as</span>
                <select name="role" defaultValue="student">
                  <option value="student">Student</option>
                  {canEditSettings && <option value="coach">Coach</option>}
                </select>
              </label>
              <label className="field">
                <span>Invitation expires</span>
                <select name="expiration" defaultValue="7">
                  <option value="1">After 1 day</option>
                  <option value="7">After 7 days</option>
                  <option value="30">After 30 days</option>
                  <option value="never">Never</option>
                </select>
              </label>
            </div>
            <button className="button button-primary" type="submit" disabled={busy}>
              {busy ? "Creating…" : "Generate invitation code"} <span aria-hidden="true">→</span>
            </button>
          </form>

          {code && (
            <div className="generated-invitation">
              <div>
                <span className="eyebrow">Your new invitation · {expirationLabel(expiresAt)}</span>
                <code>{code}</code>
              </div>
              <button className="button button-secondary button-small" type="button" onClick={() => void handleCopyLink()}>
                <Copy size={14} aria-hidden="true" /> Copy join link
              </button>
            </div>
          )}

          <div className="invitation-list-heading">
            <h3>Invitation history</h3>
            <span>{activeInvitations.length} active</span>
          </div>
          {invitations.length ? (
            <div className="invitation-list">
              {invitations.map((invitation) => (
                <div className="invitation-row" key={invitation.id}>
                  <span className="role-badge">{invitation.role === "coach" ? "Coach" : "Student"}</span>
                  <span className="invitation-meta">{expirationLabel(invitation.expires_at)}</span>
                  <span className={`invitation-status${invitation.is_active ? " is-active" : ""}`}>
                    {invitation.is_active ? "Active" : "Disabled"}
                  </span>
                  {invitation.is_active && (
                    <button className="text-button" type="button" disabled={busy} onClick={() => void handleDisable(invitation)}>
                      Disable
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="team-empty">No invitations have been created yet.</p>
          )}
        </section>
      )}

      {role === "owner" && (
        <section className="panel account-panel team-settings-section">
          <div className="panel-heading">
            <div><span className="eyebrow">Ownership</span><h2>Transfer team ownership</h2></div>
            <span className="security-icon"><Shield size={18} aria-hidden="true" /></span>
          </div>
          <p className="panel-description">The new owner becomes responsible for the team. You’ll remain an administrator.</p>
          {ownerCandidates.length ? (
            <form className="form-row ownership-form" onSubmit={(event) => void handleTransfer(event)}>
              <label className="field">
                <span>New owner</span>
                <select name="newOwner" defaultValue="" required>
                  <option value="" disabled>Select a team member</option>
                  {ownerCandidates.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.profile?.display_name ?? "FIRST member"} · {member.role}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button button-secondary" type="submit" disabled={busy}>Transfer ownership</button>
            </form>
          ) : <p className="team-empty">Invite at least one member before transferring ownership.</p>}

          <div className="danger-zone">
            <div>
              <h3>Delete this team</h3>
              <p>Permanently delete the team, its roster, and its invitation codes.</p>
            </div>
            <button className="button button-danger" type="button" disabled={busy} onClick={() => void handleDeleteTeam()}>
              <Trash2 size={15} aria-hidden="true" /> Delete team
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
