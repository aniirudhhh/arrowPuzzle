import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { applyRaceRequest } from "./race.js";
const storageFile =
  process.env.ARROW_ROOMS_FILE ||
  (process.env.NODE_TEST_CONTEXT ? null : resolve(".data/rooms.json"));
function loadRooms() {
  if (!storageFile) return new Map();
  try {
    return new Map(JSON.parse(readFileSync(storageFile, "utf8")));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return new Map();
  }
}
const rooms = (globalThis.__arrowRooms ??= loadRooms());
let lastSaved = 0;
function saveRooms(now, force) {
  if (!storageFile || (!force && now - lastSaved < 30000)) return;
  mkdirSync(dirname(storageFile), { recursive: true });
  writeFileSync(`${storageFile}.tmp`, JSON.stringify([...rooms]), {
    mode: 0o600,
  });
  renameSync(`${storageFile}.tmp`, storageFile);
  lastSaved = now;
}

export function raceAction(input, now = Date.now()) {
  const result = applyRaceRequest(input, now, rooms);
  saveRooms(now, input.action !== "poll");
  return result;
}
