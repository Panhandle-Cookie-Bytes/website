import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Plus, Users } from "lucide-react";
import { TeamForm } from "../components/TeamForm";
import { useAuth } from "../contexts/AuthContext";
import {
  createTeam,
  joinTeam,
  listPublicTeams,
  listMyTeams,
  previewTeamInvitation,
  type MyTeam,
} from "../services/teamService";
import type { Team, TeamChanges, TeamInvitationPreview } from "../types/database";

export function TeamsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<MyTeam[]>([]);
  const [publicTeams, setPublicTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!user) return;
    void Promise.all([listMyTeams(user.id), listPublicTeams()]).then(([result, publicResult]) => {
      if (active) {
        setTeams(result);
        const memberTeamIds = new Set(result.map(({ id }) => id));
        setPublicTeams(publicResult.filter((team) => !memberTeamIds.has(team.id)));
      }
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load your teams.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [user]);

  async function handleCreate(changes: TeamChanges) {
    setBusy(true);
    setError(null);
    try {
      const teamId = await createTeam(changes);
      navigate(`/teams/${teamId}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the team.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account-page teams-page">
      <header className="page-heading">
        <span className="eyebrow"><span className="eyebrow-mark" /> Your FIRST community</span>
        <h1>My teams</h1>
        <p>Keep your team organized and learn together. Your personal profile stays available either way.</p>
      </header>
      {error && <p className="notice notice-error" role="alert">{error}</p>}

      <div className="team-page-grid">
        <section className="panel account-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Team spaces</span><h2>Your teams</h2></div>
            <span className="team-count">{teams.length}</span>
          </div>
          {loading ? (
            <p className="team-empty">Loading your teams…</p>
          ) : teams.length ? (
            <div className="team-card-list">
              {teams.map((team) => (
                <Link className="team-card" key={team.id} to={`/teams/${team.id}`}>
                  <span className="team-card-icon">
                    {team.logo_url ? <img src={team.logo_url} alt="" /> : <Users size={20} aria-hidden="true" />}
                  </span>
                  <span className="team-card-copy">
                    <strong>{team.name}</strong>
                    <span>{team.program} · Team {team.team_number} · {team.role}</span>
                  </span>
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="team-empty">
              <span className="team-empty-icon"><Users size={23} aria-hidden="true" /></span>
              <h3>No team spaces yet</h3>
              <p>Create a team or join one using an invitation code from a coach.</p>
            </div>
          )}
          <Link className="button button-secondary team-join-link" to="/teams/join">
            Join with an invitation code <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </section>

        <section className="panel account-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Start a team space</span><h2>Create a team</h2></div>
            <span className="security-icon"><Plus size={18} aria-hidden="true" /></span>
          </div>
          <p className="panel-description">You’ll be the team owner. You can invite members and assign team roles after creation.</p>
          <TeamForm busy={busy} submitLabel="Create team" onSubmit={handleCreate} />
        </section>
      </div>
      <section className="panel account-panel team-discovery-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">Open team spaces</span><h2>Explore public teams</h2></div>
          <span className="team-count">{publicTeams.length}</span>
        </div>
        {loading ? (
          <p className="team-empty">Loading public teams…</p>
        ) : publicTeams.length ? (
          <div className="team-card-list team-public-list">
            {publicTeams.map((team) => (
              <Link className="team-card" key={team.id} to={`/teams/${team.id}`}>
                <span className="team-card-icon">
                  {team.logo_url ? <img src={team.logo_url} alt="" /> : <Users size={20} aria-hidden="true" />}
                </span>
                <span className="team-card-copy">
                  <strong>{team.name}</strong>
                  <span>{team.program} · Team {team.team_number} · Public</span>
                </span>
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="team-empty">No public teams are listed yet. Ask a coach for an invitation code to join a private team.</p>
        )}
      </section>
    </section>
  );
}

export function TeamJoinPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [preview, setPreview] = useState<TeamInvitationPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const queryCode = searchParams.get("code")?.trim().toUpperCase() ?? "";
    setCode(queryCode);
    setPreview(null);
    setError(null);
    if (!queryCode) return;

    let active = true;
    setLoading(true);
    void previewTeamInvitation(queryCode).then((invitation) => {
      if (active) setPreview(invitation);
    }).catch((previewError: unknown) => {
      if (active) setError(previewError instanceof Error ? previewError.message : "Could not check this invitation.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [searchParams]);

  function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    setSearchParams(normalizedCode ? { code: normalizedCode } : {});
  }

  async function handleJoin() {
    if (!preview) return;
    setJoining(true);
    setError(null);
    try {
      const teamId = await joinTeam(code.trim().toUpperCase());
      navigate(`/teams/${teamId}`, { replace: true });
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join this team.");
      setJoining(false);
    }
  }

  return (
    <section className="public-profile-page team-join-page">
      <Link className="back-link" to="/teams">← Back to my teams</Link>
      <div className="panel team-join-card">
        <span className="eyebrow"><span className="eyebrow-mark" /> Team invitation</span>
        <h1>Find your team.</h1>
        <p>Enter the invitation code your team administrator or coach shared with you.</p>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <form className="form-stack" onSubmit={handleLookup}>
          <label className="field">
            <span>Invitation code</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, ""))}
              autoComplete="off"
              maxLength={8}
              pattern="[A-HJ-NP-Z2-9]{8}"
              placeholder="Enter your 8-character code"
              required
            />
          </label>
          <button className="button button-secondary" type="submit" disabled={loading}>
            {loading ? "Checking code…" : "Check invitation"} <ArrowRight size={16} aria-hidden="true" />
          </button>
        </form>

        {preview && (
          <div className="invitation-preview">
            <span className="eyebrow">You’re invited as a {preview.invited_role}</span>
            <h2>{preview.team_name}</h2>
            <p>{preview.program} · Team {preview.team_number}</p>
            {preview.team_description && <p>{preview.team_description}</p>}
            <button className="button button-primary" type="button" onClick={() => void handleJoin()} disabled={joining}>
              {joining ? "Joining team…" : "Join this team"} <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
