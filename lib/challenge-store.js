import { randomUUID, createHash, randomBytes } from "node:crypto";
import { databasePool } from "./race-store.js";
import {
  newAttempt,
  applyAttemptEvents,
  safeAttempt,
  AttemptError,
} from "./challenge-attempt.js";
import { CHALLENGE_VERSION } from "../paths.js";
export function playerToken(request) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("arrow-player="))
    ?.slice(13);
  return /^[a-f0-9]{64}$/.test(value || "")
    ? value
    : randomBytes(32).toString("hex");
}
export async function challengeRequest(
  input,
  token,
  database = databasePool(),
  now = Date.now(),
) {
  if (!input || typeof input !== "object")
    throw new AttemptError("Invalid request.");
  const hash = createHash("sha256").update(token).digest("hex");
  if (input.action === "board") {
    if (
      !Number.isSafeInteger(input.challenge) ||
      input.challenge < 1 ||
      input.challenge > 1000000
    )
      throw new AttemptError("Invalid challenge.");
    const category =
      input.category === "with-hints" ? "with-hints" : "unassisted";
    const { rows } = await database.query(
      `WITH ranked AS (
    SELECT p.id AS player_id,p.nickname,s.duration_ms,s.hearts,s.hints,RANK() OVER (ORDER BY s.duration_ms ASC,s.hearts DESC) AS rank,ROW_NUMBER() OVER (ORDER BY s.duration_ms ASC,s.hearts DESC,s.achieved_at ASC,p.id) AS position
    FROM public.arrow_scores s JOIN public.arrow_players p ON p.id=s.player_id
    WHERE s.challenge=$1 AND s.version=$2 AND s.category=$3
  ) SELECT nickname,duration_ms,hearts,hints,rank,position,(player_id=(SELECT id FROM public.arrow_players WHERE token_hash=$4)) IS TRUE AS you FROM ranked WHERE position<=10 OR player_id=(SELECT id FROM public.arrow_players WHERE token_hash=$4) ORDER BY rank,nickname`,
      [input.challenge, CHALLENGE_VERSION, category, hash],
    );
    return {
      version: CHALLENGE_VERSION,
      category,
      entries: rows.map((r) => ({
        ...r,
        rank: Number(r.rank),
        position: Number(r.position),
      })),
    };
  }
  const client = await database.connect();
  try {
    await client.query("BEGIN; SET LOCAL statement_timeout = '10s'");
    let { rows } = await client.query(
      "SELECT id,nickname FROM public.arrow_players WHERE token_hash=$1 FOR UPDATE",
      [hash],
    );
    let player = rows[0];
    if (!player) {
      if (input.action !== "start")
        throw new AttemptError("Start a ranked challenge first.");
      const nickname = String(input.nickname || "").trim();
      if (nickname.length < 2 || nickname.length > 24)
        throw new AttemptError("Use a nickname with 2�24 characters.");
      const inserted = await client.query(
        "INSERT INTO public.arrow_players(id,token_hash,nickname) VALUES($1,$2,$3) ON CONFLICT(token_hash) DO UPDATE SET token_hash=EXCLUDED.token_hash RETURNING id,nickname",
        [randomUUID(), hash, nickname],
      );
      player = inserted.rows[0];
    }
    let id, state;
    if (input.action === "start") {
      const count = await client.query(
        "SELECT count(*)::integer AS count FROM public.arrow_attempts WHERE player_id=$1 AND created_at>now()-interval '1 hour'",
        [player.id],
      );
      if (count.rows[0].count >= 60)
        throw new AttemptError("Too many starts. Try again later.");
      state = newAttempt(input.challenge, now);
      id = randomUUID();
      const nickname = String(input.nickname || player.nickname).trim();
      if (nickname.length < 2 || nickname.length > 24)
        throw new AttemptError("Use a nickname with 2�24 characters.");
      await client.query(
        "UPDATE public.arrow_players SET nickname=$2 WHERE id=$1",
        [player.id, nickname],
      );
      await client.query(
        "INSERT INTO public.arrow_attempts(id,player_id,state,expires_at) VALUES($1,$2,$3::jsonb,$4)",
        [id, player.id, JSON.stringify(state), new Date(now + 3600000)],
      );
    } else if (input.action === "events") {
      if (!/^[a-f0-9-]{36}$/.test(input.id || ""))
        throw new AttemptError("Invalid attempt.");
      id = input.id;
      const found = await client.query(
        "SELECT state FROM public.arrow_attempts WHERE id=$1 AND player_id=$2 AND expires_at>now() FOR UPDATE",
        [id, player.id],
      );
      if (!found.rows[0])
        throw new AttemptError("Attempt expired or unavailable.");
      state = applyAttemptEvents(found.rows[0].state, input.events, now);
      await client.query(
        "UPDATE public.arrow_attempts SET state=$2::jsonb WHERE id=$1",
        [id, JSON.stringify(state)],
      );
      if (state.status === "completed" && state.eligible) {
        await client.query(
          `INSERT INTO public.arrow_scores(player_id,challenge,version,category,duration_ms,hearts,hints,attempt_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(player_id,challenge,version,category) DO UPDATE SET duration_ms=EXCLUDED.duration_ms,hearts=EXCLUDED.hearts,hints=EXCLUDED.hints,attempt_id=EXCLUDED.attempt_id,achieved_at=now()
     WHERE EXCLUDED.duration_ms<arrow_scores.duration_ms OR (EXCLUDED.duration_ms=arrow_scores.duration_ms AND EXCLUDED.hearts>arrow_scores.hearts)`,
          [
            player.id,
            state.challenge,
            state.version,
            state.hints ? "with-hints" : "unassisted",
            state.durationMs,
            state.hearts,
            state.hints,
            id,
          ],
        );
      }
    } else throw new AttemptError("Invalid leaderboard action.");
    await client.query("COMMIT");
    return {
      attempt: safeAttempt(id, state, Date.now()),
      nickname: player.nickname,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
