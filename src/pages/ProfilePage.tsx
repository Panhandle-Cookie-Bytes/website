import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Camera, Check, ExternalLink, LockKeyhole, Save, Trash2 } from "lucide-react";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { useAuth } from "../contexts/AuthContext";
import { supabase, requireSupabase } from "../lib/supabase";
import { updateAvatarPath, updateProfile } from "../services/profileService";
import type { ProfileVisibility, Program } from "../types/database";

const programs: Program[] = ["FLL", "FTC", "FRC", "General FIRST"];

export function ProfilePage() {
  const { user, profile, profileLoading, profileError, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageError, setMessageError] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  if (!user) return null;
  const currentUser = user;

  async function handleProfileRetry() {
    try {
      await refreshProfile();
    } catch (error) {
      setMessageError(true);
      setMessage(error instanceof Error
        ? `Your profile could not be loaded: ${error.message}`
        : "Your profile could not be loaded. Check the Supabase migration and project configuration, then retry.");
    }
  }

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    setMessage(null);
    const formData = new FormData(event.currentTarget);
    const displayName = String(formData.get("displayName") ?? "").trim();
    const rawUsername = String(formData.get("username") ?? "").trim().toLowerCase();
    const bio = String(formData.get("bio") ?? "").trim();
    const rawProgram = String(formData.get("preferredProgram") ?? "");
    const visibility = String(formData.get("visibility") ?? "private");

    try {
      if (!displayName || displayName.length > 60) throw new Error("Display name must be between 1 and 60 characters.");
      if (rawUsername && !/^[a-z0-9_]{3,24}$/.test(rawUsername)) {
        throw new Error("Usernames must be 3–24 characters and use only lowercase letters, numbers, or underscores.");
      }
      if (bio.length > 240) throw new Error("Your bio must be 240 characters or fewer.");
      if (rawProgram && !programs.includes(rawProgram as Program)) throw new Error("Choose a valid FIRST program.");
      if (visibility !== "public" && visibility !== "private") throw new Error("Choose a valid profile visibility setting.");
      await updateProfile(currentUser.id, {
        display_name: displayName,
        username: rawUsername || null,
        bio,
        preferred_program: (rawProgram || null) as Program | null,
        profile_visibility: visibility as ProfileVisibility,
      });
      await refreshProfile();
      setMessageError(false);
      setMessage("Your profile has been saved.");
    } catch (error) {
      setMessageError(true);
      const errorText = error instanceof Error ? error.message : "Could not save your profile.";
      setMessage(errorText.includes("profiles_username_unique")
        ? "That username is already taken. Try another one."
        : errorText);
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setMessage(null);
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowedTypes.includes(file.type)) {
      setMessageError(true);
      setMessage("Choose a JPG, PNG, WebP, or AVIF image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessageError(true);
      setMessage("Profile images must be 5 MB or smaller.");
      return;
    }
    setAvatarBusy(true);
    const path = `${currentUser.id}/avatar`;
    try {
      const { error } = await requireSupabase()
        .storage
        .from("profile-avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      await updateAvatarPath(currentUser.id, path);
      await refreshProfile();
      setMessageError(false);
      setMessage("Profile picture updated.");
    } catch (error) {
      setMessageError(true);
      setMessage(error instanceof Error ? error.message : "Could not upload your profile picture.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleAvatarRemove() {
    if (!profile?.avatar_url) return;
    if (!window.confirm("Remove your profile picture?")) return;
    setAvatarBusy(true);
    setMessage(null);
    try {
      const path = profile.avatar_url;
      await updateAvatarPath(currentUser.id, null);
      await refreshProfile();
      const { error } = await requireSupabase().storage.from("profile-avatars").remove([path]);
      if (error) {
        setMessageError(true);
        setMessage(`Your profile picture was removed, but its stored file could not be deleted: ${error.message}`);
        return;
      }
      setMessageError(false);
      setMessage("Profile picture removed.");
    } catch (error) {
      setMessageError(true);
      setMessage(error instanceof Error ? error.message : "Could not remove your profile picture.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmPassword") ?? "");
    if (password.length < 8) {
      setMessageError(true);
      setMessage("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setMessageError(true);
      setMessage("The new passwords don’t match.");
      return;
    }
    setPasswordBusy(true);
    try {
      const { error } = await requireSupabase().auth.updateUser({ password });
      if (error) throw error;
      form.reset();
      setMessageError(false);
      setMessage("Your password has been updated.");
    } catch (error) {
      setMessageError(true);
      setMessage(error instanceof Error ? error.message : "Could not update your password.");
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <div className="account-page">
      <header className="page-heading">
        <span className="eyebrow"><span className="eyebrow-mark" /> Your account</span>
        <h1>Profile &amp; settings</h1>
        <p>Choose how your profile appears and keep your account details up to date.</p>
      </header>

      {message && <p className={`notice ${messageError ? "notice-error" : "notice-success"}`} role={messageError ? "alert" : "status"}>{message}</p>}
      {profileError && (
        <div className="notice notice-error" role="alert">
          <strong>We couldn’t load your profile.</strong> {profileError}
          <p>Confirm that the Phase 1 Supabase migration has been run for this project, then retry.</p>
          <button className="text-button" type="button" onClick={() => void handleProfileRetry()}>Retry</button>
        </div>
      )}
      {profileLoading && <div className="page-status" role="status">Loading your profile…</div>}
      {!profileLoading && profile && (
        <div className="account-grid">
          <aside className="account-summary panel">
            <ProfileAvatar path={profile.avatar_url} name={profile.display_name} />
            <h2>{profile.display_name}</h2>
            <p>{profile.username ? `@${profile.username}` : "Choose a username to create a public profile link."}</p>
            <span className={`privacy-badge ${profile.profile_visibility === "public" ? "privacy-public" : ""}`}>
              {profile.profile_visibility === "public" ? <ExternalLink size={14} aria-hidden="true" /> : <LockKeyhole size={14} aria-hidden="true" />}
              {profile.profile_visibility === "public" ? "Public profile" : "Private profile"}
            </span>
            {profile.profile_visibility === "public" && profile.username && (
              <Link className="text-link summary-link" to={`/users/${profile.username}`}>View public profile <ExternalLink size={15} aria-hidden="true" /></Link>
            )}
            <div className="account-email"><span>Email</span><strong>{currentUser.email}</strong></div>
            <div className="account-email"><span>Member since</span><strong>{new Date(profile.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long" })}</strong></div>
          </aside>

          <div className="account-sections">
            <section className="panel account-panel">
              <div className="panel-heading"><div><span className="eyebrow">Personal details</span><h2>Your profile</h2></div></div>
              <div className="avatar-edit-row">
                <ProfileAvatar path={profile.avatar_url} name={profile.display_name} size="small" />
                <div><strong>Profile picture</strong><p>JPG, PNG, WebP, or AVIF. Maximum 5 MB.</p></div>
                <label className="button button-secondary button-small upload-button">
                  <Camera size={15} aria-hidden="true" /> {avatarBusy ? "Uploading…" : "Upload"}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => void handleAvatarChange(event)} disabled={avatarBusy || !supabase} />
                </label>
                {profile.avatar_url && (
                  <button className="icon-button" type="button" aria-label="Remove profile picture" title="Remove profile picture" disabled={avatarBusy} onClick={() => void handleAvatarRemove()}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
              <form className="form-stack profile-form" onSubmit={(event) => void handleProfileSave(event)}>
                <div className="form-row">
                  <label className="field"><span>Display name</span><input name="displayName" type="text" maxLength={60} defaultValue={profile.display_name} required /></label>
                  <label className="field"><span>Username</span><input name="username" type="text" minLength={3} maxLength={24} pattern="[a-z0-9_]{3,24}" defaultValue={profile.username ?? ""} placeholder="your_handle" /><small className="field-hint">Optional. Unique, lowercase, 3–24 characters.</small></label>
                </div>
                <label className="field"><span>About you <small>optional</small></span><textarea name="bio" rows={3} maxLength={240} defaultValue={profile.bio} placeholder="What are you building or learning?" /><small className="field-hint">Up to 240 characters.</small></label>
                <div className="form-row">
                  <label className="field"><span>Preferred FIRST program</span><select name="preferredProgram" defaultValue={profile.preferred_program ?? ""}><option value="">Not set</option>{programs.map((program) => <option key={program} value={program}>{program}</option>)}</select></label>
                  <label className="field"><span>Profile visibility</span><select name="visibility" defaultValue={profile.profile_visibility}><option value="private">Private — only you can view it</option><option value="public">Public — shareable by username</option></select></label>
                </div>
                <div className="form-actions">
                  {profile.profile_visibility === "public" && profile.username && <Link className="text-link" to={`/users/${profile.username}`}>Preview profile <ExternalLink size={15} aria-hidden="true" /></Link>}
                  <button className="button button-primary" type="submit" disabled={saving}><Save size={16} aria-hidden="true" /> {saving ? "Saving…" : "Save changes"}</button>
                </div>
              </form>
            </section>

            <section className="panel account-panel">
              <div className="panel-heading"><div><span className="eyebrow">Account security</span><h2>Change password</h2></div><span className="security-icon"><LockKeyhole size={17} aria-hidden="true" /></span></div>
              <p className="panel-description">Use a unique password with at least 8 characters.</p>
              <form className="form-stack" onSubmit={(event) => void handlePasswordChange(event)}>
                <div className="form-row">
                  <label className="field"><span>New password</span><input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
                  <label className="field"><span>Confirm new password</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
                </div>
                <div className="form-actions"><span /><button className="button button-secondary" type="submit" disabled={passwordBusy}>{passwordBusy ? "Updating…" : "Update password"} <Check size={16} aria-hidden="true" /></button></div>
              </form>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
