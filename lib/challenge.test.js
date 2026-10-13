import test from "node:test";
import assert from "node:assert/strict";
import {
  challengeDefinition,
  createChallenge,
  CHALLENGE_VERSION,
  isFree,
} from "../paths.js";
test("each challenge group mixes difficulties with capped size and pressure", () => {
  for (let group = 0; group < 100; group++) {
    const rounds = [1, 2, 3].map((n) => challengeDefinition(group * 3 + n));
    assert.deepEqual(rounds.map((r) => r.difficulty).sort(), [
      "easy",
      "hard",
      "medium",
    ]);
    for (const r of rounds) {
      assert.ok(r.size <= 15);
      assert.ok(r.pressure <= 0.18);
      assert.equal(r.version, CHALLENGE_VERSION);
    }
  }
});
test("challenge puzzles and timers are repeatable, bounded and solvable", () => {
  for (const difficulty of ["easy", "medium", "hard"]) {
    const first = createChallenge(37, difficulty),
      again = createChallenge(37, difficulty);
    assert.deepEqual(first, again);
    const [min, max] = { easy: [35, 60], medium: [60, 100], hard: [100, 150] }[
      difficulty
    ];
    assert.ok(first.timeLimit >= min && first.timeLimit <= max);
    let paths = first.paths;
    while (paths.length) {
      const free = paths.find((p) => isFree(p, paths, first.size));
      assert.ok(free);
      paths = paths.filter((p) => p.id !== free.id);
    }
  }
});
