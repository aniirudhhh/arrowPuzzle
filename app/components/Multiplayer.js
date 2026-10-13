"use client";
import { useState, useEffect, useRef } from "react";
import { Board } from "./Board";
import Icon from "./Icon";
import { isFree } from "../../paths.js";
import { subscribeToRace } from "../../lib/race-live.js";
export default function Multiplayer({
  onSlide,
  onImpact,
  onWin,
  onUnlock,
  reducedMotion,
}) {
  const [room, setRoom] = useState(null),
    [difficulty, setDifficulty] = useState("easy"),
    [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [tick, setTick] = useState(Date.now()),
    [active, setActive] = useState(null),
    [savedRoom, setSavedRoom] = useState(null),
    [connection, setConnection] = useState("connecting"),
    [syncCount, setSyncCount] = useState(0),
    [live, setLive] = useState(false);
  const auth = useRef(null),
    busy = useRef(false),
    offset = useRef(0),
    animationLock = useRef(false),
    moveQueue = useRef([]),
    processingMoves = useRef(false),
    queuedMoves = useRef(0),
    queueVersion = useRef(0),
    polling = useRef(false),
    recovering = useRef(false),
    sessionVersion = useRef(0),
    liveConnected = useRef(false),
    latestRevision = useRef(0),
    lastPoll = useRef(0);
  function clearSession() {
    sessionVersion.current++;
    auth.current = null;
    setSavedRoom(null);
    try {
      sessionStorage.removeItem("arrow-race");
    } catch {}
    latestRevision.current = 0;
    setRoom(null);
    setActive(null);
  }
  async function call(action, extra = {}) {
    const version = sessionVersion.current;
    let response;
    try {
      response = await fetch("/api/race", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...auth.current, ...extra }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      if (version !== sessionVersion.current) throw Error("Session changed.");
      setConnection(navigator.onLine ? "reconnecting" : "offline");
      throw Error(
        "Connection interrupted. Waiting to reconnect and sync your board.",
      );
    }
    if (version !== sessionVersion.current) throw Error("Session changed.");
    let data;
    try {
      data = await response.json();
    } catch {
      setConnection("reconnecting");
      throw Error("The server could not respond. Reconnecting...");
    }
    if (version !== sessionVersion.current) throw Error("Session changed.");
    if (!response.ok) {
      if (["ROOM_NOT_FOUND", "PLAYER_NOT_FOUND"].includes(data.code)) {
        clearSession();
        setError(data.error);
      }
      if (response.status >= 500) setConnection("reconnecting");
      throw Error(data.error || "Could not complete the room request.");
    }
    setConnection("connected");
    auth.current = { code: data.room.code, token: data.token };
    if (action !== "leave") {
      try {
        sessionStorage.setItem("arrow-race", JSON.stringify(auth.current));
      } catch {}
    }
    offset.current = data.room.serverNow - Date.now();
    return data.room;
  }
  async function action(type, extra = {}) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const next = await call(type, extra);
      if (type === "leave") clearSession();
      else {
        latestRevision.current = next.revision ?? 0;
        setRoom(next);
        setSavedRoom(null);
        recovering.current = false;
      }
    } catch (e) {
      setError(e.message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("arrow-race") || "null");
      if (/^[A-F0-9]{6}$/.test(saved?.code) && typeof saved?.token === "string")
        setSavedRoom(saved);
    } catch {}
    let cancelled = false;
    const online = () => setConnection("reconnecting");
    const offline = () => {
      recovering.current = true;
      setConnection("offline");
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const timer = setInterval(async () => {
      setTick(Date.now());
      if (
        !auth.current ||
        busy.current ||
        polling.current ||
        !navigator.onLine ||
        (liveConnected.current && Date.now() - lastPoll.current < 5000)
      )
        return;
      polling.current = true;
      lastPoll.current = Date.now();
      const version = sessionVersion.current;
      try {
        const next = await call("poll");
        if (
          !cancelled &&
          !busy.current &&
          version === sessionVersion.current &&
          (next.revision ?? 0) >= latestRevision.current
        ) {
          latestRevision.current = next.revision ?? 0;
          setRoom(next);
          recovering.current = false;
          setError("");
        }
      } catch (e) {
        if (!cancelled && version === sessionVersion.current) {
          recovering.current = true;
          setError(e.message);
        }
      } finally {
        polling.current = false;
      }
    }, 1000);
    return () => {
      cancelled = true;
      sessionVersion.current++;
      clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);
  useEffect(() => {
    if (!room?.code || !auth.current) return;
    let cancelled = false,
      unsubscribe;
    subscribeToRace(
      auth.current,
      (snapshot) => {
        if (cancelled || snapshot.revision <= latestRevision.current) return;
        latestRevision.current = snapshot.revision;
        if (snapshot.phase === "finished") {
          queueVersion.current++;
          setActive(null);
          setRoom(snapshot);
        } else {
          setRoom((current) => {
            if (!current || current.code !== snapshot.code) return current;
            if (queuedMoves.current)
              return {
                ...snapshot,
                paths: current.paths,
                players: snapshot.players.map((p) =>
                  p.you ? current.players.find((q) => q.you) : p,
                ),
              };
            return snapshot;
          });
        }
      },
      (connected) => {
        if (!cancelled) {
          liveConnected.current = connected;
          setLive(connected);
        }
      },
    )
      .then((cleanup) => {
        if (cancelled) cleanup();
        else unsubscribe = cleanup;
      })
      .catch(() => {
        if (!cancelled) {
          liveConnected.current = false;
          setLive(false);
        }
      });
    return () => {
      cancelled = true;
      liveConnected.current = false;
      setLive(false);
      unsubscribe?.();
    };
  }, [room?.code]);
  const celebrated = useRef(null);
  useEffect(() => {
    if (
      room?.phase === "finished" &&
      room.youWon &&
      celebrated.current !== `${room.code}:${room.round}`
    ) {
      celebrated.current = `${room.code}:${room.round}`;
      onWin?.();
    }
  }, [room, onWin]);
  function difficultyPicker(value, change, disabled = false) {
    return (
      <div
        className="race-difficulty"
        role="group"
        aria-label="Race difficulty"
      >
        {["easy", "medium", "hard"].map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={value === d}
            disabled={disabled}
            onClick={() => change(d)}
          >
            {d}
          </button>
        ))}
      </div>
    );
  }
  function move(path) {
    if (
      animationLock.current ||
      recovering.current ||
      connection !== "connected" ||
      room.phase !== "racing" ||
      room.players.find((p) => p.you)?.hearts === 0
    )
      return;
    onUnlock?.();
    animationLock.current = true;
    busy.current = true;
    queuedMoves.current++;
    setSyncCount(queuedMoves.current);
    const version = queueVersion.current;
    const requestId = crypto.randomUUID();
    const escaped = isFree(path, room.paths, room.size);
    const reduced =
      reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (escaped) onSlide?.();
    else onImpact?.(reduced ? 0 : 0.26);
    setError("");
    setActive({ id: path.id, type: escaped ? "escaping" : "blocked" });
    // Animate immediately; the server still validates every move and decides the winner.
    const animation = new Promise((resolve) =>
      setTimeout(
        () => {
          if (version === queueVersion.current) {
            setRoom((current) =>
              current?.phase !== "racing"
                ? current
                : {
                    ...current,
                    paths: escaped
                      ? current.paths.filter((p) => p.id !== path.id)
                      : current.paths,
                    players: current.players.map((p) =>
                      !p.you
                        ? p
                        : {
                            ...p,
                            escaped: p.escaped + (escaped ? 1 : 0),
                            hearts: Math.max(0, p.hearts - (escaped ? 0 : 1)),
                          },
                    ),
                  },
            );
          }
          setActive(null);
          animationLock.current = false;
          resolve();
        },
        reduced ? 0 : 650,
      ),
    );
    moveQueue.current.push({ id: path.id, requestId, animation, version });
    processMoves();
  }
  async function processMoves() {
    if (processingMoves.current) return;
    processingMoves.current = true;
    try {
      while (moveQueue.current.length) {
        const batch = moveQueue.current.splice(0, 16);
        try {
          if (batch[0].version !== queueVersion.current) continue;
          const next = await call("moves", {
            moves: batch.map(({ id, requestId }) => ({ id, requestId })),
          });
          await Promise.all(batch.map((item) => item.animation));
          if (
            !moveQueue.current.length &&
            batch[0].version === queueVersion.current &&
            (next.revision ?? 0) >= latestRevision.current
          ) {
            latestRevision.current = next.revision ?? 0;
            setRoom(next);
          }
        } catch (error) {
          if (batch[0].version !== queueVersion.current) continue;
          recovering.current = true;
          setConnection("reconnecting");
          queueVersion.current++;
          await Promise.all(batch.map((item) => item.animation));
          setError(error.message);
          const discarded = moveQueue.current.splice(0);
          queuedMoves.current -= discarded.length;
          if (auth.current) {
            try {
              const next = await call("poll");
              latestRevision.current = next.revision ?? 0;
              setRoom(next);
              recovering.current = false;
            } catch {}
          }
        } finally {
          queuedMoves.current -= batch.length;
          setSyncCount(queuedMoves.current);
        }
      }
    } finally {
      processingMoves.current = false;
      if (!queuedMoves.current) busy.current = false;
    }
  }
  const me = room?.players.find((p) => p.you),
    guest = room?.players.find((p) => !p.host);
  const countdown = room?.startAt
    ? Math.max(0, Math.ceil((room.startAt - tick - offset.current) / 1000))
    : 0;
  return (
    <section
      className={`friends-screen ${room ? "in-race" : ""} ${room && room.phase !== "lobby" ? "race-active" : ""}`}
    >
      <div className="kicker">TWO PLAYERS. ONE WAY OUT.</div>
      <h1>
        Race a friend<span>.</span>
      </h1>
      {!room ? (
        <>
          <p className="subheading">
            Share a room code. Ready up. First to clear the same puzzle wins.
          </p>
          {savedRoom && (
            <div className="rejoin-room" role="status">
              <strong>Rejoin room {savedRoom.code}?</strong>
              <p>Your previous match may still be active.</p>
              <div>
                <button
                  className="primary"
                  disabled={pending}
                  onClick={() => {
                    auth.current = savedRoom;
                    action("poll");
                  }}
                >
                  Rejoin
                </button>
                <button
                  disabled={pending}
                  onClick={() => {
                    auth.current = savedRoom;
                    action("leave");
                  }}
                >
                  Leave saved room
                </button>
              </div>
            </div>
          )}
          <label>
            Your nickname
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder="Player name"
            />
          </label>
          {difficultyPicker(difficulty, setDifficulty, pending)}
          <button
            className="primary"
            disabled={pending || !name.trim()}
            onClick={() => action("create", { name, difficulty })}
          >
            Create room
            <Icon name="arrow" />
          </button>
          <div className="join-room">
            <label>
              Room code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="ABC123"
              />
            </label>
            <button
              disabled={pending || !name.trim() || code.length !== 6}
              onClick={() => action("join", { code, name })}
            >
              Join room
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="room-bar">
            <span>
              ROOM <strong>{room.code}</strong>
            </span>
            <button
              aria-label="Copy room code"
              title="Copy room code"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(room.code);
                  setError("Room code copied.");
                } catch {
                  setError(`Share code ${room.code}`);
                }
              }}
            >
              <Icon name="copy" />
              <span className="room-action-label">Copy code</span>
            </button>
            <button
              aria-label="Leave room"
              title="Leave room"
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm(
                    "Leave this room? Your friend will stay in the room.",
                  )
                )
                  action("leave");
              }}
            >
              <Icon name="close" />
              <span className="room-action-label">Leave</span>
            </button>
          </div>
          <div
            className={`race-connection ${connection}`}
            role="status"
            aria-live="polite"
          >
            <span>
              {connection === "connected"
                ? syncCount
                  ? `Syncing ${syncCount} move${syncCount === 1 ? "" : "s"}...`
                  : live
                    ? "Live"
                    : "Connected"
                : connection === "offline"
                  ? "Offline - moves paused"
                  : "Reconnecting - moves paused"}
            </span>
            {connection !== "connected" && (
              <button
                disabled={pending || syncCount > 0}
                onClick={() => action("poll")}
              >
                Reconnect
              </button>
            )}
          </div>
          <div className="race-workspace">
            <aside className="race-sidebar">
              <div className="race-players">
                {room.players.map((p, i) => (
                  <div key={i}>
                    <strong>
                      {p.name}
                      {p.you ? " (you)" : ""}
                      {p.connected === false && (
                        <span className="player-offline">Offline</span>
                      )}
                      <small className="host-badge">
                        {p.host ? "HOST" : "GUEST"}
                      </small>
                    </strong>
                    <span>
                      {p.hearts} ♥ · {p.escaped} / {room.total}
                    </span>
                    <div className="progress">
                      <span
                        style={{ width: `${(p.escaped / room.total) * 100}%` }}
                      />
                    </div>
                    <small>
                      {room.phase !== "lobby"
                        ? "Racing"
                        : p.host
                          ? "Controls the start"
                          : p.ready
                            ? "Ready"
                            : "Not ready"}
                    </small>
                  </div>
                ))}
                {room.players.length === 1 && (
                  <div className="muted">Waiting for your friend…</div>
                )}
              </div>
            </aside>
            <div className="race-center">
              <div className="race-difficulty-label">
                {room.difficulty} | Round {room.round}
              </div>
              {room.phase === "lobby" &&
                me?.host &&
                difficultyPicker(
                  room.difficulty,
                  (d) => action("difficulty", { difficulty: d }),
                  pending,
                )}
              {room.phase === "lobby" ? (
                <button
                  className="primary"
                  disabled={
                    pending ||
                    (me?.host &&
                      (!guest?.ready ||
                        guest?.connected === false ||
                        room.players.length !== 2))
                  }
                  onClick={() => action(me?.host ? "start" : "ready")}
                >
                  {me?.host
                    ? "Start race"
                    : me?.ready
                      ? "Cancel ready"
                      : "Ready"}
                  <Icon name="play" />
                </button>
              ) : room.phase === "countdown" ? (
                <div className="race-countdown">{countdown || "GO!"}</div>
              ) : room.phase === "finished" ? (
                <div className="race-result">
                  <h2>
                    {room.youWon
                      ? "You won!"
                      : room.winner
                        ? `${room.winner} wins!`
                        : "Both players ran out of hearts."}
                  </h2>
                  {room.players.length < 2 ? (
                    <p>Your friend left the room.</p>
                  ) : room.players.find((p) => !p.you)?.rematch ? (
                    <div className="rematch-request">
                      <p>
                        {room.players.find((p) => !p.you)?.name} wants a
                        rematch.
                      </p>
                      <div>
                        <button
                          className="primary"
                          disabled={pending}
                          onClick={() => action("accept-rematch")}
                        >
                          Accept
                          <Icon name="check" />
                        </button>
                        <button
                          disabled={pending}
                          onClick={() => action("decline-rematch")}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ) : me?.rematch ? (
                    <p>Rematch request sent. Waiting for your friend...</p>
                  ) : (
                    <>
                      <button
                        className="primary"
                        disabled={pending}
                        onClick={() => action("rematch")}
                      >
                        Request rematch
                        <Icon name="reset" />
                      </button>
                      {room.rematchDeclinedBy && (
                        <p>{room.rematchDeclinedBy} declined the rematch.</p>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="race-board">
                  <p className="feedback">
                    {room.players.find((p) => p.you)?.hearts === 0
                      ? "Out of hearts. Watching your friend…"
                      : "Clear the board before your friend."}
                  </p>
                  <Board
                    paths={room.paths}
                    size={room.size}
                    active={active}
                    onMove={move}
                  />
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {error && (
        <p className="feedback" role="status">
          {error}
        </p>
      )}
      <p className="friends-note">
        Rooms support two players on the same server. Share the site’s address
        and room code. Rooms expire after one hour of inactivity.
      </p>
    </section>
  );
}
