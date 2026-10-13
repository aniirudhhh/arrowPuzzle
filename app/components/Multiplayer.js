"use client";
import { useState, useEffect, useRef } from "react";
import { Board } from "./Board";
import Icon from "./Icon";
import { isFree } from "../../paths.js";
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
    [active, setActive] = useState(null);
  const auth = useRef(null),
    busy = useRef(false),
    offset = useRef(0),
    animationLock = useRef(false),
    moveQueue = useRef(Promise.resolve()),
    queuedMoves = useRef(0),
    queueVersion = useRef(0);
  async function call(action, extra = {}) {
    const response = await fetch("/api/race", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...auth.current, ...extra }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (data.code === "ROOM_NOT_FOUND") {
        auth.current = null;
        try {
          sessionStorage.removeItem("arrow-race");
        } catch {}
        setRoom(null);
        setActive(null);
      }
      throw Error(data.error);
    }
    auth.current = { code: data.room.code, token: data.token };
    try {
      sessionStorage.setItem("arrow-race", JSON.stringify(auth.current));
    } catch {}
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
      setRoom(type === "leave" ? null : next);
      if (type === "leave") {
        auth.current = null;
        sessionStorage.removeItem("arrow-race");
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
      auth.current = JSON.parse(sessionStorage.getItem("arrow-race") || "null");
    } catch {}
    let cancelled = false;
    const timer = setInterval(async () => {
      setTick(Date.now());
      if (!auth.current || busy.current) return;
      try {
        const next = await call("poll");
        if (!cancelled && !busy.current) setRoom(next);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
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
      room.phase !== "racing" ||
      room.players.find((p) => p.you)?.hearts === 0
    )
      return;
    onUnlock?.();
    animationLock.current = true;
    busy.current = true;
    queuedMoves.current++;
    const version = queueVersion.current;
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
    // Keep requests ordered while allowing the next tap after its animation.
    moveQueue.current = moveQueue.current
      .then(async () => {
        if (version !== queueVersion.current) return;
        try {
          const next = await call("move", { id: path.id });
          await animation;
          if (queuedMoves.current === 1 && version === queueVersion.current)
            setRoom(next);
        } catch (error) {
          queueVersion.current++;
          await animation;
          setError(error.message);
          if (auth.current) {
            try {
              setRoom(await call("poll"));
            } catch {}
          }
        }
      })
      .finally(() => {
        queuedMoves.current--;
        if (!queuedMoves.current) busy.current = false;
      });
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
          <div className="race-workspace">
            <aside className="race-sidebar">
              <div className="race-players">
                {room.players.map((p, i) => (
                  <div key={i}>
                    <strong>
                      {p.name}
                      {p.you ? " (you)" : ""}
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
                    (me?.host && (!guest?.ready || room.players.length !== 2))
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
