import type { Provider } from "@supabase/supabase-js";
import { requireSupabase } from "../lib/supabase";

function authCallbackUrl(path: string) {
  return new URL(path, window.location.origin).toString();
}

export async function signIn(email: string, password: string) {
  return requireSupabase().auth.signInWithPassword({ email, password });
}

export async function signUp(
  email: string,
  password: string,
  displayName: string,
  username: string | null,
) {
  return requireSupabase().auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName, username },
      emailRedirectTo: authCallbackUrl("/auth/callback"),
    },
  });
}

export async function signInWithProvider(provider: Provider) {
  return requireSupabase().auth.signInWithOAuth({
    provider,
    options: { redirectTo: authCallbackUrl("/auth/callback") },
  });
}

export async function sendPasswordReset(email: string) {
  return requireSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: authCallbackUrl("/auth/reset-password"),
  });
}

export async function resendSignupConfirmation(email: string) {
  return requireSupabase().auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: authCallbackUrl("/auth/callback") },
  });
}
