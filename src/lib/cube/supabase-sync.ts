import { supabase } from "@/integrations/supabase/client";
import type { CloudSyncApi } from "./cloud-sync";

async function listAll<T>(
  read: (from: number, to: number) => Promise<{ data: T[] | null; error: Error | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await read(from, from + 999);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export const supabaseSyncApi: CloudSyncApi = {
  listSessions: (userId) =>
    listAll(
      async (from, to) =>
        await supabase
          .from("cube_sessions")
          .select("*")
          .eq("user_id", userId)
          .order("created_at_ms")
          .range(from, to),
    ),
  listSolves: (userId) =>
    listAll(
      async (from, to) =>
        await supabase
          .from("cube_solves")
          .select("*")
          .eq("user_id", userId)
          .order("recorded_at_ms")
          .range(from, to),
    ),
  upsertSessions: async (rows, ignoreDuplicates) => {
    const { error } = await supabase.from("cube_sessions").upsert(rows, {
      onConflict: "user_id,id",
      ignoreDuplicates,
    });
    if (error) throw error;
  },
  upsertSolves: async (rows, ignoreDuplicates) => {
    const { error } = await supabase.from("cube_solves").upsert(rows, {
      onConflict: "user_id,id",
      ignoreDuplicates,
    });
    if (error) throw error;
  },
  softDeleteSessions: async (_userId, operations) => {
    const { data, error } = await supabase.rpc("soft_delete_cube_sessions", {
      _ids: operations.map((operation) => operation.id),
      _updated_at_ms: operations.map((operation) => operation.updatedAt),
    });
    if (error) throw error;
    return data ?? [];
  },
  softDeleteSolves: async (_userId, operations) => {
    const { data, error } = await supabase.rpc("soft_delete_cube_solves", {
      _ids: operations.map((operation) => operation.id),
      _updated_at_ms: operations.map((operation) => operation.updatedAt),
    });
    if (error) throw error;
    return data ?? [];
  },
};

export function subscribeToAccountSolves(
  userId: string,
  onChange: (table: "session" | "solve", id: string) => void,
) {
  const notify = (table: "session" | "solve", payload: { new: unknown; old: unknown }) => {
    for (const row of [payload.new, payload.old]) {
      if (row && typeof row === "object" && "id" in row && typeof row.id === "string") {
        onChange(table, row.id);
        return;
      }
    }
  };
  return supabase
    .channel(`cube-sync:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "cube_sessions", filter: `user_id=eq.${userId}` },
      (payload) => notify("session", payload),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "cube_solves", filter: `user_id=eq.${userId}` },
      (payload) => notify("solve", payload),
    )
    .subscribe();
}
