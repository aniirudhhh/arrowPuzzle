import test from "node:test";
import assert from "node:assert/strict";
import {
  newAttempt,
  applyAttemptEvents,
  AttemptError,
} from "./challenge-attempt.js";
import { isFree, CHALLENGE_VERSION } from "../paths.js";
test("server validates move order, hearts, assistance and elapsed time", () => {
  let state = newAttempt(1, 1000),
    now = state.startAt + 100;
  assert.equal(state.version, CHALLENGE_VERSION);
  assert.throws(
    () => applyAttemptEvents(state, [{ sequence: 2, type: "hint" }], now),
    AttemptError,
  );
  assert.throws(
    () =>
      applyAttemptEvents(state, [{ sequence: 1, type: "move", id: -1 }], now),
    AttemptError,
  );
  assert.throws(
    () =>
      applyAttemptEvents(
        state,
        [{ sequence: 1, type: "hint" }],
        state.startAt - 1,
      ),
    AttemptError,
  );
  const hint = { sequence: 1, type: "hint" };
  state = applyAttemptEvents(state, [hint], now);
  assert.equal(state.hints, 1);
  assert.deepEqual(applyAttemptEvents(state, [hint], now + 50), state);
  while (state.paths.length) {
    const path = state.paths.find((p) => isFree(p, state.paths, state.size));
    assert.ok(path);
    state = applyAttemptEvents(
      state,
      [{ sequence: state.sequence + 1, type: "move", id: path.id }],
      (now += 100),
    );
  }
  assert.equal(state.status, "completed");
  assert.equal(state.hearts, 3);
  assert.equal(state.durationMs, now - state.startAt);
  assert.equal(state.eligible, true);
  assert.throws(
    () =>
      applyAttemptEvents(
        state,
        [{ sequence: state.sequence + 1, type: "hint" }],
        now,
      ),
    AttemptError,
  );
});
test("pause, timeout and elimination cannot produce ranked scores", () => {
  const fresh = newAttempt(3, 1000),
    now = fresh.startAt + 100;
  const paused = applyAttemptEvents(
    fresh,
    [{ sequence: 1, type: "pause" }],
    now,
  );
  assert.equal(paused.eligible, false);
  const expired = applyAttemptEvents(
    fresh,
    [{ sequence: 1, type: "hint" }],
    fresh.startAt + fresh.timeLimit * 1000,
  );
  assert.equal(expired.status, "expired");
  assert.equal(expired.eligible, false);
  const blocked = fresh.paths.find((p) => !isFree(p, fresh.paths, fresh.size));
  assert.ok(blocked);
  const lost = applyAttemptEvents(
    fresh,
    [1, 2, 3].map((sequence) => ({ sequence, type: "move", id: blocked.id })),
    now,
  );
  assert.equal(lost.hearts, 0);
  assert.equal(lost.status, "lost");
  assert.equal(fresh.hearts, 3);
});
