import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { getProfile } from "../services/profileService";
import type { Profile } from "../types/database";

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  profileError: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user ?? null);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setProfileError(error.message);
      setUser(data.session?.user ?? null);
      setLoading(false);
    }).catch((error: unknown) => {
      if (active) {
        setProfileError(error instanceof Error ? error.message : "Could not restore your sign-in.");
        setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileError(null);
      setProfileLoading(false);
      return;
    }

    let active = true;
    setProfile(null);
    setProfileLoading(true);
    setProfileError(null);
    void getProfile(user.id).then((nextProfile) => {
      if (active) setProfile(nextProfile);
    }).catch((error: unknown) => {
      if (active) {
        setProfileError(error instanceof Error ? error.message : "Could not load your profile.");
      }
    }).finally(() => {
      if (active) setProfileLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user?.id]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    setProfileLoading(true);
    try {
      const nextProfile = await getProfile(user.id);
      setProfile(nextProfile);
      setProfileError(null);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Could not load your profile.");
      throw error;
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo(() => ({
    user,
    profile,
    loading,
    profileLoading,
    profileError,
    refreshProfile,
    signOut,
  }), [user, profile, loading, profileLoading, profileError, refreshProfile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}
