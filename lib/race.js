import { randomBytes } from "node:crypto";
import { createChallenge, isFree } from "../paths.js";
const fail = (message) => {
  const error = new Error(message);
  error.code = "INVALID_RACE_ACTION";
  throw error;
};
export function applyRaceAction(input, now, rooms) {
  for (const [code, r] of rooms)
    if (now - r.updated > 3600000) rooms.delete(code);
  let room, player;
  if (input.action === "create") {
    let code;
    do {
      code = randomBytes(3).toString("hex").toUpperCase();
    } while (rooms.has(code));
    const difficulty = input.difficulty ?? "easy";
    if (!["easy", "medium", "hard"].includes(difficulty))
      fail("Invalid difficulty.");
    const board = createChallenge(1, difficulty);
    room = {
      code,
      board,
      difficulty,
      players: [],
      phase: "lobby",
      startAt: null,
      winner: null,
      round: 1,
      updated: now,
    };
    rooms.set(code, room);
  } else {
    room = rooms.get(String(input.code || "").toUpperCase());
    if (!room) {
      const error = new Error(
        "This room has expired. Create or join a new room.",
      );
      error.code = "ROOM_NOT_FOUND";
      throw error;
    }
  }
  if (input.action === "create" || input.action === "join") {
    if (room.players.length >= 2) fail("This room already has two players.");
    if (room.phase !== "lobby") fail("This race has started.");
    player = {
      token: randomBytes(24).toString("hex"),
      name:
        String(input.name || "Player")
          .trim()
          .slice(0, 24) || "Player",
      host: input.action === "create",
      ready: false,
      paths: structuredClone(room.board.paths),
      hearts: 3,
      finished: null,
      rematch: false,
      lastSeen: now,
    };
    room.players.push(player);
  } else {
    player = room.players.find((p) => p.token === input.token);
    if (!player) {
      const error = new Error(
        "Your room session is no longer valid. Join again to play.",
      );
      error.code = "PLAYER_NOT_FOUND";
      throw error;
    }
  }
  const previousPhase = room.phase;
  player.lastSeen = now;
  if (room.phase === "countdown" && now >= room.startAt) room.phase = "racing";
  if (input.action === "difficulty") {
    if (!player.host || room.phase !== "lobby")
      fail("Only the host can change difficulty before the race.");
    if (!["easy", "medium", "hard"].includes(input.difficulty))
      fail("Invalid difficulty.");
    if (room.difficulty !== input.difficulty) {
      room.difficulty = input.difficulty;
      room.board = createChallenge(room.round, room.difficulty);
      for (const p of room.players) {
        p.ready = false;
        p.paths = structuredClone(room.board.paths);
        p.hearts = 3;
      }
    }
  }
  if (input.action === "ready") {
    if (room.phase !== "lobby") fail("Race already started.");
    if (player.host) fail("The host starts the race after the guest is ready.");
    player.ready = !player.ready;
  }
  if (input.action === "start") {
    if (!player.host) fail("Only the host can start the race.");
    if (
      room.phase !== "lobby" ||
      room.players.length !== 2 ||
      !room.players.find((p) => !p.host)?.ready ||
      now - (room.players.find((p) => !p.host)?.lastSeen ?? room.updated) >
        15000
    )
      fail("Wait for your guest to be ready.");
    player.ready = true;
    room.phase = "countdown";
    room.startAt = now + 3000;
  }
  const repeatedMove =
    input.action === "move" &&
    input.requestId &&
    player.moveRequests?.includes(input.requestId);
  if (input.action === "move" && !repeatedMove) {
    if (
      input.requestId &&
      (typeof input.requestId !== "string" || input.requestId.length > 80)
    )
      fail("Invalid move request.");
    if (
      room.phase !== "racing" ||
      now < room.startAt ||
      player.hearts === 0 ||
      player.finished !== null
    )
      fail("Race is not active.");
    const path = player.paths.find((p) => p.id === input.id);
    if (!path) fail("Arrow already escaped.");
    if (isFree(path, player.paths, room.board.size)) {
      player.paths = player.paths.filter((p) => p.id !== path.id);
      if (!player.paths.length) {
        player.finished = now - room.startAt;
        room.winner = player.token;
        room.phase = "finished";
      }
    } else {
      player.hearts--;
      if (room.players.every((p) => p.hearts === 0)) {
        room.phase = "finished";
        room.winner = null;
      }
    }
  }
  if (input.action === "move" && input.requestId && !repeatedMove) {
    player.moveRequests = [
      ...(player.moveRequests ?? []),
      input.requestId,
    ].slice(-64);
  }
  if (["rematch", "accept-rematch", "decline-rematch"].includes(input.action)) {
    if (room.phase !== "finished" || room.players.length !== 2)
      fail("Both players must be connected after a finished race.");
    const other = room.players.find((p) => p !== player);
    if (input.action === "rematch") {
      if (other.rematch) fail("Accept the existing rematch request.");
      player.rematch = true;
      room.rematchDeclinedBy = null;
    } else {
      if (!other.rematch) fail("No rematch request to answer.");
      if (input.action === "decline-rematch") {
        room.players.forEach((p) => (p.rematch = false));
        room.rematchDeclinedBy = player.name;
      } else {
        room.round++;
        room.board = createChallenge(room.round, room.difficulty);
        room.phase = "lobby";
        room.startAt = null;
        room.winner = null;
        room.rematchDeclinedBy = null;
        for (const p of room.players)
          Object.assign(p, {
            ready: false,
            paths: structuredClone(room.board.paths),
            hearts: 3,
            finished: null,
            rematch: false,
            moveRequests: [],
          });
      }
    }
  }
  if (input.action === "leave") {
    room.players = room.players.filter((p) => p !== player);
    if (player.host && room.players[0]) room.players[0].host = true;
    if (room.phase === "racing" || room.phase === "countdown") {
      room.phase = "finished";
      room.winner = room.players[0]?.token ?? null;
    }
    if (!room.players.length) rooms.delete(room.code);
  }
  if (input.action !== "poll" || room.phase !== previousPhase)
    room.revision = (room.revision ?? 0) + 1;
  room.updated = now;

  return {
    token: player.token,
    room: {
      code: room.code,
      phase: room.phase,
      startAt: room.startAt,
      serverNow: now,
      round: room.round,
      revision: room.revision ?? 0,
      difficulty: room.difficulty,
      rematchDeclinedBy: room.rematchDeclinedBy ?? null,
      size: room.board.size,
      total: room.board.paths.length,
      winner: room.winner
        ? room.players.find((p) => p.token === room.winner)?.name
        : null,
      youWon: room.winner === player.token,
      players: room.players.map((p) => ({
        name: p.name,
        you: p === player,
        host: p.host,
        ready: p.ready,
        connected: now - (p.lastSeen ?? room.updated) <= 15000,
        hearts: p.hearts,
        escaped: room.board.paths.length - p.paths.length,
        finished: p.finished,
        rematch: p.rematch,
      })),
      paths: player.paths,
    },
  };
}

export function applyRaceRequest(input, now, rooms) {
  if (input.action !== "moves") return applyRaceAction(input, now, rooms);
  if (
    !Array.isArray(input.moves) ||
    !input.moves.length ||
    input.moves.length > 16 ||
    input.moves.some(
      (move) =>
        !move ||
        typeof move.id !== "number" ||
        typeof move.requestId !== "string" ||
        !move.requestId.length,
    )
  )
    fail("Invalid move batch.");
  let result;
  for (const move of input.moves) {
    result = applyRaceAction(
      { ...input, action: "move", id: move.id, requestId: move.requestId },
      now,
      rooms,
    );
    if (
      result.room.phase === "finished" ||
      result.room.players.find((p) => p.you)?.hearts === 0
    )
      break;
  }
  return result;
}
