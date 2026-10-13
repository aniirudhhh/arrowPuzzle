import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { rootCertificates } from "node:tls";
import {
  databaseRaceAction,
  storageFailure,
  databaseOptions,
} from "./race-store.js";
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

test("custom CA verifies certificates and cannot be overridden by URI SSL flags", () => {
  const options = databaseOptions({
    DATABASE_URL:
      "postgresql://user:password@example.com:6543/postgres?sslmode=require&sslrootcert=wrong&application_name=arrow",
    DATABASE_CA_CERT: rootCertificates[0].replace(/\n/g, "\\n"),
  });
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.ok(options.ssl.ca.includes(rootCertificates[0]));
  assert.ok(options.ssl.ca.length > rootCertificates.length);
  const url = new URL(options.connectionString);
  assert.equal(url.searchParams.has("sslmode"), false);
  assert.equal(url.searchParams.has("sslrootcert"), false);
  assert.equal(url.searchParams.get("application_name"), "arrow");
  assert.equal(
    databaseOptions({ DATABASE_URL: "postgresql://localhost/postgres" }).ssl,
    undefined,
  );
});

test("invalid certificate values are diagnosed before attempting a connection", () => {
  for (const ca of [
    "prod-supabase.crt",
    "-----BEGIN CERTIFICATE-----invalid-----END CERTIFICATE-----",
  ]) {
    assert.throws(
      () =>
        databaseOptions({
          DATABASE_URL: "postgresql://localhost/postgres",
          DATABASE_CA_CERT: ca,
        }),
      { code: "INVALID_CA_CERT" },
    );
  }
});

test("single-line base64 certificate is accepted without multiline formatting", () => {
  const options = databaseOptions({
    DATABASE_URL: "postgresql://localhost/postgres?sslmode=require",
    DATABASE_CA_CERT_BASE64: Buffer.from(rootCertificates[0]).toString(
      "base64",
    ),
    DATABASE_CA_CERT: "incorrect older value",
  });
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.ok(options.ssl.ca.includes(rootCertificates[0]));
});
