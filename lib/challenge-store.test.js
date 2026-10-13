import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { randomBytes, createHash } from "node:crypto";
import { challengeRequest } from "./challenge-store.js";
import { databaseOptions } from "./race-store.js";
import { isFree } from "../paths.js";
test(
  "ranked database integration: ownership, verified scores, retries, own rank and categories",
  { skip: !process.env.ARROW_TEST_DATABASE_URL },
  async () => {
    const database = new pg.Pool(
      databaseOptions({
        ...process.env,
        DATABASE_URL: process.env.ARROW_TEST_DATABASE_URL,
      }),
    );
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
        const path = state.paths.find((p) =>
          isFree(p, state.paths, state.size),
        );
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
  },
);
