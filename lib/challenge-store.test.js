import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { randomBytes, createHash } from "node:crypto";
import { challengeRequest } from "./challenge-store.js";
import { databaseOptions } from "./race-store.js";
import { isFree } from "../paths.js";
async function embeddedDatabase() {
  const db = await PGlite.create();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  const query = async (sql, params) =>
    params ? db.query(sql, params) : (await db.exec(sql)).at(-1);
  return {
    query,
    connect: async () => ({ query, release() {} }),
    end: () => db.close(),
  };
}
test("ranked database integration: ownership, verified scores, retries, own rank and categories", async () => {
  const database = process.env.ARROW_TEST_DATABASE_URL
    ? new pg.Pool(
        databaseOptions({
          ...process.env,
          DATABASE_URL: process.env.ARROW_TEST_DATABASE_URL,
        }),
      )
    : await embeddedDatabase();
  const token = randomBytes(32).toString("hex"),
    other = randomBytes(32).toString("hex");
  let id;
  try {
    await database.query(
      readFileSync(
        new URL("../supabase/leaderboard.sql", import.meta.url),
        "utf8",
      ),
    );
    const created = await challengeRequest(
      { action: "start", challenge: 1, nickname: "Integration player" },
      token,
      database,
      Date.now(),
    );
    id = created.attempt.id;
    let state = created.attempt,
      now = state.startAt + 100;
    await assert.rejects(
      challengeRequest(
        { action: "events", id, events: [{ sequence: 1, type: "hint" }] },
        other,
        database,
        now,
      ),
    );
    state = (
      await challengeRequest(
        { action: "events", id, events: [{ sequence: 1, type: "hint" }] },
        token,
        database,
        now,
      )
    ).attempt;
    let last;
    while (state.paths.length) {
      const path = state.paths.find((p) => isFree(p, state.paths, state.size));
      last = { sequence: state.sequence + 1, type: "move", id: path.id };
      state = (
        await challengeRequest(
          { action: "events", id, events: [last] },
          token,
          database,
          (now += 100),
        )
      ).attempt;
    }
    await challengeRequest(
      { action: "events", id, events: [last] },
      token,
      database,
      now + 10,
    );
    const board = await challengeRequest(
      { action: "board", challenge: 1, category: "with-hints" },
      token,
      database,
      now,
    );
    const own = board.entries.find((p) => p.you);
    assert.ok(own);
    assert.equal(own.duration_ms, state.durationMs);
    assert.equal(own.hints, 1);
    const clean = await challengeRequest(
      { action: "board", challenge: 1, category: "unassisted" },
      token,
      database,
      now,
    );
    assert.ok(!clean.entries.some((p) => p.you));
  } finally {
    if (id) {
      await database.query(
        "DELETE FROM public.arrow_scores WHERE attempt_id=$1",
        [id],
      );
      await database.query("DELETE FROM public.arrow_attempts WHERE id=$1", [
        id,
      ]);
    }
    await database.query(
      "DELETE FROM public.arrow_players WHERE token_hash=$1",
      [createHash("sha256").update(token).digest("hex")],
    );
    await database.end();
  }
});

test("leaderboard retains best scores, isolates rules, and returns top ten plus own rank", async () => {
  const database = await embeddedDatabase();
  try {
    await database.query(
      readFileSync(
        new URL("../supabase/leaderboard.sql", import.meta.url),
        "utf8",
      ),
    );
    async function finish(token, duration, pause = false) {
      const started = await challengeRequest(
        { action: "start", challenge: 1, nickname: "Test player" },
        token,
        database,
      );
      let state = started.attempt;
      const events = [];
      if (pause) events.push({ sequence: 1, type: "pause" });
      let paths = state.paths;
      while (paths.length) {
        const arrow = paths.find((p) => isFree(p, paths, state.size));
        assert.ok(arrow);
        events.push({
          sequence: events.length + 1,
          type: "move",
          id: arrow.id,
        });
        paths = paths.filter((p) => p.id !== arrow.id);
      }
      for (let offset = 0; offset < events.length; offset += 32) {
        state = (
          await challengeRequest(
            {
              action: "events",
              id: state.id,
              events: events.slice(offset, offset + 32),
            },
            token,
            database,
            state.startAt + duration,
          )
        ).attempt;
      }
      assert.equal(state.status, "completed");
      return state;
    }
    const token = randomBytes(32).toString("hex");
    await finish(token, 8000);
    await finish(token, 9000);
    const ownBoard = () =>
      challengeRequest({ action: "board", challenge: 1 }, token, database);
    assert.equal(
      (await ownBoard()).entries.find((p) => p.you).duration_ms,
      8000,
    );
    await finish(token, 7000);
    assert.equal(
      (await ownBoard()).entries.find((p) => p.you).duration_ms,
      7000,
    );
    await finish(token, 1000, true);
    assert.equal(
      (await ownBoard()).entries.find((p) => p.you).duration_ms,
      7000,
    );
    for (let i = 0; i < 11; i++)
      await finish(randomBytes(32).toString("hex"), 2000 + i * 100);
    const board = await ownBoard();
    assert.equal(board.entries.length, 11);
    assert.equal(board.entries.filter((p) => p.position <= 10).length, 10);
    assert.equal(board.entries.find((p) => p.you).rank, 12);
    const hash = createHash("sha256").update(token).digest("hex");
    await database.query(
      "UPDATE public.arrow_scores SET version=version+1 WHERE player_id=(SELECT id FROM public.arrow_players WHERE token_hash=$1)",
      [hash],
    );
    assert.ok(!(await ownBoard()).entries.some((p) => p.you));
    assert.equal((await ownBoard()).entries.length, 10);
    const constraints = await database.query(
      "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('arrow_players','arrow_attempts','arrow_scores')",
    );
    assert.equal(constraints.rows.length, 3);
    assert.ok(constraints.rows.every((row) => row.relrowsecurity));
  } finally {
    await database.end();
  }
});
