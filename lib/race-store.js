import pg from "pg";
import { rootCertificates } from "node:tls";
import { X509Certificate } from "node:crypto";
import { applyRaceAction } from "./race.js";

export function storageFailure(error) {
  const reasons = {
    "42P01": [
      "SCHEMA_MISSING",
      "Multiplayer database setup is incomplete. Run supabase/schema.sql in the Supabase SQL Editor.",
    ],
    "28P01": [
      "AUTH_FAILED",
      "Multiplayer database login failed. Check the database password in Netlify DATABASE_URL.",
    ],
    28000: [
      "AUTH_FAILED",
      "Multiplayer database login failed. Check the connection details in Netlify DATABASE_URL.",
    ],
    42501: [
      "PERMISSION_DENIED",
      "Multiplayer database permissions are missing. Check the server database role.",
    ],
    SELF_SIGNED_CERT_IN_CHAIN: [
      "TLS_FAILED",
      "Multiplayer database certificate verification failed. Add DATABASE_CA_CERT from Supabase Database Settings in Netlify.",
    ],
    DEPTH_ZERO_SELF_SIGNED_CERT: [
      "TLS_FAILED",
      "Multiplayer database certificate verification failed. Add DATABASE_CA_CERT from Supabase Database Settings in Netlify.",
    ],
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: [
      "TLS_FAILED",
      "Multiplayer database certificate verification failed. Add DATABASE_CA_CERT from Supabase Database Settings in Netlify.",
    ],
    INVALID_CA_CERT: [
      "CA_INVALID",
      "DATABASE_CA_CERT is not a valid PEM certificate. Paste the full downloaded certificate contents, not its filename.",
    ],
    ENOTFOUND: [
      "HOST_NOT_FOUND",
      "Multiplayer database host could not be found. Check the pooler URL in Netlify.",
    ],
    ECONNREFUSED: [
      "CONNECTION_FAILED",
      "Multiplayer database connection was refused. Check that the Supabase project is active.",
    ],
    ETIMEDOUT: [
      "CONNECTION_TIMEOUT",
      "Multiplayer database connection timed out. Check the Supabase project and network settings.",
    ],
  };
  const [reason, message] = reasons[error.code] ?? [
    "CONNECTION_FAILED",
    "Multiplayer storage is unavailable. Check Netlify function logs for the database error code.",
  ];
  // Never log raw database errors: they can contain credentials or connection strings.
  console.error("Multiplayer storage failure", {
    reason,
    databaseCode: /^[A-Z0-9_]+$/.test(error.code ?? "")
      ? error.code
      : "UNKNOWN",
  });
  const unavailable = new Error(message);
  unavailable.code = "STORAGE_UNAVAILABLE";
  unavailable.reason = reason;
  return unavailable;
}

export function databaseOptions(env = process.env) {
  const options = {
    connectionString: env.DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
  };
  if (env.DATABASE_CA_CERT) {
    const text = env.DATABASE_CA_CERT.trim()
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n");
    const blocks = text.match(
      /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
    );
    let certificates;
    try {
      if (!blocks?.length) throw new Error();
      certificates = blocks.map((block) =>
        new X509Certificate(block).toString(),
      );
    } catch {
      const error = new Error("Invalid database CA certificate.");
      error.code = "INVALID_CA_CERT";
      throw error;
    }
    const url = new URL(env.DATABASE_URL);
    // pg's URL SSL parameters override the explicit SSL object unless removed.
    for (const key of [
      "sslmode",
      "sslrootcert",
      "sslcert",
      "sslkey",
      "ssl",
      "uselibpqcompat",
    ])
      url.searchParams.delete(key);
    options.connectionString = url.toString();
    options.ssl = {
      ca: [...rootCertificates, ...certificates],
      rejectUnauthorized: true,
    };
  }
  return options;
}

let pool;
function databasePool() {
  pool ??= new pg.Pool(databaseOptions());
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
      throw storageFailure(error);
    }
  }
  const error = new Error("Could not create a room. Please try again.");
  error.code = "STORAGE_UNAVAILABLE";
  throw error;
}
