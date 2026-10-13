const directions = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };
export function createPuzzle(seed = 1, size = 11, options = {}) {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const occupied = new Set(),
    paths = [];
  const key = ([x, y]) => `${x},${y}`;
  // Add paths in reverse escape order. A new head's ray never crosses an earlier path.
  for (let attempt = 0; attempt < (options.attempts ?? 1500); attempt++) {
    const head = [Math.floor(rand() * size), Math.floor(rand() * size)],
      d = Object.keys(directions)[Math.floor(rand() * 4)],
      v = directions[d];
    if (occupied.has(key(head))) continue;
    let clear = true;
    for (
      let x = head[0] + v[0], y = head[1] + v[1];
      x >= 0 && y >= 0 && x < size && y < size;
      x += v[0], y += v[1]
    )
      if (occupied.has(`${x},${y}`)) {
        clear = false;
        break;
      }
    if (!clear) continue;
    const cells = [head],
      used = new Set([key(head)]);
    let prev = [-v[0], -v[1]],
      length =
        (options.minLength ?? 2) +
        Math.floor(rand() * (options.lengthRange ?? 5));
    for (let n = 0; n < length; n++) {
      const options =
        n === 0
          ? [prev]
          : [
              prev,
              ...Object.values(directions).filter(
                (a) => a[0] !== -prev[0] || a[1] !== -prev[1],
              ),
            ].sort(() => rand() - 0.5);
      const tail = cells.at(-1);
      const step = options.find((a) => {
        const p = [tail[0] + a[0], tail[1] + a[1]];
        return (
          p[0] >= 0 &&
          p[1] >= 0 &&
          p[0] < size &&
          p[1] < size &&
          !occupied.has(key(p)) &&
          !used.has(key(p))
        );
      });
      if (!step) break;
      const p = [tail[0] + step[0], tail[1] + step[1]];
      cells.push(p);
      used.add(key(p));
      prev = step;
    }
    if (
      cells.length < 2 ||
      !isFree({ id: -1, d, cells }, [{ id: -1, d, cells }], size)
    )
      continue;
    cells.forEach((p) => occupied.add(key(p)));
    paths.push({ id: paths.length, d, cells });
    if (occupied.size > size * size * (options.density ?? 0.8)) break;
  }
  return paths;
}
export function isFree(path, paths, size) {
  const [dx, dy] = directions[path.d],
    [hx, hy] = path.cells[0];
  const occupied = new Set(
    paths.flatMap((p) => p.cells.map(([x, y]) => `${x},${y}`)),
  );
  for (
    let x = hx + dx, y = hy + dy;
    x >= 0 && y >= 0 && x < size && y < size;
    x += dx, y += dy
  )
    if (occupied.has(`${x},${y}`)) return false;
  return true;
}

export function levelProfile(level, daily = false) {
  const chapter = Math.min(4, Math.floor((level - 1) / 16));
  const difficulty = daily
    ? "medium"
    : level <= 3
      ? "easy"
      : ["medium", "medium", "hard", "easy"][(level - 4) % 4];
  const settings = {
    easy: {
      size: 11 + chapter,
      density: 1,
      minLength: 1,
      lengthRange: 3,
      freeTarget: 0.65,
    },
    medium: {
      size: 15 + chapter,
      density: 1,
      minLength: 2,
      lengthRange: 5,
      freeTarget: 0.4,
    },
    hard: {
      size: 19 + chapter,
      density: 1,
      minLength: 3,
      lengthRange: 6,
      freeTarget: 0.22,
    },
  };
  return {
    ...settings[difficulty],
    size: Math.min(30, Math.round(settings[difficulty].size * Math.SQRT2)),
    difficulty,
    chapter,
    label:
      level <= 3 && !daily
        ? "LEARNING THE FLOW"
        : difficulty === "easy"
          ? "EASY / TAKE A BREATHER"
          : difficulty === "hard"
            ? "HARD / DEEP FOCUS"
            : "MEDIUM / FIND YOUR FLOW",
  };
}
export function puzzleMetrics(paths, size) {
  const cells = paths.reduce((n, p) => n + p.cells.length, 0);
  let turns = 0;
  for (const p of paths)
    for (let i = 2; i < p.cells.length; i++) {
      const a = p.cells[i - 2],
        b = p.cells[i - 1],
        c = p.cells[i];
      if (b[0] - a[0] !== c[0] - b[0] || b[1] - a[1] !== c[1] - b[1]) turns++;
    }
  return {
    density: cells / (size * size),
    freeFraction:
      paths.filter((p) => isFree(p, paths, size)).length / paths.length,
    turns,
  };
}
export function createLevel(level, dailySeed = null) {
  const profile = levelProfile(level, dailySeed !== null),
    seed = dailySeed ?? level * 7919;
  return { profile, paths: packedPuzzle(seed, profile), size: profile.size };
}
function solvable(paths, size) {
  const occupied = new Map(
    paths.flatMap((p) => p.cells.map(([x, y]) => [y * size + x, p.id])),
  );
  let remaining = paths.slice();
  while (remaining.length) {
    const free = remaining.filter((p) => {
      const [dx, dy] = directions[p.d],
        [hx, hy] = p.cells[0];
      for (
        let x = hx + dx, y = hy + dy;
        x >= 0 && y >= 0 && x < size && y < size;
        x += dx, y += dy
      ) {
        const id = occupied.get(y * size + x);
        if (id !== undefined) return false;
      }
      return true;
    });
    if (!free.length) return false;
    const ids = new Set(free.map((p) => p.id));
    for (const p of free)
      for (const [x, y] of p.cells) occupied.delete(y * size + x);
    remaining = remaining.filter((p) => !ids.has(p.id));
  }
  return true;
}
function packedPuzzle(seed, profile) {
  const size = profile.size;
  let state = seed >>> 0;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  let paths = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const distances = [x, size - 1 - x, y, size - 1 - y];
      paths.push({
        id: paths.length,
        d: ["left", "right", "up", "down"][
          distances.indexOf(Math.min(...distances))
        ],
        cells: [[x, y]],
      });
    }
  // Break the nearest-edge pattern with seeded direction changes, accepting
  // only layouts with a complete escape sequence.
  for (let attempt = 0; attempt < size * size * 4; attempt++) {
    const i = Math.floor(rand() * paths.length),
      p = paths[i],
      d = Object.keys(directions)[Math.floor(rand() * 4)];
    if (d === p.d) continue;
    const next = paths.slice();
    next[i] = { ...p, d };
    if (solvable(next, size)) paths = next;
  }
  const maxLength =
    profile.difficulty === "easy"
      ? 4
      : profile.difficulty === "medium"
        ? 7
        : 10;
  for (let attempt = 0; attempt < size * size * 8; attempt++) {
    const a = paths[Math.floor(rand() * paths.length)],
      tail = a.cells.at(-1);
    const candidates = paths.filter(
      (b) =>
        b !== a &&
        a.cells.length + b.cells.length <= maxLength &&
        Math.abs(b.cells[0][0] - tail[0]) +
          Math.abs(b.cells[0][1] - tail[1]) ===
          1,
    );
    if (!candidates.length) continue;
    const b = candidates[Math.floor(rand() * candidates.length)];
    let d = a.d;
    if (a.cells.length === 1) {
      const dx = tail[0] - b.cells[0][0],
        dy = tail[1] - b.cells[0][1];
      d = Object.keys(directions).find(
        (k) => directions[k][0] === dx && directions[k][1] === dy,
      );
    }
    const merged = { ...a, d, cells: [...a.cells, ...b.cells] },
      next = paths.filter((p) => p !== a && p !== b).concat(merged);
    if (solvable(next, size)) paths = next;
  }
  for (let pass = 0; pass < 3; pass++)
    for (const single of paths.filter((p) => p.cells.length === 1)) {
      if (!paths.includes(single)) continue;
      const candidates = paths.filter(
        (p) =>
          p !== single &&
          Math.abs(p.cells.at(-1)[0] - single.cells[0][0]) +
            Math.abs(p.cells.at(-1)[1] - single.cells[0][1]) ===
            1,
      );
      for (const a of candidates) {
        let d = a.d;
        if (a.cells.length === 1) {
          const dx = a.cells[0][0] - single.cells[0][0],
            dy = a.cells[0][1] - single.cells[0][1];
          d = Object.keys(directions).find(
            (k) => directions[k][0] === dx && directions[k][1] === dy,
          );
        }
        const next = paths
          .filter((p) => p !== a && p !== single)
          .concat({ ...a, d, cells: [...a.cells, ...single.cells] });
        if (solvable(next, size)) {
          paths = next;
          break;
        }
      }
    }
  if (!profile.challenge || profile.difficulty !== "easy") {
    let score = challengeScore(paths, size);
    for (
      let attempt = 0;
      attempt < size * size * (profile.difficulty === "hard" ? 5 : 2);
      attempt++
    ) {
      const i = Math.floor(rand() * paths.length),
        p = paths[i];
      if (p.cells.length < 2) continue;
      const cells = p.cells.slice().reverse(),
        dx = cells[0][0] - cells[1][0],
        dy = cells[0][1] - cells[1][1];
      const d = Object.keys(directions).find(
        (k) => directions[k][0] === dx && directions[k][1] === dy,
      );
      const next = paths.slice();
      next[i] = { ...p, d, cells };
      if (!solvable(next, size)) continue;
      const nextScore = challengeScore(next, size);
      if (nextScore > score) {
        paths = next;
        score = nextScore;
      }
    }
  }
  return paths.map((p, id) => ({ ...p, id }));
}

export function challengeMetrics(paths, size) {
  const occupied = new Map(
    paths.flatMap((p) => p.cells.map(([x, y]) => [y * size + x, p.id])),
  );
  let remaining = paths.slice(),
    layers = 0,
    initialExits = 0;
  while (remaining.length) {
    const free = remaining.filter((p) => {
      const [dx, dy] = directions[p.d],
        [hx, hy] = p.cells[0];
      for (
        let x = hx + dx, y = hy + dy;
        x >= 0 && y >= 0 && x < size && y < size;
        x += dx, y += dy
      )
        if (occupied.has(y * size + x)) return false;
      return true;
    });
    if (!layers) initialExits = free.length;
    if (!free.length) return { initialExits, layers: 0 };
    const ids = new Set(free.map((p) => p.id));
    for (const p of free)
      for (const [x, y] of p.cells) occupied.delete(y * size + x);
    remaining = remaining.filter((p) => !ids.has(p.id));
    layers++;
  }
  return { initialExits, layers };
}
function challengeScore(paths, size) {
  const { initialExits, layers } = challengeMetrics(paths, size);
  return layers * 4 - initialExits * 8;
}

export function createDaily(seed) {
  const profile = {
    ...levelProfile(4, true),
    size: 21,
    chapter: null,
    label: "DAILY / MEDIUM",
  };
  return { profile, paths: packedPuzzle(seed, profile), size: profile.size };
}

export function createChallenge(level, selectedDifficulty) {
  const difficulty =
    selectedDifficulty ??
    (level <= 3
      ? "easy"
      : ["medium", "medium", "hard", "easy"][(level - 4) % 4]);
  const stage = Math.min(2, Math.floor((level - 1) / 24));
  const size = { easy: 9, medium: 12, hard: 15 }[difficulty] + stage;
  const profile = {
    difficulty,
    size,
    challenge: true,
    chapter: null,
    label: `CHALLENGE / ${difficulty.toUpperCase()}`,
  };
  const paths = packedPuzzle(level * 3571 + 17, profile),
    metrics = challengeMetrics(paths, size);
  // Budget for each deliberate tap, reading the initial board, and dependencies.
  const perArrow = { easy: 1.8, medium: 1.7, hard: 1.6 }[difficulty];
  const timeLimit =
    Math.ceil((8 + paths.length * perArrow + metrics.layers * 0.8) / 5) * 5;
  return { paths, size, profile, timeLimit };
}
