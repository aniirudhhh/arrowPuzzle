import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { databaseRaceAction, storageFailure } from "./race-store.js";
import { applyRaceAction } from "./race.js";
import { isFree } from "../paths.js";

test("isolated server requests share no process-local room state", () => {
  const first = new Map();
  const host = applyRaceAction({ action: "create", name: "Host" }, 1000, first);
  const otherServer = new Map(structuredClone([...first]));
  const guest = applyRaceAction(
    { action: "join", name: "Guest", code: host.room.code },
    1100,
    otherServer,
  );
  assert.deepEqual(guest.room.paths, host.room.paths);
  assert.equal(first.get(host.room.code).players.length, 1);
  assert.equal(otherServer.get(host.room.code).players.length, 2);
});

test("invalid room rolls back and releases its database connection", async () => {
  const queries = [];
  let released = false;
  const database = {
    connect: async () => ({
      query: async (sql) => {
        queries.push(sql);
        return { rows: [] };
      },
      release: () => {
        released = true;
      },
    }),
  };
  await assert.rejects(
    databaseRaceAction(
      { action: "poll", code: "ABC123", token: "missing" },
      database,
    ),
    { code: "ROOM_NOT_FOUND" },
  );
  assert.ok(queries.includes("ROLLBACK"));
  assert.ok(!queries.includes("COMMIT"));
  assert.equal(released, true);
});

test(
  "Supabase shared rooms serialize concurrent moves and mutual rematches",
  { skip: !process.env.ARROW_TEST_DATABASE_URL },
  async () => {
    const database = new pg.Pool({
      connectionString: process.env.ARROW_TEST_DATABASE_URL,
      max: 4,
    });
    let code;
    try {
      const a = await databaseRaceAction(
        { action: "create", name: "Integration Host" },
        database,
      );
      code = a.room.code;
      const host = { code, token: a.token };
      const b = await databaseRaceAction(
        { action: "join", code, name: "Integration Guest" },
        database,
      );
      const guest = { code, token: b.token };
      await databaseRaceAction({ action: "ready", ...guest }, database);
      const start = await databaseRaceAction(
        { action: "start", ...host },
        database,
      );
      const now = start.room.startAt + 100;
      const path = start.room.paths.find((p) =>
        isFree(p, start.room.paths, start.room.size),
      );
      await Promise.all([
        databaseRaceAction(
          { action: "move", ...host, id: path.id },
          database,
          now,
        ),
        databaseRaceAction(
          { action: "move", ...guest, id: path.id },
          database,
          now,
        ),
      ]);
      let state = (
        await databaseRaceAction({ action: "poll", ...host }, database, now)
      ).room;
      assert.ok(state.players.every((p) => p.escaped === 1));
      while (state.paths.length) {
        const free = state.paths.find((p) =>
          isFree(p, state.paths, state.size),
        );
        assert.ok(free);
        state = (
          await databaseRaceAction(
            { action: "move", ...host, id: free.id },
            database,
            now,
          )
        ).room;
      }
      await databaseRaceAction({ action: "rematch", ...host }, database, now);
      const request = await databaseRaceAction(
        { action: "poll", ...guest },
        database,
        now,
      );
      assert.equal(request.room.players.find((p) => !p.you).rematch, true);
      const accepted = await databaseRaceAction(
        { action: "accept-rematch", ...guest },
        database,
        now,
      );
      assert.equal(accepted.room.round, 2);
      assert.equal(accepted.room.phase, "lobby");
      assert.ok(
        accepted.room.players.every((p) => p.hearts === 3 && p.escaped === 0),
      );
    } finally {
      if (code)
        await database.query("DELETE FROM public.arrow_rooms WHERE code = $1", [
          code,
        ]);
      await database.end();
    }
  },
);

test("storage diagnostics identify setup failures without exposing secrets", () => {
  for (const [code, reason] of [
    ["42P01", "SCHEMA_MISSING"],
    ["28P01", "AUTH_FAILED"],
    ["SELF_SIGNED_CERT_IN_CHAIN", "TLS_FAILED"],
    ["ENOTFOUND", "HOST_NOT_FOUND"],
    [undefined, "CONNECTION_FAILED"],
  ]) {
    const failure = storageFailure({
      code,
      message: "postgresql://private-password@secret-host",
    });
    assert.equal(failure.reason, reason);
    assert.equal(failure.code, "STORAGE_UNAVAILABLE");
    assert.ok(!failure.message.includes("private-password"));
    assert.ok(!failure.message.includes("secret-host"));
  }
});
