import type { Provider } from "@supabase/supabase-js";
import { requireSupabase } from "../lib/supabase";

function authCallbackUrl(path: string, returnTo?: string) {
  const url = new URL(path, window.location.origin);
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    url.searchParams.set("next", returnTo);
  }
  return url.toString();
}

export async function signIn(email: string, password: string) {
  return requireSupabase().auth.signInWithPassword({ email, password });
}

export async function signUp(
  email: string,
  password: string,
  displayName: string,
  username: string | null,
  returnTo?: string,
) {
  return requireSupabase().auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName, username },
      emailRedirectTo: authCallbackUrl("/auth/callback", returnTo),
    },
  });
}

export async function signInWithProvider(provider: Provider, returnTo?: string) {
  return requireSupabase().auth.signInWithOAuth({
    provider,
    options: { redirectTo: authCallbackUrl("/auth/callback", returnTo) },
  });
}

export async function sendPasswordReset(email: string) {
  return requireSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: authCallbackUrl("/auth/reset-password"),
  });
}

export async function resendSignupConfirmation(email: string, returnTo?: string) {
  return requireSupabase().auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: authCallbackUrl("/auth/callback", returnTo) },
  });
}
