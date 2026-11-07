import type { AppData, PendingSyncOperation, Session } from "./storage";
import type { Solve } from "./stats";

export interface CloudSession {
  user_id: string;
  id: string;
  name: string;
  event: string;
  created_at_ms: number;
  updated_at_ms: number;
  deleted_at_ms: number | null;
}

export interface CloudSolve {
  user_id: string;
  id: string;
  session_id: string;
  event: string;
  time_ms: number;
  penalty: Solve["penalty"];
  scramble: string;
  recorded_at_ms: number;
  updated_at_ms: number;
  deleted_at_ms: number | null;
}

export interface CloudSyncApi {
  listSessions(userId: string): Promise<CloudSession[]>;
  listSolves(userId: string): Promise<CloudSolve[]>;
  upsertSessions(rows: CloudSession[], ignoreDuplicates: boolean): Promise<void>;
  upsertSolves(rows: CloudSolve[], ignoreDuplicates: boolean): Promise<void>;
  softDeleteSessions(
    userId: string,
    operations: { id: string; updatedAt: number }[],
  ): Promise<string[]>;
  softDeleteSolves(
    userId: string,
    operations: { id: string; updatedAt: number }[],
  ): Promise<string[]>;
}

export interface SyncResult {
  data: AppData;
  pending: PendingSyncOperation[];
  errors: string[];
}

const sessionTime = (session: Session) => session.updatedAt ?? session.created;
const solveTime = (solve: Solve) => solve.updatedAt ?? solve.date;
const sessionRecord = (userId: string, session: Session): CloudSession => ({
  user_id: userId,
  id: session.id,
  name: session.name,
  event: session.event,
  created_at_ms: session.created,
  updated_at_ms: sessionTime(session),
  deleted_at_ms: null,
});
const solveRecord = (userId: string, session: Session, solve: Solve): CloudSolve => ({
  user_id: userId,
  id: solve.id,
  session_id: session.id,
  event: solve.event,
  time_ms: solve.time,
  penalty: solve.penalty,
  scramble: solve.scramble,
  recorded_at_ms: solve.date,
  updated_at_ms: solveTime(solve),
  deleted_at_ms: null,
});

export function compactOperations(operations: PendingSyncOperation[]): PendingSyncOperation[] {
  const latest = new Map<string, PendingSyncOperation>();
  for (const operation of operations) {
    latest.set(`${operation.table}:${operation.id}`, operation);
  }
  return [...latest.values()];
}

function operationFor(
  operations: PendingSyncOperation[],
  table: PendingSyncOperation["table"],
  id: string,
) {
  return operations.find((operation) => operation.table === table && operation.id === id);
}

function mergeData(
  local: AppData,
  sessions: CloudSession[],
  solves: CloudSolve[],
  pending: PendingSyncOperation[],
  deletedSessions = new Set<string>(),
  deletedSolves = new Set<string>(),
  preferCloudSessions = new Set<string>(),
  preferCloudSolves = new Set<string>(),
): AppData {
  const localSessions = new Map(local.sessions.map((session) => [session.id, session]));
  const cloudSessionRows = new Map(sessions.map((session) => [session.id, session]));
  const cloudSessions = new Map(
    sessions
      .filter((session) => session.deleted_at_ms === null)
      .map((session) => [session.id, session]),
  );
  const cloudSolves = new Map(solves.map((solve) => [solve.id, solve]));
  const ids = new Set([...localSessions.keys(), ...cloudSessionRows.keys()]);
  const merged: Session[] = [];
  for (const id of ids) {
    const localSession = localSessions.get(id);
    const cloudSession = cloudSessions.get(id);
    const cloudSessionRow = cloudSessionRows.get(id);
    const sessionOp = operationFor(pending, "session", id);
    if (deletedSessions.has(id) || sessionOp?.action === "delete") continue;
    const reviveSession =
      localSession &&
      cloudSessionRow?.deleted_at_ms !== null &&
      cloudSessionRow !== undefined &&
      sessionTime(localSession) > cloudSessionRow.updated_at_ms &&
      sessionOp?.action !== "insert";
    if (cloudSessionRow && cloudSessionRow.deleted_at_ms !== null && !reviveSession) continue;
    const useLocalSession =
      localSession &&
      (!cloudSession ||
        reviveSession ||
        (!preferCloudSessions.has(id) &&
          sessionOp?.action !== "insert" &&
          sessionTime(localSession) > cloudSession.updated_at_ms));
    const base: Session | null = useLocalSession
      ? localSession
      : cloudSession
        ? {
            id: cloudSession.id,
            name: cloudSession.name,
            event: cloudSession.event,
            created: cloudSession.created_at_ms,
            updatedAt: cloudSession.updated_at_ms,
            solves: [],
          }
        : (localSession ?? null);
    if (!base) continue;

    const localSolves = new Map((localSession?.solves ?? []).map((solve) => [solve.id, solve]));
    const remoteSolves = new Map<string, Solve>();
    for (const row of cloudSolves.values()) {
      if (row.session_id !== id || row.deleted_at_ms !== null) continue;
      remoteSolves.set(row.id, {
        id: row.id,
        time: row.time_ms,
        penalty: row.penalty,
        scramble: row.scramble,
        date: row.recorded_at_ms,
        event: row.event,
        updatedAt: row.updated_at_ms,
      });
    }
    const solveIds = new Set([...localSolves.keys(), ...remoteSolves.keys()]);
    for (const row of cloudSolves.values()) if (row.session_id === id) solveIds.add(row.id);
    const mergedSolves: Solve[] = [];
    for (const solveId of solveIds) {
      const localSolve = localSolves.get(solveId);
      const remoteSolve = remoteSolves.get(solveId);
      const remoteSolveRow = cloudSolves.get(solveId);
      const solveOp = operationFor(pending, "solve", solveId);
      if (deletedSolves.has(solveId) || solveOp?.action === "delete") continue;
      const reviveSolve =
        localSolve &&
        remoteSolveRow?.deleted_at_ms !== null &&
        remoteSolveRow !== undefined &&
        solveTime(localSolve) > remoteSolveRow.updated_at_ms &&
        solveOp?.action !== "insert";
      if (remoteSolveRow && remoteSolveRow.deleted_at_ms !== null && !reviveSolve) continue;
      if (
        localSolve &&
        (!remoteSolve ||
          reviveSolve ||
          (!preferCloudSolves.has(solveId) &&
            solveOp?.action !== "insert" &&
            solveTime(localSolve) > solveTime(remoteSolve)))
      ) {
        mergedSolves.push(localSolve);
      } else if (remoteSolve) {
        mergedSolves.push(remoteSolve);
      } else if (localSolve) {
        mergedSolves.push(localSolve);
      }
    }
    mergedSolves.sort((a, b) => a.date - b.date || a.id.localeCompare(b.id));
    merged.push({ ...base, solves: mergedSolves });
  }
  merged.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
  const activeSession: Record<string, string> = {};
  for (const session of merged) activeSession[session.event] ??= session.id;
  for (const [event, id] of Object.entries(local.activeSession)) {
    if (merged.some((session) => session.id === id && session.event === event))
      activeSession[event] = id;
  }
  const event = merged.some((session) => session.event === local.event)
    ? local.event
    : (merged[0]?.event ?? local.event);
  return { ...local, event, activeSession, sessions: merged };
}

function addMissingLocalRows(
  local: AppData,
  sessions: CloudSession[],
  solves: CloudSolve[],
  pending: PendingSyncOperation[],
): PendingSyncOperation[] {
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const solveById = new Map(solves.map((solve) => [solve.id, solve]));
  const next = [...pending];
  for (const session of local.sessions) {
    const remoteSession = sessionById.get(session.id);
    const operation = operationFor(pending, "session", session.id);
    if (!remoteSession) {
      if (!operation)
        next.push({
          table: "session",
          id: session.id,
          action: "insert",
          updatedAt: sessionTime(session),
        });
    } else if (!operation && sessionTime(session) > remoteSession.updated_at_ms) {
      next.push({
        table: "session",
        id: session.id,
        action: "upsert",
        updatedAt: sessionTime(session),
      });
    }
    for (const solve of session.solves) {
      const remoteSolve = solveById.get(solve.id);
      const solveOperation = operationFor(pending, "solve", solve.id);
      if (!remoteSolve) {
        if (!solveOperation)
          next.push({
            table: "solve",
            id: solve.id,
            action: "insert",
            updatedAt: solveTime(solve),
          });
      } else if (!solveOperation && solveTime(solve) > remoteSolve.updated_at_ms) {
        next.push({ table: "solve", id: solve.id, action: "upsert", updatedAt: solveTime(solve) });
      }
    }
  }
  return compactOperations(next);
}

export function trackDataChanges(
  previous: AppData,
  next: AppData,
  now = Date.now(),
): { data: AppData; operations: PendingSyncOperation[] } {
  const oldSessions = new Map(previous.sessions.map((session) => [session.id, session]));
  const newSessions = new Map(next.sessions.map((session) => [session.id, session]));
  const oldSolves = new Map(
    previous.sessions.flatMap((session) =>
      session.solves.map((solve) => [solve.id, { sessionId: session.id, solve }] as const),
    ),
  );
  const newSolves = new Map(
    next.sessions.flatMap((session) =>
      session.solves.map((solve) => [solve.id, { sessionId: session.id, solve }] as const),
    ),
  );
  const operations: PendingSyncOperation[] = [];
  const sessions = next.sessions
    .map((session) => {
      const old = oldSessions.get(session.id);
      if (
        !old ||
        old.name !== session.name ||
        old.event !== session.event ||
        old.created !== session.created
      ) {
        const updatedAt = Math.max(now, (old?.updatedAt ?? old?.created ?? 0) + 1);
        const updated = { ...session, updatedAt };
        operations.push({ table: "session", id: session.id, action: "upsert", updatedAt });
        return updated;
      }
      return session;
    })
    .map((session) => ({
      ...session,
      solves: session.solves.map((solve) => {
        const oldRecord = oldSolves.get(solve.id);
        const old = oldRecord?.solve;
        if (
          !old ||
          oldRecord?.sessionId !== session.id ||
          old.time !== solve.time ||
          old.penalty !== solve.penalty ||
          old.scramble !== solve.scramble ||
          old.date !== solve.date ||
          old.event !== solve.event
        ) {
          const updatedAt = Math.max(now, (old?.updatedAt ?? old?.date ?? 0) + 1);
          const updated = { ...solve, updatedAt };
          operations.push({ table: "solve", id: solve.id, action: "upsert", updatedAt });
          return updated;
        }
        return solve;
      }),
    }));
  for (const session of previous.sessions) {
    if (!newSessions.has(session.id)) {
      operations.push({
        table: "session",
        id: session.id,
        action: "delete",
        updatedAt: Math.max(now, sessionTime(session) + 1),
      });
    }
  }
  for (const [id, record] of oldSolves) {
    if (!newSolves.has(id)) {
      operations.push({
        table: "solve",
        id,
        action: "delete",
        updatedAt: Math.max(now, solveTime(record.solve) + 1),
      });
    }
  }
  return { data: { ...next, sessions }, operations: compactOperations(operations) };
}

export function mergeImportedData(
  accountData: AppData,
  guestData: AppData,
): {
  data: AppData;
  operations: PendingSyncOperation[];
} {
  const sessions = accountData.sessions.map((session) => ({
    ...session,
    solves: [...session.solves],
  }));
  const knownSessions = new Map(sessions.map((session) => [session.id, session]));
  const operations: PendingSyncOperation[] = [];
  for (const guestSession of guestData.sessions) {
    const existing = knownSessions.get(guestSession.id);
    if (!existing) {
      const imported = { ...guestSession, solves: [...guestSession.solves] };
      sessions.push(imported);
      knownSessions.set(imported.id, imported);
      operations.push({
        table: "session",
        id: imported.id,
        action: "insert",
        updatedAt: sessionTime(imported),
      });
      for (const solve of imported.solves) {
        operations.push({
          table: "solve",
          id: solve.id,
          action: "insert",
          updatedAt: solveTime(solve),
        });
      }
      continue;
    }
    const knownSolves = new Set(existing.solves.map((solve) => solve.id));
    for (const solve of guestSession.solves) {
      if (knownSolves.has(solve.id)) continue;
      existing.solves.push(solve);
      knownSolves.add(solve.id);
      operations.push({
        table: "solve",
        id: solve.id,
        action: "insert",
        updatedAt: solveTime(solve),
      });
    }
    existing.solves.sort((a, b) => a.date - b.date || a.id.localeCompare(b.id));
  }
  return { data: { ...accountData, sessions }, operations: compactOperations(operations) };
}

export async function pushAccountChanges(
  userId: string,
  local: AppData,
  operations: PendingSyncOperation[],
  api: CloudSyncApi,
): Promise<{ pending: PendingSyncOperation[]; errors: string[] }> {
  const pending = compactOperations(operations);
  const sessions = new Map(local.sessions.map((session) => [session.id, session]));
  const solves = new Map(
    local.sessions.flatMap((session) =>
      session.solves.map((solve) => [solve.id, { session, solve }] as const),
    ),
  );
  const queueKey = (operation: PendingSyncOperation) => `${operation.table}:${operation.id}`;
  const failed = new Set<string>();
  const errors: string[] = [];
  const batchSize = 100;
  for (const action of ["insert", "upsert"] as const) {
    const writes = pending
      .filter((operation) => operation.action === action && operation.table === "session")
      .flatMap((operation) => {
        const session = sessions.get(operation.id);
        return session ? [{ operation, row: sessionRecord(userId, session) }] : [];
      });
    for (let offset = 0; offset < writes.length; offset += batchSize) {
      const batch = writes.slice(offset, offset + batchSize);
      try {
        await api.upsertSessions(
          batch.map((item) => item.row),
          action === "insert",
        );
      } catch (error) {
        batch.forEach((item) => failed.add(queueKey(item.operation)));
        errors.push(error instanceof Error ? error.message : "Session synchronization failed.");
      }
    }
  }
  for (const action of ["insert", "upsert"] as const) {
    const writes = pending
      .filter((operation) => operation.action === action && operation.table === "solve")
      .flatMap((operation) => {
        const value = solves.get(operation.id);
        return value ? [{ operation, row: solveRecord(userId, value.session, value.solve) }] : [];
      });
    for (let offset = 0; offset < writes.length; offset += batchSize) {
      const batch = writes.slice(offset, offset + batchSize);
      try {
        await api.upsertSolves(
          batch.map((item) => item.row),
          action === "insert",
        );
      } catch (error) {
        batch.forEach((item) => failed.add(queueKey(item.operation)));
        errors.push(error instanceof Error ? error.message : "Solve synchronization failed.");
      }
    }
  }
  for (const table of ["solve", "session"] as const) {
    const deletes = pending.filter(
      (operation) => operation.action === "delete" && operation.table === table,
    );
    for (let offset = 0; offset < deletes.length; offset += batchSize) {
      const batch = deletes.slice(offset, offset + batchSize);
      try {
        const deletedIds = new Set(
          table === "solve"
            ? await api.softDeleteSolves(
                userId,
                batch.map(({ id, updatedAt }) => ({ id, updatedAt })),
              )
            : await api.softDeleteSessions(
                userId,
                batch.map(({ id, updatedAt }) => ({ id, updatedAt })),
              ),
        );
        for (const operation of batch) {
          if (!deletedIds.has(operation.id)) failed.add(queueKey(operation));
        }
      } catch (error) {
        batch.forEach((operation) => failed.add(queueKey(operation)));
        errors.push(
          error instanceof Error ? error.message : `${table} deletion synchronization failed.`,
        );
      }
    }
  }
  return {
    pending: pending.filter((operation) => failed.has(queueKey(operation))),
    errors,
  };
}

export async function syncAccountData(
  userId: string,
  local: AppData,
  operations: PendingSyncOperation[],
  api: CloudSyncApi,
): Promise<SyncResult> {
  const [cloudSessions, cloudSolves] = await Promise.all([
    api.listSessions(userId),
    api.listSolves(userId),
  ]);
  const ownSessions = cloudSessions.filter((row) => row.user_id === userId);
  const ownSolves = cloudSolves.filter((row) => row.user_id === userId);
  let pending = addMissingLocalRows(local, ownSessions, ownSolves, compactOperations(operations));
  const sessionMap = new Map(local.sessions.map((session) => [session.id, session]));
  const solveMap = new Map(
    local.sessions.flatMap((session) =>
      session.solves.map((solve) => [solve.id, { session, solve }] as const),
    ),
  );
  const remoteSessions = new Map(ownSessions.map((session) => [session.id, session]));
  const remoteSolves = new Map(ownSolves.map((solve) => [solve.id, solve]));
  const successfulDeletes = { session: new Set<string>(), solve: new Set<string>() };
  const preferCloud = { session: new Set<string>(), solve: new Set<string>() };
  const errors: string[] = [];
  const failed = new Set<string>();

  const queueKey = (operation: PendingSyncOperation) => `${operation.table}:${operation.id}`;
  const sessionWrites: { operation: PendingSyncOperation; row: CloudSession }[] = [];
  const solveWrites: { operation: PendingSyncOperation; row: CloudSolve }[] = [];
  const sessionDeletes: { operation: PendingSyncOperation; row: CloudSession }[] = [];
  const solveDeletes: { operation: PendingSyncOperation; row: CloudSolve }[] = [];

  for (const operation of pending) {
    if (operation.action === "delete") {
      if (operation.table === "session") {
        const remote = remoteSessions.get(operation.id);
        if (!remote || remote.deleted_at_ms !== null) {
          if (remote) successfulDeletes.session.add(operation.id);
          continue;
        }
        if (remote.updated_at_ms > operation.updatedAt) continue;
        sessionDeletes.push({
          operation,
          row: {
            ...remote,
            updated_at_ms: operation.updatedAt,
            deleted_at_ms: operation.updatedAt,
          },
        });
      } else {
        const remote = remoteSolves.get(operation.id);
        if (!remote || remote.deleted_at_ms !== null) {
          if (remote) successfulDeletes.solve.add(operation.id);
          continue;
        }
        if (remote.updated_at_ms > operation.updatedAt) continue;
        solveDeletes.push({
          operation,
          row: {
            ...remote,
            updated_at_ms: operation.updatedAt,
            deleted_at_ms: operation.updatedAt,
          },
        });
      }
      continue;
    }
    if (operation.table === "session") {
      const session = sessionMap.get(operation.id);
      if (!session) continue;
      const remote = remoteSessions.get(operation.id);
      if (operation.action === "insert" && remote) {
        preferCloud.session.add(operation.id);
        continue;
      }
      if (operation.action === "upsert" && remote && remote.updated_at_ms > operation.updatedAt)
        continue;
      sessionWrites.push({ operation, row: sessionRecord(userId, session) });
    } else {
      const record = solveMap.get(operation.id);
      if (!record) continue;
      const remote = remoteSolves.get(operation.id);
      if (operation.action === "insert" && remote) {
        preferCloud.solve.add(operation.id);
        continue;
      }
      if (operation.action === "upsert" && remote && remote.updated_at_ms > operation.updatedAt)
        continue;
      solveWrites.push({ operation, row: solveRecord(userId, record.session, record.solve) });
    }
  }

  const batchSize = 100;
  for (const action of ["insert", "upsert"] as const) {
    const writes = sessionWrites.filter((item) => item.operation.action === action);
    for (let offset = 0; offset < writes.length; offset += batchSize) {
      const batch = writes.slice(offset, offset + batchSize);
      try {
        await api.upsertSessions(
          batch.map((item) => item.row),
          action === "insert",
        );
      } catch (error) {
        for (const item of batch) failed.add(queueKey(item.operation));
        errors.push(error instanceof Error ? error.message : "Session synchronization failed.");
      }
    }
  }
  for (const action of ["insert", "upsert"] as const) {
    const writes = solveWrites.filter((item) => item.operation.action === action);
    for (let offset = 0; offset < writes.length; offset += batchSize) {
      const batch = writes.slice(offset, offset + batchSize);
      try {
        await api.upsertSolves(
          batch.map((item) => item.row),
          action === "insert",
        );
      } catch (error) {
        for (const item of batch) failed.add(queueKey(item.operation));
        errors.push(error instanceof Error ? error.message : "Solve synchronization failed.");
      }
    }
  }
  for (let offset = 0; offset < solveDeletes.length; offset += batchSize) {
    const batch = solveDeletes.slice(offset, offset + batchSize);
    try {
      await api.upsertSolves(
        batch.map((item) => item.row),
        false,
      );
      batch.forEach((item) => successfulDeletes.solve.add(item.operation.id));
    } catch (error) {
      batch.forEach((item) => failed.add(queueKey(item.operation)));
      errors.push(
        error instanceof Error ? error.message : "Solve deletion synchronization failed.",
      );
    }
  }
  for (let offset = 0; offset < sessionDeletes.length; offset += batchSize) {
    const batch = sessionDeletes.slice(offset, offset + batchSize);
    try {
      await api.upsertSessions(
        batch.map((item) => item.row),
        false,
      );
      batch.forEach((item) => successfulDeletes.session.add(item.operation.id));
    } catch (error) {
      batch.forEach((item) => failed.add(queueKey(item.operation)));
      errors.push(
        error instanceof Error ? error.message : "Session deletion synchronization failed.",
      );
    }
  }

  pending = pending.filter((operation) => failed.has(queueKey(operation)));
  const hiddenSessions = new Set([
    ...successfulDeletes.session,
    ...pending
      .filter((operation) => operation.table === "session" && operation.action === "delete")
      .map((operation) => operation.id),
  ]);
  const hiddenSolves = new Set([
    ...successfulDeletes.solve,
    ...pending
      .filter((operation) => operation.table === "solve" && operation.action === "delete")
      .map((operation) => operation.id),
  ]);
  return {
    data: mergeData(
      local,
      ownSessions,
      ownSolves,
      pending,
      hiddenSessions,
      hiddenSolves,
      preferCloud.session,
      preferCloud.solve,
    ),
    pending,
    errors,
  };
}
