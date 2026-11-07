/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { hasRecoveryLink } from "@/lib/cube/account";

const SessionContext = createContext<{
  user: User | null;
  loading: boolean;
  recovery: boolean;
  error: string | null;
}>({ user: null, loading: true, recovery: false, error: null });
export const useAccountSession = () => useContext(SessionContext);

export function AccountSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({
    user: null as User | null,
    loading: true,
    recovery: false,
    error: null as string | null,
  });
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    let active = true;
    let revision = 0;
    const recoveryLink = hasRecoveryLink(window.location.hash);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      revision++;
      if (!active) return;
      setState((prev) => ({
        user: session?.user ?? null,
        loading: false,
        recovery: event === "PASSWORD_RECOVERY" || (event !== "SIGNED_OUT" && prev.recovery),
        error: null,
      }));
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void router.invalidate();
        if (event !== "SIGNED_OUT") void queryClient.invalidateQueries();
      }
    });
    const initialRevision = revision;
    void supabase.auth
      .getUser()
      .then(({ data: result, error }) => {
        if (!active || revision !== initialRevision) return;
        setState({
          user: result.user,
          loading: false,
          recovery: recoveryLink && !!result.user,
          error:
            error && error.name !== "AuthSessionMissingError"
              ? "Unable to check your account. Please try signing in again."
              : null,
        });
      })
      .catch(() => {
        if (active)
          setState({
            user: null,
            loading: false,
            recovery: false,
            error: "Unable to check your account. Please try again.",
          });
      });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [router, queryClient]);
  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}
