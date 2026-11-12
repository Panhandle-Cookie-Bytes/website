import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { getPublicProfile } from "../services/profileService";
import type { Profile } from "../types/database";

export function PublicProfilePage() {
  const { username = "" } = useParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void getPublicProfile(username).then((result) => {
      if (active) setProfile(result);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load this profile.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [username]);

  if (loading) return <div className="page-status" role="status">Loading profile…</div>;
  if (error) {
    return <section className="message-page"><span className="eyebrow">Profile</span><h1>We couldn’t load this profile.</h1><p role="alert">{error}</p><Link className="button button-secondary" to="/"><ArrowLeft size={16} aria-hidden="true" /> Go home</Link></section>;
  }
  if (!profile) {
    return <section className="message-page"><span className="private-mark"><LockKeyhole size={22} aria-hidden="true" /></span><h1>This profile isn’t available.</h1><p>It may be private, or the username may have changed.</p><Link className="button button-secondary" to="/"><ArrowLeft size={16} aria-hidden="true" /> Go home</Link></section>;
  }

  return (
    <section className="public-profile-page">
      <Link className="back-link" to="/"> <ArrowLeft size={15} aria-hidden="true" /> Back to home</Link>
      <article className="public-profile-card panel">
        <div className="profile-cover" />
        <ProfileAvatar path={profile.avatar_url} name={profile.display_name} />
        <div className="public-profile-copy">
          <span className="eyebrow">FIRST community member</span>
          <h1>{profile.display_name}</h1>
          {profile.username && <p className="username-line">@{profile.username}</p>}
          {profile.bio && <p className="public-bio">{profile.bio}</p>}
          {profile.preferred_program && <span className="program-tag">{profile.preferred_program}</span>}
          <p className="joined-line">Member since {new Date(profile.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long" })}</p>
        </div>
      </article>
    </section>
  );
}
