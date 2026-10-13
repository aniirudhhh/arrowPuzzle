import pg from "pg";
import { applyRaceAction } from "./race.js";

let pool;
function databasePool() {
  pool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
  });
  return pool;
}

// Each room is locked for the full read/validate/write transaction.
// Separate rooms can progress independently across serverless instances.
export async function databaseRaceAction(input, database, now = Date.now()) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const code = String(input.code || "").toUpperCase();
    const rooms = new Map();
    if (input.action !== "create") {
      const { rows } = await client.query(
        "SELECT state FROM public.arrow_rooms WHERE code = $1 AND expires_at > $2 FOR UPDATE",
        [code, new Date(now)],
      );
      if (rows[0]) rooms.set(code, rows[0].state);
    }
    const result = applyRaceAction(input, now, rooms);
    const updated = rooms.get(result.room.code);
    if (input.action === "create") {
      await client.query(
        "INSERT INTO public.arrow_rooms (code, state, expires_at) VALUES ($1, $2::jsonb, $3)",
        [result.room.code, JSON.stringify(updated), new Date(now + 3600000)],
      );
    } else if (updated) {
      await client.query(
        "UPDATE public.arrow_rooms SET state = $2::jsonb, expires_at = $3 WHERE code = $1",
        [code, JSON.stringify(updated), new Date(now + 3600000)],
      );
    } else {
      await client.query("DELETE FROM public.arrow_rooms WHERE code = $1", [
        code,
      ]);
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function handleRaceAction(input) {
  if (!process.env.DATABASE_URL) {
    if (process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      const error = new Error(
        "Multiplayer is not configured yet. Add DATABASE_URL to the site's server environment.",
      );
      error.code = "STORAGE_UNAVAILABLE";
      throw error;
    }
    const { raceAction } = await import("./local-race.js");
    return raceAction(input);
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await databaseRaceAction(input, databasePool());
    } catch (error) {
      if (input.action === "create" && error.code === "23505") continue;
      // Gameplay errors are safe; never expose connection URLs or database internals.
      if (["INVALID_RACE_ACTION", "ROOM_NOT_FOUND"].includes(error.code))
        throw error;
      const unavailable = new Error(
        "Multiplayer storage is unavailable. Please try again shortly.",
      );
      unavailable.code = "STORAGE_UNAVAILABLE";
      throw unavailable;
    }
  }
  const error = new Error("Could not create a room. Please try again.");
  error.code = "STORAGE_UNAVAILABLE";
  throw error;
}
