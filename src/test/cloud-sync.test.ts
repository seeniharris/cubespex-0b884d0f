import { describe, expect, it } from "vitest";
import {
  mergeImportedData,
  pushAccountChanges,
  syncAccountData,
  trackDataChanges,
  type CloudSession,
  type CloudSolve,
  type CloudSyncApi,
} from "@/lib/cube/cloud-sync";
import {
  defaultData,
  loadAccountCache,
  loadData,
  saveAccountCache,
  saveData,
  type AppData,
  type PendingSyncOperation,
} from "@/lib/cube/storage";

function testApi(initialSessions: CloudSession[] = [], initialSolves: CloudSolve[] = []) {
  const sessions = new Map(initialSessions.map((row) => [`${row.user_id}:${row.id}`, row]));
  const solves = new Map(initialSolves.map((row) => [`${row.user_id}:${row.id}`, row]));
  let unavailable = false;
  let failingSolveId: string | null = null;
  const check = () => {
    if (unavailable) throw new Error("offline");
  };
  const api: CloudSyncApi = {
    listSessions: async (userId) => {
      check();
      return [...sessions.values()].filter((row) => row.user_id === userId);
    },
    listSolves: async (userId) => {
      check();
      return [...solves.values()].filter((row) => row.user_id === userId);
    },
    upsertSessions: async (rows, ignoreDuplicates) => {
      check();
      for (const row of rows) {
        const key = `${row.user_id}:${row.id}`;
        if (!ignoreDuplicates || !sessions.has(key)) sessions.set(key, row);
      }
    },
    upsertSolves: async (rows, ignoreDuplicates) => {
      check();
      if (failingSolveId && rows.some((row) => row.id === failingSolveId))
        throw new Error("write failed");
      for (const row of rows) {
        const key = `${row.user_id}:${row.id}`;
        if (!ignoreDuplicates || !solves.has(key)) solves.set(key, row);
      }
    },
    softDeleteSessions: async (userId, operations) => {
      check();
      const deleted: string[] = [];
      for (const operation of operations) {
        const key = `${userId}:${operation.id}`;
        const row = sessions.get(key);
        if (!row) continue;
        if (row.deleted_at_ms !== null) {
          deleted.push(operation.id);
        } else if (row.updated_at_ms <= operation.updatedAt) {
          sessions.set(key, {
            ...row,
            updated_at_ms: operation.updatedAt,
            deleted_at_ms: operation.updatedAt,
          });
          deleted.push(operation.id);
        }
      }
      return deleted;
    },
    softDeleteSolves: async (userId, operations) => {
      check();
      const deleted: string[] = [];
      for (const operation of operations) {
        const key = `${userId}:${operation.id}`;
        const row = solves.get(key);
        if (!row) continue;
        if (row.deleted_at_ms !== null) {
          deleted.push(operation.id);
        } else if (row.updated_at_ms <= operation.updatedAt) {
          solves.set(key, {
            ...row,
            updated_at_ms: operation.updatedAt,
            deleted_at_ms: operation.updatedAt,
          });
          deleted.push(operation.id);
        }
      }
      return deleted;
    },
  };
  return {
    api,
    sessions,
    solves,
    setUnavailable: (value: boolean) => {
      unavailable = value;
    },
    setFailingSolveId: (id: string | null) => {
      failingSolveId = id;
    },
  };
}

function dataWithSolve(id: string, sessionId = "session-a", date = 100): AppData {
  const data = defaultData();
  const session = data.sessions[0];
  session.id = sessionId;
  session.created = 50;
  session.updatedAt = 50;
  session.solves = [
    {
      id,
      time: 12345,
      penalty: "+2",
      scramble: "R U R'",
      date,
      event: "333",
      updatedAt: date,
    },
  ];
  data.activeSession = { "333": sessionId };
  return data;
}

describe("account cloud synchronization", () => {
  it("persists raw solve values, penalty, scramble, event, timestamp, and session", async () => {
    const api = testApi();
    const local = dataWithSolve("solve-a");
    const result = await syncAccountData("user-a", local, [], api.api);
    expect(api.sessions.get("user-a:session-a")?.created_at_ms).toBe(50);
    expect(api.solves.get("user-a:solve-a")).toMatchObject({
      session_id: "session-a",
      time_ms: 12345,
      penalty: "+2",
      scramble: "R U R'",
      event: "333",
      recorded_at_ms: 100,
    });
    expect(result.pending).toEqual([]);
    expect(result.data.sessions[0].solves[0].id).toBe("solve-a");
  });

  it("pushes local changes in batches without downloading cloud history", async () => {
    let downloads = 0;
    const api = testApi();
    const wrappedApi: CloudSyncApi = {
      ...api.api,
      listSessions: async (userId) => {
        downloads++;
        return api.api.listSessions(userId);
      },
      listSolves: async (userId) => {
        downloads++;
        return api.api.listSolves(userId);
      },
    };
    const local = dataWithSolve("push-only");
    const result = await pushAccountChanges(
      "user-a",
      local,
      [
        { table: "session", id: "session-a", action: "insert", updatedAt: 50 },
        { table: "solve", id: "push-only", action: "insert", updatedAt: 100 },
      ],
      wrappedApi,
    );
    expect(downloads).toBe(0);
    expect(api.solves.has("user-a:push-only")).toBe(true);
    expect(result.pending).toEqual([]);
  });

  it("imports guest records using insert-only operations and never overwrites collisions", async () => {
    const existing = dataWithSolve("same-solve", "same-session", 200);
    existing.sessions[0].name = "Cloud copy";
    existing.sessions[0].solves[0].time = 20000;
    const cloud = await syncAccountData("user-a", existing, [], testApi().api);
    const api = testApi(
      [
        {
          user_id: "user-a",
          id: "same-session",
          name: "Cloud copy",
          event: "333",
          created_at_ms: 50,
          updated_at_ms: 200,
          deleted_at_ms: null,
        },
      ],
      [
        {
          user_id: "user-a",
          id: "same-solve",
          session_id: "same-session",
          event: "333",
          time_ms: 20000,
          penalty: "none",
          scramble: "cloud scramble",
          recorded_at_ms: 200,
          updated_at_ms: 200,
          deleted_at_ms: null,
        },
      ],
    );
    const imported = mergeImportedData(
      cloud.data,
      dataWithSolve("same-solve", "same-session", 100),
    );
    const withExtra = mergeImportedData(
      imported.data,
      dataWithSolve("guest-only", "guest-session", 90),
    );
    const result = await syncAccountData("user-a", withExtra.data, withExtra.operations, api.api);
    expect(api.sessions.get("user-a:same-session")?.name).toBe("Cloud copy");
    expect(api.solves.get("user-a:same-solve")?.time_ms).toBe(20000);
    expect(api.solves.has("user-a:guest-only")).toBe(true);
    expect(result.pending).toEqual([]);
  });

  it("keeps records isolated by authenticated user, including colliding local IDs", async () => {
    const api = testApi(
      [
        {
          user_id: "user-b",
          id: "session-a",
          name: "B",
          event: "333",
          created_at_ms: 1,
          updated_at_ms: 1,
          deleted_at_ms: null,
        },
      ],
      [
        {
          user_id: "user-b",
          id: "solve-a",
          session_id: "session-a",
          event: "333",
          time_ms: 999,
          penalty: "DNF",
          scramble: "",
          recorded_at_ms: 2,
          updated_at_ms: 2,
          deleted_at_ms: null,
        },
      ],
    );
    const result = await syncAccountData("user-a", dataWithSolve("solve-a"), [], api.api);
    expect(api.sessions.has("user-a:session-a")).toBe(true);
    expect(api.solves.get("user-a:solve-a")?.user_id).toBe("user-a");
    expect(
      result.data.sessions.flatMap((session) => session.solves).map((solve) => solve.time),
    ).toEqual([12345]);
    expect(result.data.sessions.some((session) => session.name === "B")).toBe(false);
  });

  it("keeps failed offline operations queued for a later retry", async () => {
    const api = testApi();
    api.setUnavailable(true);
    const local = dataWithSolve("offline-solve");
    const operations: PendingSyncOperation[] = [
      { table: "session", id: "session-a", action: "insert", updatedAt: 50 },
      { table: "solve", id: "offline-solve", action: "insert", updatedAt: 100 },
    ];
    await expect(syncAccountData("user-a", local, operations, api.api)).rejects.toThrow("offline");
    api.setUnavailable(false);
    const result = await syncAccountData("user-a", local, operations, api.api);
    expect(api.solves.has("user-a:offline-solve")).toBe(true);
    expect(result.pending).toEqual([]);
  });

  it("retries only failed batches after partial persistence", async () => {
    const data = defaultData();
    const session = data.sessions[0];
    session.id = "batch-session";
    session.solves = Array.from({ length: 101 }, (_, index) => ({
      id: index === 100 ? "failed-batch-solve" : `batch-solve-${index}`,
      time: 1000 + index,
      penalty: "none" as const,
      scramble: "",
      date: index,
      event: "333",
    }));
    const api = testApi();
    api.setFailingSolveId("failed-batch-solve");
    const partial = await syncAccountData("user-a", data, [], api.api);
    expect(api.solves.size).toBe(100);
    expect(partial.pending).toEqual([
      expect.objectContaining({ table: "solve", id: "failed-batch-solve", action: "insert" }),
    ]);
    api.setFailingSolveId(null);
    const retried = await syncAccountData("user-a", partial.data, partial.pending, api.api);
    expect(api.solves.size).toBe(101);
    expect(retried.pending).toEqual([]);
  });

  it("does not replace a newer cloud edit with an older pending local record", async () => {
    const local = dataWithSolve("solve-a", "session-a", 100);
    const api = testApi(
      [
        {
          user_id: "user-a",
          id: "session-a",
          name: "Session 1",
          event: "333",
          created_at_ms: 50,
          updated_at_ms: 300,
          deleted_at_ms: null,
        },
      ],
      [
        {
          user_id: "user-a",
          id: "solve-a",
          session_id: "session-a",
          event: "333",
          time_ms: 30000,
          penalty: "none",
          scramble: "newer",
          recorded_at_ms: 100,
          updated_at_ms: 300,
          deleted_at_ms: null,
        },
      ],
    );
    const pending: PendingSyncOperation[] = [
      { table: "session", id: "session-a", action: "upsert", updatedAt: 100 },
      { table: "solve", id: "solve-a", action: "upsert", updatedAt: 100 },
    ];
    const result = await syncAccountData("user-a", local, pending, api.api);
    expect(api.solves.get("user-a:solve-a")?.time_ms).toBe(30000);
    expect(result.data.sessions[0].solves[0].scramble).toBe("newer");
    expect(result.pending).toEqual([]);
  });

  it("synchronizes deletions as tombstones so another device cannot restore them", async () => {
    const api = testApi(
      [
        {
          user_id: "user-a",
          id: "session-a",
          name: "Session 1",
          event: "333",
          created_at_ms: 50,
          updated_at_ms: 200,
          deleted_at_ms: null,
        },
      ],
      [
        {
          user_id: "user-a",
          id: "solve-a",
          session_id: "session-a",
          event: "333",
          time_ms: 12345,
          penalty: "+2",
          scramble: "R U R'",
          recorded_at_ms: 100,
          updated_at_ms: 200,
          deleted_at_ms: null,
        },
      ],
    );
    const empty = defaultData();
    const deletion: PendingSyncOperation[] = [
      { table: "solve", id: "solve-a", action: "delete", updatedAt: 300 },
      { table: "session", id: "session-a", action: "delete", updatedAt: 300 },
    ];
    const first = await syncAccountData("user-a", empty, deletion, api.api);
    expect(api.solves.get("user-a:solve-a")?.deleted_at_ms).toBe(300);
    expect(api.sessions.get("user-a:session-a")?.deleted_at_ms).toBe(300);
    expect(first.data.sessions.some((session) => session.id === "session-a")).toBe(false);
    const otherDevice = await syncAccountData("user-a", dataWithSolve("solve-a"), [], api.api);
    expect(otherDevice.data.sessions.some((session) => session.id === "session-a")).toBe(false);
    expect(
      otherDevice.data.sessions
        .flatMap((session) => session.solves)
        .some((solve) => solve.id === "solve-a"),
    ).toBe(false);
  });

  it("pushes offline deletion tombstones without touching another account's records", async () => {
    const api = testApi(
      [
        {
          user_id: "user-b",
          id: "session-a",
          name: "B",
          event: "333",
          created_at_ms: 50,
          updated_at_ms: 200,
          deleted_at_ms: null,
        },
      ],
      [],
    );
    const result = await pushAccountChanges(
      "user-a",
      defaultData(),
      [{ table: "session", id: "session-a", action: "delete", updatedAt: 300 }],
      api.api,
    );
    expect(api.sessions.get("user-b:session-a")?.deleted_at_ms).toBeNull();
    expect(result.pending).toEqual(
      ["session-a"].map((id) => expect.objectContaining({ table: "session", id })),
    );
  });

  it("records edits and deletions as resumable account operations", () => {
    const original = dataWithSolve("solve-a");
    const edited = structuredClone(original);
    edited.sessions[0].solves[0].penalty = "DNF";
    const tracked = trackDataChanges(original, edited, 500);
    expect(tracked.data.sessions[0].solves[0].updatedAt).toBe(500);
    expect(tracked.operations).toContainEqual({
      table: "solve",
      id: "solve-a",
      action: "upsert",
      updatedAt: 500,
    });
    const deleted = trackDataChanges(tracked.data, { ...tracked.data, sessions: [] }, 600);
    expect(deleted.operations).toContainEqual({
      table: "session",
      id: "session-a",
      action: "delete",
      updatedAt: 600,
    });
    expect(deleted.operations).toContainEqual({
      table: "solve",
      id: "solve-a",
      action: "delete",
      updatedAt: 600,
    });
  });

  it("keeps guest and account caches separate when switching accounts", () => {
    localStorage.clear();
    const guest = dataWithSolve("guest-solve");
    const account = dataWithSolve("account-solve");
    saveData(guest);
    saveAccountCache("user-a", { data: account, pending: [] });
    expect(loadData().sessions[0].solves[0].id).toBe("guest-solve");
    expect(loadAccountCache("user-a").data.sessions[0].solves[0].id).toBe("account-solve");
    expect(loadAccountCache("user-b").data.sessions[0].solves).toEqual([]);
  });
});
