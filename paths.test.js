import test from "node:test";
import assert from "node:assert/strict";
import { createPuzzle, isFree } from "./paths.js";
test("path boards have distinct occupied cells and can be fully escaped", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const size = seed % 2 ? 11 : 13;
    let paths = createPuzzle(seed * 7919, size);
    assert.ok(paths.length > 8);
    const cells = paths.flatMap((p) => p.cells.map((c) => c.join(",")));
    assert.equal(new Set(cells).size, cells.length);
    while (paths.length) {
      const p = paths.find((p) => isFree(p, paths, size));
      assert.ok(p, `Seed ${seed} stalled`);
      paths = paths.filter((a) => a.id !== p.id);
    }
  }
});
import { createLevel, levelProfile, puzzleMetrics } from "./paths.js";
test("campaign rhythm is deterministic, dense when hard, and always solvable", () => {
  const density = { easy: [], medium: [], hard: [] };
  for (let level = 1; level <= 24; level++) {
    const board = createLevel(level);
    assert.deepEqual(board, createLevel(level));
    assert.equal(
      board.profile.difficulty,
      level <= 3
        ? "easy"
        : ["medium", "medium", "hard", "easy"][(level - 4) % 4],
    );
    const occupied = board.paths.flatMap((p) =>
      p.cells.map((c) => c.join(",")),
    );
    assert.equal(new Set(occupied).size, occupied.length);
    const expectedCells = board.shape?.cells.length ?? board.size * board.size;
    assert.equal(
      occupied.length,
      expectedCells,
      `Level ${level} fills its playable silhouette`,
    );
    density[board.profile.difficulty].push(occupied.length / expectedCells);
    let remaining = board.paths;
    while (remaining.length) {
      const next = remaining.find((p) => isFree(p, remaining, board.size));
      assert.ok(next, `Level ${level} stalled`);
      remaining = remaining.filter((p) => p.id !== next.id);
    }
  }
  const average = (key) =>
    density[key].reduce((a, b) => a + b, 0) / density[key].length;
  assert.equal(average("easy"), 1);
  assert.equal(average("medium"), 1);
  assert.equal(average("hard"), 1);
  assert.equal(levelProfile(12, true).difficulty, "medium");
  assert.deepEqual(createLevel(12, 20261013), createLevel(12, 20261013));
});

test("first five campaign silhouettes are distinct, connected, deterministic and fully solvable", () => {
  const names = ["Cat", "Butterfly", "Bird", "Fish", "Turtle"];
  for (let level = 1; level <= 5; level++) {
    const board = createLevel(level);
    assert.equal(board.shape.name, names[level - 1]);
    assert.deepEqual(board, createLevel(level));
    const allowed = new Set(board.shape.cells.map((c) => c.join(",")));
    assert.ok(allowed.size < board.size * board.size);
    assert.ok(allowed.size > board.size * board.size * 0.35);
    const visited = new Set(),
      pending = [board.shape.cells[0]];
    while (pending.length) {
      const [x, y] = pending.pop(),
        key = `${x},${y}`;
      if (visited.has(key) || !allowed.has(key)) continue;
      visited.add(key);
      pending.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    assert.equal(
      visited.size,
      allowed.size,
      `${board.shape.name} has no detached cells`,
    );
    for (const path of board.paths) {
      assert.ok(path.cells.every((c) => allowed.has(c.join(","))));
      for (let i = 1; i < path.cells.length; i++)
        assert.equal(
          Math.abs(path.cells[i][0] - path.cells[i - 1][0]) +
            Math.abs(path.cells[i][1] - path.cells[i - 1][1]),
          1,
        );
    }
    let remaining = board.paths;
    while (remaining.length) {
      const free = remaining.find((p) => isFree(p, remaining, board.size));
      assert.ok(free, `${board.shape.name} remains solvable`);
      remaining = remaining.filter((p) => p.id !== free.id);
    }
  }
  assert.equal(createLevel(6).shape, undefined);
  assert.equal(createLevel(1, 20261029).shape, undefined);
});
test("an arrow cannot escape through its own tail", () => {
  const loop = {
    id: 0,
    d: "down",
    cells: [
      [1, 1],
      [1, 0],
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
    ],
  };
  assert.equal(isFree(loop, [loop], 4), false);
  const clear = {
    id: 1,
    d: "down",
    cells: [
      [2, 1],
      [2, 0],
      [3, 0],
    ],
  };
  assert.equal(isFree(clear, [clear], 4), true);
});
test("boards mix directions and minimize isolated arrowheads", () => {
  for (const level of [1, 4, 6, 10, 18, 24]) {
    const b = createLevel(level),
      nearest = b.paths.filter((p) => {
        const [x, y] = p.cells[0],
          d = [x, b.size - 1 - x, y, b.size - 1 - y];
        return (
          p.d === ["left", "right", "up", "down"][d.indexOf(Math.min(...d))]
        );
      });
    assert.ok(
      nearest.length / b.paths.length < 0.7,
      `Level ${level} points outward too often`,
    );
    assert.ok(
      b.paths.filter((p) => p.cells.length === 1).length / b.paths.length <
        0.15,
    );
  }
});
