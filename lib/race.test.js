import test from "node:test";
import assert from "node:assert/strict";
import { raceAction } from "./local-race.js";
import { applyRaceRequest } from "./race.js";
import { isFree } from "../paths.js";
test("two-player ready countdown, validated moves, elimination, winner and rematch", () => {
  const a = raceAction({ action: "create", name: "Alice" }, 1000),
    code = a.room.code;
  const b = raceAction({ action: "join", name: "Bob", code }, 1000);
  assert.deepEqual(a.room.paths, b.room.paths);
  assert.throws(() =>
    raceAction({ action: "join", name: "Third", code }, 1000),
  );
  const alice = { code, token: a.token },
    bob = { code, token: b.token };
  assert.throws(() => raceAction({ action: "start", ...bob }, 1100));
  assert.throws(() => raceAction({ action: "start", ...alice }, 1100));
  raceAction({ action: "ready", ...bob }, 1150);
  const ready = raceAction({ action: "start", ...alice }, 1200);
  assert.equal(ready.room.startAt, 4200);
  assert.throws(() => raceAction({ action: "move", ...alice, id: 0 }, 2000));
  let state = raceAction({ action: "poll", ...alice }, 4300).room;
  const blocked = state.paths.find((p) => !isFree(p, state.paths, state.size));
  assert.ok(blocked);
  for (let i = 0; i < 3; i++)
    state = raceAction(
      { action: "move", ...alice, id: blocked.id },
      4400 + i,
    ).room;
  assert.equal(state.players.find((p) => p.you).hearts, 0);
  assert.throws(() =>
    raceAction({ action: "move", ...alice, id: blocked.id }, 4500),
  );
  state = raceAction({ action: "poll", ...bob }, 4600).room;
  let now = 5000;
  while (state.paths.length) {
    const p = state.paths.find((p) => isFree(p, state.paths, state.size));
    assert.ok(p);
    state = raceAction({ action: "move", ...bob, id: p.id }, (now += 700)).room;
  }
  assert.equal(state.phase, "finished");
  assert.equal(state.youWon, true);
  raceAction({ action: "rematch", ...alice }, now + 100);
  state = raceAction({ action: "accept-rematch", ...bob }, now + 200).room;
  assert.equal(state.phase, "lobby");
  assert.equal(state.round, 2);
  assert.ok(state.players.every((p) => p.hearts === 3));
});

test("host selects difficulty, resets readiness and shares the same board", () => {
  const a = raceAction({ action: "create", name: "Host", difficulty: "easy" });
  const host = { code: a.room.code, token: a.token };
  const b = raceAction({ action: "join", code: a.room.code, name: "Guest" });
  const guest = { code: a.room.code, token: b.token };
  raceAction({ action: "ready", ...guest });
  assert.throws(() =>
    raceAction({ action: "difficulty", ...guest, difficulty: "hard" }),
  );
  assert.throws(() =>
    raceAction({ action: "difficulty", ...host, difficulty: "invalid" }),
  );
  const hard = raceAction({
    action: "difficulty",
    ...host,
    difficulty: "hard",
  }).room;
  assert.equal(hard.difficulty, "hard");
  assert.ok(hard.size > a.room.size);
  assert.ok(hard.total > a.room.total);
  assert.ok(hard.players.every((p) => !p.ready));
  assert.deepEqual(
    hard.paths,
    raceAction({ action: "poll", ...guest }).room.paths,
  );
  assert.throws(() => raceAction({ action: "start", ...host }));
  raceAction({ action: "ready", ...guest });
  raceAction({ action: "start", ...host });
  assert.throws(() =>
    raceAction({ action: "difficulty", ...host, difficulty: "easy" }),
  );
});

test("replayed move requests never consume a second heart or remove a second arrow", () => {
  const a = raceAction({ action: "create", name: "Host" }, 1000);
  const host = { code: a.room.code, token: a.token };
  const b = raceAction(
    { action: "join", code: a.room.code, name: "Guest" },
    1000,
  );
  const guest = { code: a.room.code, token: b.token };
  raceAction({ action: "ready", ...guest }, 1100);
  raceAction({ action: "start", ...host }, 1200);
  let state = raceAction({ action: "poll", ...host }, 5000).room;
  const blocked = state.paths.find((p) => !isFree(p, state.paths, state.size));
  const wrong = {
    action: "move",
    ...host,
    id: blocked.id,
    requestId: "wrong-once",
  };
  raceAction(wrong, 5001);
  state = raceAction(wrong, 5002).room;
  assert.equal(state.players.find((p) => p.you).hearts, 2);
  const free = state.paths.find((p) => isFree(p, state.paths, state.size));
  const correct = {
    action: "move",
    ...host,
    id: free.id,
    requestId: "right-once",
  };
  raceAction(correct, 5003);
  state = raceAction(correct, 5004).room;
  assert.equal(state.players.find((p) => p.you).escaped, 1);
  assert.throws(
    () =>
      raceAction({ action: "poll", code: a.room.code, token: "invalid" }, 5005),
    { code: "PLAYER_NOT_FOUND" },
  );
});

test("host cannot start with a disconnected guest and presence recovers on poll", () => {
  const a = raceAction({ action: "create", name: "Host" }, 1000);
  const host = { code: a.room.code, token: a.token };
  const b = raceAction(
    { action: "join", code: a.room.code, name: "Guest" },
    1000,
  );
  const guest = { code: a.room.code, token: b.token };
  raceAction({ action: "ready", ...guest }, 1100);
  const stale = raceAction({ action: "poll", ...host }, 20000).room;
  assert.equal(stale.players.find((p) => !p.you).connected, false);
  assert.throws(() => raceAction({ action: "start", ...host }, 20001));
  raceAction({ action: "poll", ...guest }, 20002);
  assert.equal(
    raceAction({ action: "start", ...host }, 20003).room.phase,
    "countdown",
  );
});

test("batched moves preserve order and stop at elimination", () => {
  const rooms = new Map();
  const a = applyRaceRequest({ action: "create", name: "Host" }, 1000, rooms);
  const host = { code: a.room.code, token: a.token };
  const b = applyRaceRequest(
    { action: "join", code: a.room.code, name: "Guest" },
    1000,
    rooms,
  );
  applyRaceRequest(
    { action: "ready", code: a.room.code, token: b.token },
    1100,
    rooms,
  );
  applyRaceRequest({ action: "start", ...host }, 1200, rooms);
  const p = a.room.paths.find((p) => !isFree(p, a.room.paths, a.room.size));
  const state = applyRaceRequest(
    {
      action: "moves",
      ...host,
      moves: [1, 2, 3, 4].map((n) => ({ id: p.id, requestId: `batch-${n}` })),
    },
    5000,
    rooms,
  ).room;
  assert.equal(state.players.find((p) => p.you).hearts, 0);
  assert.equal(state.revision, 7);
});

test("saved room checks never extend expiry or reconnect the player", () => {
  const rooms = new Map();
  const created = applyRaceRequest(
    { action: "create", name: "Host" },
    1000,
    rooms,
  );
  const session = {
    action: "check",
    code: created.room.code,
    token: created.token,
  };
  const before = structuredClone(rooms.get(session.code));
  assert.equal(applyRaceRequest(session, 2000, rooms).valid, true);
  assert.deepEqual(rooms.get(session.code), before);
  assert.equal(applyRaceRequest(session, 3601001, rooms).valid, false);
  assert.equal(
    applyRaceRequest({ ...session, token: "wrong" }, 2000, rooms).valid,
    false,
  );
});
