import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Github, Mail } from "lucide-react";
import { resendSignupConfirmation, signIn, signInWithProvider, signUp } from "../services/authService";
import { supabase, supabaseConfigError } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

interface AuthPageProps {
  mode: "sign-in" | "sign-up";
}

export function AuthPage({ mode }: AuthPageProps) {
  const isSignUp = mode === "sign-up";
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"error" | "success">("error");
  const [resendEmail, setResendEmail] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  if (!loading && user) return <Navigate to="/profile" replace />;
  if (loading) return <div className="page-status" role="status">Checking your sign-in…</div>;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setResendEmail(null);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    try {
      if (isSignUp) {
        const displayName = String(formData.get("displayName") ?? "").trim();
        const enteredUsername = String(formData.get("username") ?? "").trim().toLowerCase();
        if (!displayName || displayName.length > 60) {
          throw new Error("Choose a display name between 1 and 60 characters.");
        }
        if (enteredUsername && !/^[a-z0-9_]{3,24}$/.test(enteredUsername)) {
          throw new Error("Usernames must be 3–24 characters and use only lowercase letters, numbers, or underscores.");
        }
        if (password.length < 8) throw new Error("Use a password with at least 8 characters.");
        const { data, error } = await signUp(email, password, displayName, enteredUsername || null);
        if (error) throw error;
        if (!data.session) {
          setMessageKind("success");
          setMessage("Account created. Check your email for a verification link before signing in.");
          setResendEmail(email);
          return;
        }
        navigate("/profile", { replace: true });
        return;
      }

      const { error } = await signIn(email, password);
      if (error) throw error;
      const destination = (location.state as { from?: string } | null)?.from ?? "/profile";
      navigate(destination, { replace: true });
    } catch (error) {
      setMessageKind("error");
      const errorText = error instanceof Error ? error.message : "Authentication could not be completed.";
      if (!isSignUp && errorText.toLowerCase().includes("email not confirmed")) {
        setResendEmail(email);
        setMessage("Please verify your email before signing in. You can resend the confirmation below.");
      } else {
        setMessage(errorText);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleProvider(provider: "google" | "github") {
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await signInWithProvider(provider);
      if (error) throw error;
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : `Could not start ${provider} sign-in.`);
      setBusy(false);
    }
  }

  async function handleResend() {
    if (!resendEmail) return;
    setBusy(true);
    try {
      const { error } = await resendSignupConfirmation(resendEmail);
      if (error) throw error;
      setMessageKind("success");
      setMessage("A new verification email has been sent. Check your inbox.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Could not resend the verification email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-aside">
        <span className="eyebrow"><span className="eyebrow-mark" /> Your next step starts here</span>
        <h1>{isSignUp ? <>Make room for<br /><span>what’s possible.</span></> : <>Good to see<br /><span>you again.</span></>}</h1>
        <p>{isSignUp
          ? "Create your account to start building stronger FIRST knowledge, one question at a time."
          : "Pick up where your curiosity left off. Your FIRST learning journey is waiting."}</p>
        <div className="auth-aside-note"><Mail size={18} aria-hidden="true" /><span>Email verification helps keep your account yours.</span></div>
      </div>
      <div className="auth-card">
        <div className="auth-card-heading">
          <span className="eyebrow">{isSignUp ? "Join the community" : "Welcome back"}</span>
          <h2>{isSignUp ? "Create your account" : "Sign in"}</h2>
          <p>{isSignUp ? "A few details and you’re ready to go." : "Use the email and password linked to your account."}</p>
        </div>

        {supabaseConfigError && <p className="notice notice-error" role="alert">{supabaseConfigError}</p>}
        {message && <p className={`notice notice-${messageKind}`} role={messageKind === "error" ? "alert" : "status"}>{message}</p>}
        {resendEmail && (
          <button className="text-button resend-button" type="button" disabled={busy || !supabase} onClick={() => void handleResend()}>
            Resend verification email
          </button>
        )}

        <div className="oauth-actions">
          <button className="button button-oauth" type="button" disabled={busy || !supabase} onClick={() => void handleProvider("google")}>
            <span className="google-g" aria-hidden="true">G</span> Continue with Google
          </button>
          <button className="button button-oauth" type="button" disabled={busy || !supabase} onClick={() => void handleProvider("github")}>
            <Github size={17} aria-hidden="true" /> Continue with GitHub
          </button>
        </div>
        <div className="auth-divider"><span>or with email</span></div>

        <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
          {isSignUp && (
            <>
              <label className="field">
                <span>Display name</span>
                <input name="displayName" type="text" autoComplete="name" maxLength={60} placeholder="How should we call you?" required />
              </label>
              <label className="field">
                <span>Username <small>optional</small></span>
                <input name="username" type="text" autoComplete="username" minLength={3} maxLength={24} pattern="[a-z0-9_]{3,24}" placeholder="your_handle" />
                <small className="field-hint">3–24 lowercase letters, numbers, or underscores.</small>
              </label>
            </>
          )}
          <label className="field">
            <span>Email address</span>
            <input name="email" type="email" autoComplete="email" maxLength={254} placeholder="you@example.com" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input name="password" type="password" autoComplete={isSignUp ? "new-password" : "current-password"} minLength={8} required />
            {isSignUp && <small className="field-hint">At least 8 characters.</small>}
          </label>
          {!isSignUp && <Link className="forgot-link" to="/forgot-password">Forgot password?</Link>}
          <button className="button button-primary button-wide" type="submit" disabled={busy || !supabase}>
            {busy ? "Please wait…" : isSignUp ? "Create account" : "Sign in"} <span aria-hidden="true">→</span>
          </button>
        </form>

        <p className="auth-switch">
          {isSignUp ? "Already have an account?" : "New to FIRST Quiz?"}{" "}
          <Link to={isSignUp ? "/sign-in" : "/sign-up"}>{isSignUp ? "Sign in" : "Create an account"}</Link>
        </p>
        <p className="auth-legal">By continuing, you agree to use the platform respectfully and keep your account secure.</p>
      </div>
    </section>
  );
}
