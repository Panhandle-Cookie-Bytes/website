import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { sendPasswordReset } from "../services/authService";
import { supabase, supabaseConfigError, requireSupabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

export function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setIsError(false);
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim().toLowerCase();
    try {
      const { error } = await sendPasswordReset(email);
      if (error) throw error;
      setMessage("If an account exists for that address, a password reset link is on its way.");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Could not request a password reset.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-page auth-page-compact">
      <div className="auth-aside">
        <span className="eyebrow"><span className="eyebrow-mark" /> Account recovery</span>
        <h1>Let’s get<br /><span>you back in.</span></h1>
        <p>We’ll send a secure link to the email address on your account so you can choose a new password.</p>
      </div>
      <div className="auth-card">
        <div className="auth-card-heading"><span className="eyebrow">Reset password</span><h2>Check your inbox</h2><p>Enter the email address you used to create your account.</p></div>
        {supabaseConfigError && <p className="notice notice-error" role="alert">{supabaseConfigError}</p>}
        {message && <p className={`notice notice-${isError ? "error" : "success"}`} role={isError ? "alert" : "status"}>{message}</p>}
        <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field"><span>Email address</span><input name="email" type="email" autoComplete="email" required /></label>
          <button className="button button-primary button-wide" type="submit" disabled={busy || !supabase}>
            {busy ? "Sending…" : "Send reset link"} <span aria-hidden="true">→</span>
          </button>
        </form>
        <Link className="back-link" to="/sign-in">Back to sign in</Link>
      </div>
    </section>
  );
}

export function ResetPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (!message || isError) return;
    const timer = window.setTimeout(() => {
      navigate(user ? "/profile" : "/sign-in", { replace: true });
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [message, isError, navigate, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const confirmPassword = String(new FormData(event.currentTarget).get("confirmPassword") ?? "");
    if (password.length < 8) {
      setIsError(true);
      setMessage("Use a password with at least 8 characters.");
      setBusy(false);
      return;
    }
    if (password !== confirmPassword) {
      setIsError(true);
      setMessage("The passwords don’t match.");
      setBusy(false);
      return;
    }

    try {
      const { error } = await requireSupabase().auth.updateUser({ password });
      if (error) throw error;
      setIsError(false);
      setMessage("Your password has been updated.");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Could not update your password. Open a fresh reset link and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-page auth-page-compact">
      <div className="auth-aside"><span className="eyebrow"><span className="eyebrow-mark" /> Secure your account</span><h1>A fresh start,<br /><span>one step away.</span></h1><p>Choose a new password you don’t use for another account.</p></div>
      <div className="auth-card">
        <div className="auth-card-heading"><span className="eyebrow">New password</span><h2>Choose a password</h2><p>Use at least 8 characters.</p></div>
        {supabaseConfigError && <p className="notice notice-error" role="alert">{supabaseConfigError}</p>}
        {message && <p className={`notice notice-${isError ? "error" : "success"}`} role={isError ? "alert" : "status"}>{message}</p>}
        <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field"><span>New password</span><input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
          <label className="field"><span>Confirm new password</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
          <button className="button button-primary button-wide" type="submit" disabled={busy || !supabase}>
            {busy ? "Updating…" : "Update password"} <span aria-hidden="true">→</span>
          </button>
        </form>
        <Link className="back-link" to="/sign-in">Back to sign in</Link>
      </div>
    </section>
  );
}

export function AuthCallbackPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const authError = params.get("error_description") || params.get("error");
  const requestedDestination = params.get("next");
  const destination = requestedDestination?.startsWith("/") && !requestedDestination.startsWith("//")
    ? requestedDestination
    : "/profile";

  useEffect(() => {
    if (user && !loading) navigate(destination, { replace: true });
  }, [user, loading, navigate, destination]);

  if (loading) return <div className="page-status" role="status">Confirming your account…</div>;
  if (user) return <div className="page-status" role="status">Your account is confirmed. Continuing…</div>;
  return (
    <section className="message-page">
      <span className="eyebrow"><span className="eyebrow-mark" /> Account verification</span>
      <h1>{authError ? "This link needs attention." : "We couldn’t finish signing you in."}</h1>
      <p role={authError ? "alert" : "status"}>{authError ?? "The confirmation link may have expired, or your email address may still need verification."}</p>
      <Link className="button button-primary" to="/sign-in">Return to sign in</Link>
    </section>
  );
}
