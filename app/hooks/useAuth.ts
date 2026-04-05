import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/auth";

export function useAuth() {
  const { session, profile, loading, setSession, fetchProfile, signOut } =
    useAuthStore();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile();
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile();
    });

    return () => subscription.unsubscribe();
  }, []);

  const isOnboarded = !!profile?.onboarded_at;
  const role = profile?.role ?? "member";

  return { session, profile, loading, isOnboarded, role, signOut };
}
