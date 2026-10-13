import { createChallenge, CHALLENGE_VERSION, isFree } from "../paths.js";
export class AttemptError extends Error {}
export function newAttempt(challenge, now) {
  if (!Number.isSafeInteger(challenge) || challenge < 1 || challenge > 1000000)
    throw new AttemptError("Invalid challenge number.");
  const board = createChallenge(challenge);
  return {
    challenge,
    version: CHALLENGE_VERSION,
    seed: board.seed,
    size: board.size,
    paths: board.paths,
    total: board.paths.length,
    timeLimit: board.timeLimit,
    startAt: now + 2500,
    sequence: 0,
    hearts: 3,
    hints: 0,
    eligible: true,
    status: "playing",
    durationMs: null,
  };
}
export function applyAttemptEvents(original, events, now) {
  if (!Array.isArray(events) || !events.length || events.length > 32)
    throw new AttemptError("Invalid attempt events.");
  const state = structuredClone(original);
  for (const event of events) {
    if (!event || !Number.isSafeInteger(event.sequence) || event.sequence < 1)
      throw new AttemptError("Invalid event sequence.");
    if (event.sequence <= state.sequence) continue;
    if (event.sequence !== state.sequence + 1)
      throw new AttemptError("Missing attempt events. Please reconnect.");
    if (state.status !== "playing")
      throw new AttemptError("This attempt has ended.");
    if (now < state.startAt)
      throw new AttemptError("The challenge has not started.");
    if (now >= state.startAt + state.timeLimit * 1000) {
      state.status = "expired";
      state.eligible = false;
      break;
    }
    if (event.type === "pause") state.eligible = false;
    else if (event.type === "hint") state.hints++;
    else if (event.type === "move") {
      const path = state.paths.find((p) => p.id === event.id);
      if (!path) throw new AttemptError("This arrow is no longer available.");
      if (isFree(path, state.paths, state.size))
        state.paths = state.paths.filter((p) => p.id !== path.id);
      else state.hearts--;
      if (!state.hearts) state.status = "lost";
      if (!state.paths.length) {
        state.status = "completed";
        state.durationMs = Math.max(1, now - state.startAt);
      }
    } else throw new AttemptError("Invalid attempt event.");
    state.sequence = event.sequence;
  }
  return state;
}
export function safeAttempt(id, state, now) {
  return {
    id,
    challenge: state.challenge,
    version: state.version,
    seed: state.seed,
    size: state.size,
    paths: state.paths,
    total: state.total,
    timeLimit: state.timeLimit,
    startAt: state.startAt,
    serverNow: now,
    sequence: state.sequence,
    hearts: state.hearts,
    hints: state.hints,
    eligible: state.eligible,
    status: state.status,
    durationMs: state.durationMs,
  };
}
