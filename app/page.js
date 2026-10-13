"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  createPuzzle,
  isFree,
  createLevel,
  levelProfile,
  createDaily,
  createChallenge,
} from "../paths";
import Icon from "./components/Icon";
const initial = {
  completed: [],
  sound: false,
  reduced: false,
  saved: null,
  daily: {},
};
const stamp = () => new Date().toLocaleDateString("en-CA");
const fmt = (n) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
function FlowingArrow({
  route,
  length = 46,
  duration = 14000,
  delay = 0,
  escape = false,
  onMove,
}) {
  const guide = useRef(null),
    body = useRef(null),
    head = useRef(null);
  useEffect(() => {
    let frame;
    const path = guide.current,
      total = path.getTotalLength();
    let origin;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const draw = (distance) => {
      const end = Math.min(total, distance),
        start = Math.max(0, distance - length);
      const points = [];
      for (let t = start; t < end; t += 3) {
        const p = path.getPointAtLength(t);
        points.push(`${points.length ? "L" : "M"}${p.x} ${p.y}`);
      }
      const p = path.getPointAtLength(end);
      points.push(`${points.length ? "L" : "M"}${p.x} ${p.y}`);
      body.current.setAttribute("d", points.join(" "));
      const before = path.getPointAtLength(Math.max(0, end - 1));
      const angle =
        (Math.atan2(p.y - before.y, p.x - before.x) * 180) / Math.PI;
      head.current.setAttribute(
        "transform",
        `translate(${p.x} ${p.y}) rotate(${angle})`,
      );
    };
    const tick = (now) => {
      origin ??= now;
      const t = now - origin;
      const distance = escape
        ? Math.min(
            total,
            length + (total - length) * Math.min(1, t / duration) ** 1.35,
          )
        : (((t + delay) % duration) / duration) * (total + length);
      draw(distance);
      if (!escape || t < duration) frame = requestAnimationFrame(tick);
    };
    if (reduced && escape) draw(total);
    else frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [route, length, duration, delay, escape]);
  return (
    <g className={escape ? "flow-escape" : "ambient-flex"} onClick={onMove}>
      <path ref={guide} d={route} fill="none" stroke="none" />
      <path ref={body} className="visible-path" />
      <path ref={head} d="m-10-8 10 8-10 8" className="visible-path" />
    </g>
  );
}
function BlockedArrow({ path, paths, unit, offset }) {
  const body = useRef(null),
    head = useRef(null);
  useEffect(() => {
    const vectors = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] },
      [dx, dy] = vectors[path.d],
      [hx, hy] = path.cells[0];
    const obstacles = paths
      .flatMap((p) => p.cells)
      .map(([x, y]) => ({
        distance: (x - hx) * dx + (y - hy) * dy,
        aligned: dx ? y === hy : x === hx,
      }))
      .filter((p) => p.aligned && p.distance > 0);
    const travel = Math.max(
      0,
      Math.min(...obstacles.map((p) => p.distance)) * unit - 9,
    );
    const cells = path.cells.slice().reverse(),
      points = cells.map(([x, y]) => [offset + x * unit, offset + y * unit]);
    if (points.length === 1)
      points.unshift([points[0][0] - dx * 15, points[0][1] - dy * 15]);
    const lengths = [0];
    for (let i = 1; i < points.length; i++)
      lengths.push(
        lengths.at(-1) +
          Math.hypot(
            points[i][0] - points[i - 1][0],
            points[i][1] - points[i - 1][1],
          ),
      );
    const original = lengths.at(-1);
    points.push([
      points.at(-1)[0] + dx * travel,
      points.at(-1)[1] + dy * travel,
    ]);
    lengths.push(original + travel);
    const at = (distance) => {
      let i = 1;
      while (i < lengths.length - 1 && lengths[i] < distance) i++;
      const t =
        (distance - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1);
      return [
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
      ];
    };
    const draw = (shift) => {
      const a = at(shift),
        b = at(original + shift),
        middle = points.filter(
          (p, i) => lengths[i] > shift && lengths[i] < original + shift,
        );
      body.current.setAttribute(
        "d",
        [a, ...middle, b]
          .map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`)
          .join(" "),
      );
      head.current.setAttribute(
        "transform",
        `translate(${b[0]} ${b[1]}) rotate(${(Math.atan2(dy, dx) * 180) / Math.PI})`,
      );
    };
    let frame, start;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = (now) => {
      start ??= now;
      const t = Math.min(1, (now - start) / 650);
      const shift =
        t < 0.4
          ? travel * (1 - (1 - t / 0.4) ** 2)
          : travel * (1 - (t - 0.4) / 0.6) ** 2;
      draw(reduced ? 0 : shift);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [path, paths, unit, offset]);
  return (
    <g className="collision-arrow">
      <path ref={body} className="visible-path" />
      <path ref={head} d="m-10-9 10 9-10 9" className="visible-path" />
    </g>
  );
}
function Board({ paths, size, onMove, active, hint, decorative = false }) {
  const unit = 40,
    offset = 26,
    extent = (size - 1) * unit + offset * 2;
  return (
    <svg
      className={`puzzle-svg ${hint !== null && hint !== undefined ? "showing-hint" : ""}`}
      viewBox={`0 0 ${extent} ${extent}`}
      role={decorative ? "img" : "group"}
      aria-label="Arrow escape puzzle"
    >
      {Array.from({ length: size * size }, (_, i) => (
        <circle
          key={i}
          cx={offset + (i % size) * unit}
          cy={offset + Math.floor(i / size) * unit}
          r="1.3"
          fill="#34404d"
        />
      ))}
      {paths.map((p, i) => {
        const pts = p.cells.slice().reverse(),
          [x, y] = p.cells[0],
          angles = { right: 0, down: 90, left: 180, up: 270 };
        const d = pts
          .map(
            ([x, y], j) =>
              `${j ? "L" : "M"}${offset + x * unit} ${offset + y * unit}`,
          )
          .join(" ");
        return (
          <g
            key={p.id}
            className={`puzzle-path tone-${i % 5} ${active?.id === p.id ? active.type : ""} ${hint === p.id ? "hinted" : ""}`}
            style={{
              "--tx":
                p.d === "right" ? "650px" : p.d === "left" ? "-650px" : "0px",
              "--ty":
                p.d === "down" ? "650px" : p.d === "up" ? "-650px" : "0px",
            }}
            tabIndex={decorative ? undefined : 0}
            role={decorative ? undefined : "button"}
            aria-label={`Path ${p.id + 1}, points ${p.d}. Activate to escape.`}
            onClick={() => !decorative && onMove(p)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onMove(p);
              }
            }}
          >
            {active?.id === p.id && active.type === "blocked" ? (
              <BlockedArrow
                path={p}
                paths={paths}
                unit={unit}
                offset={offset}
              />
            ) : active?.id === p.id && active.type === "escaping" ? (
              <FlowingArrow
                route={`${d} L${offset + x * unit + { right: 1, left: -1, up: 0, down: 0 }[p.d] * 700} ${offset + y * unit + { right: 0, left: 0, up: -1, down: 1 }[p.d] * 700}`}
                length={Math.max(15, (p.cells.length - 1) * unit)}
                duration={650}
                escape
              />
            ) : (
              <>
                <path
                  d={
                    p.cells.length === 1
                      ? `M${offset + x * unit - { right: 1, left: -1, up: 0, down: 0 }[p.d] * 15} ${offset + y * unit - { right: 0, left: 0, up: -1, down: 1 }[p.d] * 15} L${offset + x * unit} ${offset + y * unit}`
                      : d
                  }
                  className="hit-path"
                />
                <path
                  d={
                    p.cells.length === 1
                      ? `M${offset + x * unit - { right: 1, left: -1, up: 0, down: 0 }[p.d] * 15} ${offset + y * unit - { right: 0, left: 0, up: -1, down: 1 }[p.d] * 15} L${offset + x * unit} ${offset + y * unit}`
                      : d
                  }
                  className="visible-path"
                />
                <path
                  transform={`translate(${offset + x * unit} ${offset + y * unit}) rotate(${angles[p.d]})`}
                  d="m-10-9 10 9-10 9"
                  className="visible-path"
                />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
export default function Game() {
  const [screen, setScreen] = useState("home"),
    [menuOpen, setMenuOpen] = useState(false),
    [levelPage, setLevelPage] = useState(0),
    [store, setStore] = useState(initial),
    [ready, setReady] = useState(false),
    [game, setGame] = useState(null),
    [active, setActive] = useState(null),
    [hint, setHint] = useState(null),
    [message, setMessage] = useState(""),
    [confirm, setConfirm] = useState(false);
  const audio = useRef(null),
    lock = useRef(false),
    settingsOrigin = useRef("home"),
    menuToggle = useRef(null),
    menuPanel = useRef(null),
    latestGame = useRef(null);
  latestGame.current = game;
  const unlockedLevel = store.completed.reduce(
    (max, n) => Math.max(max, n + 1),
    1,
  );
  useEffect(() => {
    if (screen === "levels") setLevelPage(Math.floor((unlockedLevel - 1) / 24));
  }, [screen]);
  const dailyPreview = useMemo(
    () =>
      screen === "daily"
        ? createDaily(Number(stamp().replaceAll("-", "")))
        : null,
    [screen],
  );
  const todayResult = store.daily[stamp()];
  function currentStreak() {
    let count = 0,
      day = new Date();
    if (!store.daily[stamp()]?.done) day.setDate(day.getDate() - 1);
    while (store.daily[day.toLocaleDateString("en-CA")]?.done) {
      count++;
      day.setDate(day.getDate() - 1);
    }
    return count;
  }
  useEffect(() => {
    setMenuOpen(false);
  }, [screen]);
  useEffect(() => {
    if (!menuOpen) return;
    menuPanel.current?.querySelector("button")?.focus();
    const handler = (e) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuToggle.current?.focus();
      }
      if (e.key === "Tab") {
        const nodes = [...menuPanel.current.querySelectorAll("button")],
          first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [menuOpen]);
  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem("arrowout-v2"));
      if (data) {
        if (data.saved?.mistakes >= 3) data.saved = null;
        if (data.saved?.paths.some((p) => !isFree(p, [p], data.saved.size)))
          data.saved = null;
        setStore({ ...initial, ...data });
      }
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem("arrowout-v2", JSON.stringify(store));
      } catch {}
  }, [store, ready]);
  useEffect(() => {
    if (screen !== "game") return;
    const t = setInterval(
      () => setGame((g) => ({ ...g, time: g.time + 1 })),
      1000,
    );
    const visibility = () => {
      if (document.hidden) setScreen("pause");
    };
    const keys = (e) => {
      if (e.key === "Escape") setScreen("pause");
    };
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("keydown", keys);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("keydown", keys);
    };
  }, [screen]);
  useEffect(() => {
    if (
      game &&
      screen !== "result" &&
      screen !== "loss" &&
      !game.daily &&
      !game.challenge
    )
      setStore((s) => ({ ...s, saved: game }));
  }, [game, screen]);
  useEffect(() => {
    if (screen === "game" && game?.challenge && game.time >= game.timeLimit) {
      setMessage("Time’s up. Try a fresh approach.");
      setScreen("loss");
    }
  }, [screen, game?.time, game?.challenge]);
  function start(level = 1, daily = false, resume = false, challenge = false) {
    const { size, paths, profile, timeLimit } = challenge
      ? createChallenge(level)
      : daily
        ? createDaily(Number(stamp().replaceAll("-", "")))
        : createLevel(level);
    setGame(
      resume && store.saved
        ? store.saved
        : {
            level,
            daily,
            challenge,
            timeLimit: challenge ? timeLimit : null,
            size,
            profile,
            paths,
            total: paths.length,
            history: [],
            mistakes: 0,
            time: 0,
          },
    );
    setScreen("game");
    setActive(null);
    setHint(null);
    setMessage("");
    if (daily)
      setStore((s) => ({
        ...s,
        daily: {
          ...s.daily,
          [stamp()]: {
            ...s.daily[stamp()],
            attempts: (s.daily[stamp()]?.attempts || 0) + 1,
          },
        },
      }));
  }
  function slideSound() {
    if (!store.sound) return;
    try {
      audio.current ??= new (
        window.AudioContext || window.webkitAudioContext
      )();
      const ctx = audio.current;
      ctx.resume();
      const start = ctx.currentTime,
        duration = 0.48;
      const buffer = ctx.createBuffer(
          1,
          Math.ceil(ctx.sampleRate * duration),
          ctx.sampleRate,
        ),
        samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++)
        samples[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource(),
        filter = ctx.createBiquadFilter(),
        gain = ctx.createGain();
      source.buffer = buffer;
      filter.type = "bandpass";
      filter.Q.value = 0.65;
      filter.frequency.setValueAtTime(450, start);
      filter.frequency.exponentialRampToValueAtTime(2300, start + 0.25);
      filter.frequency.exponentialRampToValueAtTime(700, start + duration);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(start);
      source.stop(start + duration);
    } catch {}
  }
  function impactSound(delay = 0) {
    if (!store.sound) return;
    try {
      audio.current ??= new (
        window.AudioContext || window.webkitAudioContext
      )();
      const ctx = audio.current;
      ctx.resume();
      const start = ctx.currentTime + delay;
      // A quick low knock plus filtered noise gives the impact a tactile edge.
      const knock = ctx.createOscillator(),
        envelope = ctx.createGain();
      knock.type = "sine";
      knock.frequency.setValueAtTime(190, start);
      knock.frequency.exponentialRampToValueAtTime(65, start + 0.09);
      envelope.gain.setValueAtTime(0.4, start);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
      knock.connect(envelope);
      envelope.connect(ctx.destination);
      knock.start(start);
      knock.stop(start + 0.17);
      const buffer = ctx.createBuffer(
          1,
          Math.ceil(ctx.sampleRate * 0.12),
          ctx.sampleRate,
        ),
        samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++)
        samples[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(),
        filter = ctx.createBiquadFilter(),
        gain = ctx.createGain();
      noise.buffer = buffer;
      filter.type = "bandpass";
      filter.frequency.value = 1500;
      filter.Q.value = 1.4;
      gain.gain.setValueAtTime(0.2, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.11);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(start);
      noise.stop(start + 0.12);
    } catch {}
  }
  function victorySound() {
    if (!store.sound) return;
    try {
      audio.current ??= new (
        window.AudioContext || window.webkitAudioContext
      )();
      const ctx = audio.current;
      ctx.resume();
      const start = ctx.currentTime;
      // A rising major arpeggio resolves into a soft, sustained victory chord.
      [
        [523.25, 0, 0.22],
        [659.25, 0.09, 0.24],
        [783.99, 0.18, 0.28],
        [1046.5, 0.29, 0.65],
        [659.25, 0.29, 0.65],
        [783.99, 0.29, 0.65],
      ].forEach(([frequency, delay, duration]) => {
        const oscillator = ctx.createOscillator(),
          gain = ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0, start + delay);
        gain.gain.linearRampToValueAtTime(0.035, start + delay + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, start + delay + duration);
        oscillator.start(start + delay);
        oscillator.stop(start + delay + duration + 0.02);
      });
    } catch {}
  }
  async function move(p) {
    if (lock.current || screen !== "game") return;
    lock.current = true;
    setHint(null);
    const free = isFree(p, game.paths, game.size);
    if (free) slideSound();
    else
      impactSound(
        store.reduced || matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 0.26,
      );
    setActive({ id: p.id, type: free ? "escaping" : "blocked" });
    if (!free) {
      setGame((g) => ({ ...g, mistakes: g.mistakes + 1 }));
      setMessage(
        game.mistakes >= 2
          ? "Last heart lost. Try a fresh approach."
          : "A path is in the way. One heart lost.",
      );
    }
    await new Promise((r) =>
      setTimeout(
        r,
        store.reduced || matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 650,
      ),
    );
    if (game.challenge && latestGame.current?.time >= game.timeLimit) {
      setActive(null);
      lock.current = false;
      setMessage("Time’s up. Try again.");
      setScreen("loss");
      return;
    }
    if (!free && game.mistakes >= 2) {
      setScreen("loss");
      if (!game.daily && !game.challenge)
        setStore((s) => ({ ...s, saved: null }));
    }
    if (free) {
      const next = {
        ...game,
        time: latestGame.current.time,
        paths: game.paths.filter((a) => a.id !== p.id),
        history: [...game.history, p],
      };
      setGame(next);
      setMessage("");
      if (!next.paths.length) {
        victorySound();
        setScreen("result");
        setStore((s) =>
          game.challenge
            ? {
                ...s,
                challengeCompleted: [
                  ...new Set([...(s.challengeCompleted || []), game.level]),
                ],
              }
            : game.daily
              ? {
                  ...s,
                  daily: {
                    ...s.daily,
                    [stamp()]: {
                      ...s.daily[stamp()],
                      done: true,
                      best: Math.min(
                        s.daily[stamp()]?.best ?? Infinity,
                        game.time,
                      ),
                    },
                  },
                }
              : {
                  ...s,
                  saved: null,
                  completed: [...new Set([...s.completed, game.level])],
                },
        );
      }
    }
    setActive(null);
    lock.current = false;
  }
  const progress = game ? (game.total - game.paths.length) / game.total : 0;
  function hintMove() {
    if (lock.current || screen !== "game") return;
    const choices = game.paths.filter((p) => isFree(p, game.paths, game.size));
    const p = choices.find((p) => p.id !== hint) || choices[0];
    if (p) {
      setHint(p.id);
      setMessage(
        `Tap the bright gold arrow pointing ${p.d}. Its path is clear.`,
      );
    } else
      setMessage("No clear path remains. Start fresh to reset this board.");
  }
  async function share() {
    const text = `ARROW//OUT ↗ ${game.daily ? stamp() : `Level ${game.level}`}\n${fmt(game.time)} · ${game.mistakes} mistakes`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setMessage("Copied. Share your little victory.");
      }
    } catch {
      setMessage(text);
    }
  }
  return (
    <div
      className={`app-shell ${screen === "home" ? "is-home" : ""} ${store.reduced ? "reduced" : ""}`}
    >
      <header>
        <button className="wordmark" onClick={() => setScreen("home")}>
          ARROW<span>//</span>OUT <Icon name="arrow" />
        </button>
        <nav>
          <button
            className={screen === "levels" ? "selected" : ""}
            onClick={() => setScreen("levels")}
          >
            Levels
          </button>
          <button
            className={screen === "daily" ? "selected" : ""}
            onClick={() => setScreen("daily")}
          >
            Daily Challenge{" "}
            <span className="purple">
              <Icon name="sparkles" />
            </span>
          </button>
          <button onClick={() => setScreen("challenge")}>Challenge</button>
          <button
            className="icon-button"
            aria-label="Settings"
            onClick={() => {
              settingsOrigin.current = screen;
              setScreen("settings");
            }}
          >
            <Icon name="settings" />
          </button>
        </nav>
        <button
          ref={menuToggle}
          className="mobile-menu-toggle icon-button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Icon name={menuOpen ? "close" : "menu"} />
        </button>
      </header>
      {menuOpen && (
        <>
          <button
            className="menu-backdrop"
            aria-label="Close menu"
            onClick={() => {
              setMenuOpen(false);
              menuToggle.current?.focus();
            }}
          />
          <div
            ref={menuPanel}
            id="mobile-navigation"
            className="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <div className="menu-heading">
              Explore
              <button
                className="icon-button"
                aria-label="Close navigation"
                onClick={() => {
                  setMenuOpen(false);
                  menuToggle.current?.focus();
                }}
              >
                <Icon name="close" />
              </button>
            </div>
            <button
              onClick={() => {
                setScreen("home");
                setMenuOpen(false);
              }}
            >
              <Icon name="play" />
              Play
              <Icon name="arrow" />
            </button>
            <button
              onClick={() => {
                setScreen("levels");
                setMenuOpen(false);
              }}
            >
              <Icon name="grid" />
              Levels
              <Icon name="arrow" />
            </button>
            <button
              onClick={() => {
                setScreen("daily");
                setMenuOpen(false);
              }}
            >
              <Icon name="sparkles" />
              Daily challenge
              <Icon name="arrow" />
            </button>
            <button
              onClick={() => {
                setScreen("challenge");
                setMenuOpen(false);
              }}
            >
              <Icon name="hint" />
              Timed challenge
              <Icon name="arrow" />
            </button>
            <button
              onClick={() => {
                settingsOrigin.current = screen;
                setScreen("settings");
                setMenuOpen(false);
              }}
            >
              <Icon name="settings" />
              Settings
              <Icon name="arrow" />
            </button>
          </div>
        </>
      )}
      <main key={screen}>
        {screen === "home" ? (
          <section className="title-screen">
            <div className="arrow-atmosphere" aria-hidden="true">
              <svg viewBox="0 0 1440 900" preserveAspectRatio="none">
                <defs>
                  <marker
                    id="ambient-head"
                    markerWidth="7"
                    markerHeight="7"
                    refX="5"
                    refY="3.5"
                    orient="auto"
                  >
                    <path
                      d="M1 1 5 3.5 1 6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                  </marker>
                </defs>
                {[
                  "M-140 140H410V260H1580",
                  "M1580 750H1050V630H-140",
                  "M240-140V380H390V1040",
                  "M1200 1040V510H1080V-140",
                  "M-140 450H570V560H1580",
                  "M1580 40H850V800H-140",
                ].map((d, i) => (
                  <g
                    key={d}
                    className={`ambient-arrow ambient-${i}`}
                    style={{
                      "--delay": `${-i * 2.1}s`,
                      "--duration": `${13 + (i % 3) * 3}s`,
                    }}
                  >
                    <path className="ambient-rail" d={d} />
                    <FlowingArrow
                      route={d}
                      length={90}
                      duration={(13 + (i % 3) * 3) * 1000}
                      delay={i * 2100}
                    />
                  </g>
                ))}
              </svg>
            </div>
            <div className="title-content">
              <div className="title-kicker">
                <span /> A PUZZLE OF PATHS & POSSIBILITIES <span />
              </div>
              <h1 className="game-title">
                ARROW<span className="title-slashes">//</span>
                <br />
                <span className="title-out">
                  OUT
                  <Icon name="arrow" />
                </span>
              </h1>
              <p className="title-tagline">Think. Tap. Escape.</p>
              <div className="title-actions">
                <button
                  className="primary title-play"
                  onClick={() => start(unlockedLevel, false, !!store.saved)}
                >
                  <Icon name="play" />
                  {store.saved ? "Continue playing" : "Play"}
                  <span className="play-arrow">
                    <Icon name="arrow" />
                  </span>
                </button>
                <button
                  className="daily-link"
                  onClick={() => setScreen("daily")}
                >
                  <span>
                    <Icon name="sparkles" />
                  </span>{" "}
                  Daily challenge <Icon name="arrow" />
                </button>
              </div>
              <div className="title-progress">
                <span className="mini-bars">
                  {Array.from({ length: 24 }, (_, i) => (
                    <i
                      key={i}
                      className={store.completed.includes(i + 1) ? "done" : ""}
                    />
                  ))}
                </span>
                <span>
                  {store.completed.length} LEVELS CLEARED · ENDLESS JOURNEY
                </span>
              </div>
            </div>
          </section>
        ) : screen === "game" ? (
          <section
            className={`game-stage ${game.challenge ? "timed-game" : ""}`}
          >
            <div className="play-layout">
              <aside className="left-info">
                <div className="game-heading">
                  <button
                    className="icon-button"
                    aria-label="Back to home"
                    onClick={() => setScreen("home")}
                  >
                    <Icon name="back" />
                  </button>
                  <div>
                    <div className="kicker">
                      {game.daily
                        ? new Date()
                            .toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                            .toUpperCase()
                        : `CHAPTER 0${Math.floor((game.level - 1) / 8) + 1} / ${["THE ESSENTIALS", "A DIFFERENT PERSPECTIVE", "THE DEEP END"][Math.min(2, Math.floor((game.level - 1) / 8))]}`}
                    </div>
                    <h2>
                      {game.daily
                        ? "Daily puzzle"
                        : game.challenge
                          ? `Challenge ${game.level}`
                          : `Level ${String(game.level).padStart(2, "0")}`}
                      <span>.</span>
                    </h2>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Pause"
                    onClick={() => setScreen("pause")}
                  >
                    <Icon name="pause" />
                  </button>
                </div>
                <div className="board-meta">
                  <span>ESCAPED</span>
                  <span>
                    {game.total - game.paths.length}
                    <b> / {game.total}</b>
                  </span>
                </div>
                <div className="progress">
                  <span style={{ width: `${progress * 100}%` }} />
                </div>
                <div className="stat">
                  <span>{game.challenge ? "TIME LEFT" : "ELAPSED"}</span>
                  <strong>
                    {fmt(
                      game.challenge
                        ? Math.max(0, game.timeLimit - game.time)
                        : game.time,
                    )}
                  </strong>
                </div>
                <div className="stat hearts-stat">
                  <span>HEARTS</span>
                  <strong
                    className="hearts"
                    aria-label={`${Math.max(0, 3 - game.mistakes)} of 3 hearts remaining`}
                  >
                    {Array.from({ length: 3 }, (_, i) => (
                      <span
                        key={i}
                        className={
                          i < 3 - game.mistakes ? "heart-full" : "heart-empty"
                        }
                      >
                        <Icon name="heart" />
                      </span>
                    ))}
                  </strong>
                </div>
                <div className="difficulty">
                  {Array.from({ length: 4 }, (_, i) => (
                    <i
                      key={i}
                      className={
                        i <
                        { easy: 1, medium: 2, hard: 4 }[
                          (game.profile ?? levelProfile(game.level, game.daily))
                            .difficulty
                        ]
                          ? ""
                          : "dim"
                      }
                    />
                  ))}
                  <span>
                    {
                      (game.profile ?? levelProfile(game.level, game.daily))
                        .label
                    }
                  </span>
                </div>
              </aside>
              <div className="board-area">
                <div
                  className="game-board"
                  style={{ "--board-width": `${(game.size - 1) * 22 + 52}px` }}
                >
                  <span className="corner tl" />
                  <span className="corner tr" />
                  <span className="corner bl" />
                  <span className="corner br" />
                  <Board
                    paths={game.paths}
                    size={game.size}
                    onMove={move}
                    active={active}
                    hint={hint}
                  />
                </div>
              </div>
              <aside className="right-info">
                <p className="feedback" role="status">
                  {message || ""}
                </p>
                <div className="tools">
                  <button onClick={hintMove}>
                    <Icon name="hint" />
                    Hint
                  </button>
                  <button
                    className="start-fresh-button"
                    onClick={() =>
                      start(game.level, game.daily, false, game.challenge)
                    }
                  >
                    <Icon name="reset" />
                    Start fresh
                  </button>
                </div>
              </aside>
            </div>
          </section>
        ) : screen === "levels" ? (
          <section className="collection">
            <div className="kicker">THE ENDLESS JOURNEY</div>
            <h1>
              Your way forward<span>.</span>
            </h1>
            <p className="subheading">
              A new puzzle at every step. {store.completed.length} levels
              cleared.
            </p>
            <div className="journey-navigation">
              <button onClick={() => start(unlockedLevel)} className="primary">
                Play level {unlockedLevel}
                <Icon name="play" />
              </button>
              <div>
                <button
                  aria-label="Previous levels"
                  disabled={levelPage === 0}
                  onClick={() => setLevelPage((p) => p - 1)}
                >
                  <Icon name="back" />
                </button>
                <span>
                  {levelPage * 24 + 1}–{levelPage * 24 + 24}
                </span>
                <button
                  aria-label="Next levels"
                  onClick={() => setLevelPage((p) => p + 1)}
                >
                  <Icon name="arrow" />
                </button>
              </div>
            </div>
            {Array.from({ length: 3 }, (_, pack) => (
              <div className="pack" key={pack}>
                <div className="pack-heading">
                  <span className="pack-index">
                    {String(levelPage * 3 + pack + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3>Chapter {levelPage * 3 + pack + 1}</h3>
                    <p>Find a fresh perspective.</p>
                  </div>
                </div>
                <div className="level-grid">
                  {Array.from({ length: 8 }, (_, i) => {
                    const n = levelPage * 24 + pack * 8 + i + 1,
                      done = store.completed.includes(n),
                      unlocked = n <= unlockedLevel;
                    return (
                      <button
                        key={n}
                        disabled={!unlocked}
                        className={
                          done ? "cleared" : unlocked ? "available" : ""
                        }
                        onClick={() => start(n)}
                      >
                        <span>
                          {n}
                          <small className="level-difficulty">
                            {levelProfile(n).difficulty}
                          </small>
                        </span>
                        {done ? (
                          <Icon name="check" />
                        ) : unlocked ? (
                          <Icon name="arrow" />
                        ) : (
                          <Icon name="lock" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        ) : screen === "challenge" ? (
          <section className="collection challenge-selection">
            <div className="kicker">THREE HEARTS. ONE CLOCK.</div>
            <h1>
              Beat the clock<span>.</span>
            </h1>
            <p className="subheading">
              Clear every path before time runs out. Each wrong tap costs a
              heart. Time is calculated for each board.
            </p>
            <div className="challenge-rules">
              {[
                ["Easy", "Small, gentle boards"],
                ["Medium", "More connected paths"],
                ["Hard", "Deeper blocking chains"],
              ].map(([name, time]) => (
                <div key={name}>
                  <strong>{name}</strong>
                  <span>{time}</span>
                </div>
              ))}
            </div>
            <button
              className="primary"
              onClick={() =>
                start(
                  (store.challengeCompleted || []).reduce(
                    (n, v) => Math.max(n, v + 1),
                    1,
                  ),
                  false,
                  false,
                  true,
                )
              }
            >
              Start next challenge
              <Icon name="play" />
            </button>
            <div className="pack">
              <div className="level-grid">
                {Array.from({ length: 8 }, (_, i) => {
                  const n =
                    (store.challengeCompleted || []).reduce(
                      (max, v) => Math.max(max, v + 1),
                      1,
                    ) + i;
                  return (
                    <button
                      className="available"
                      key={n}
                      onClick={() => start(n, false, false, true)}
                    >
                      <span>
                        {n}
                        <small className="level-difficulty">
                          {levelProfile(n).difficulty}
                        </small>
                      </span>
                      <Icon name="arrow" />
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        ) : screen === "daily" ? (
          <section className="daily-experience">
            <div className="daily-intro">
              <div className="daily-date">
                <Icon name="sparkles" />
                <span>
                  {new Date()
                    .toLocaleDateString("en-US", {
                      month: "short",
                      day: "2-digit",
                      year: "numeric",
                    })
                    .toUpperCase()}
                </span>
                <span className="daily-number">
                  DAILY / {stamp().replaceAll("-", "")}
                </span>
              </div>
              <h1>
                A fresh
                <br />
                way <em>through.</em>
              </h1>
              <p className="daily-description">
                One puzzle for today. Make a little room
                <br />
                and find your moment of clarity.
              </p>
              <div className="daily-status">
                <span
                  className={
                    todayResult?.done ? "status-dot complete-dot" : "status-dot"
                  }
                />
                {todayResult?.done
                  ? "Today’s puzzle cleared"
                  : "Today’s puzzle is ready"}
                <span className="daily-difficulty">MEDIUM</span>
              </div>
              <button
                className="primary daily-play"
                onClick={() => start(null, true)}
              >
                <Icon name="play" />
                {todayResult?.done ? "Play again" : "Play daily challenge"}
                <Icon name="arrow" />
              </button>
              <div className="daily-record">
                <div>
                  <strong>
                    {currentStreak()}
                    <small> days</small>
                  </strong>
                  <span>CURRENT STREAK</span>
                </div>
                <div>
                  <strong>{todayResult?.attempts || 0}</strong>
                  <span>ATTEMPTS TODAY</span>
                </div>
                <div>
                  <strong>
                    {todayResult?.best != null ? fmt(todayResult.best) : "—"}
                  </strong>
                  <span>BEST TIME</span>
                </div>
              </div>
              <p className="daily-reset">
                A new puzzle arrives at midnight, your local time.
              </p>
            </div>
            <div className="daily-preview">
              <div className="daily-preview-top">
                <span>TODAY’S TANGLE</span>
                <span>{dailyPreview?.paths.length} PATHS</span>
              </div>
              <div className="daily-preview-board">
                {dailyPreview && (
                  <Board
                    paths={dailyPreview.paths}
                    size={dailyPreview.size}
                    decorative
                  />
                )}
              </div>
              <div className="daily-preview-bottom">
                <span>
                  <Icon name="heart" /> 3 hearts
                </span>
                <span>Same puzzle. A new perspective.</span>
              </div>
            </div>
          </section>
        ) : screen === "result" || screen === "loss" ? (
          <section
            className={`result-screen ${screen === "loss" ? "loss-screen" : ""}`}
          >
            <div className="victory-graffiti" aria-hidden="true">
              <svg viewBox="0 0 800 420">
                <defs>
                  <filter id="spray-soft">
                    <feGaussianBlur stdDeviation="1.8" />
                  </filter>
                </defs>
                <g className="graffiti-spray" filter="url(#spray-soft)">
                  <path
                    d="M100 200 220 120 400 175 595 80 720 180 620 270 390 235 170 315"
                    fill="none"
                    stroke="#967aff"
                    strokeWidth="55"
                    strokeLinecap="round"
                    opacity=".12"
                  />
                  <path
                    d="M150 265 325 150 560 240 675 145"
                    fill="none"
                    stroke="#67ddf5"
                    strokeWidth="38"
                    strokeLinecap="round"
                    opacity=".16"
                  />
                </g>
                <g fill="#67ddf5" opacity=".5">
                  {Array.from({ length: 48 }, (_, i) => (
                    <circle
                      key={i}
                      cx={75 + ((i * 137) % 650)}
                      cy={55 + ((i * 83) % 310)}
                      r={1 + (i % 3)}
                    />
                  ))}
                </g>
                <g transform="translate(400 220) rotate(-9)">
                  <text
                    className="graffiti-outline"
                    x="0"
                    y="0"
                    textAnchor="middle"
                  >
                    {screen === "loss" ? "TRY AGAIN!" : "CLEARED!"}
                  </text>
                  <text
                    className="graffiti-tag"
                    x="0"
                    y="0"
                    textAnchor="middle"
                  >
                    {screen === "loss" ? "TRY AGAIN!" : "CLEARED!"}
                  </text>
                  <path
                    d="M-180 25Q-20 70 180 10M-135 46Q10 77 130 38"
                    fill="none"
                    stroke="#67ddf5"
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                </g>
                <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path
                    d="m75 255 55-85 30 25 35-85m-38 10 38-10-3 40"
                    stroke="#51d6a1"
                    strokeWidth="7"
                  />
                  <path
                    d="m615 300 35-45 25 17 45-80m-36 15 36-15 4 37"
                    stroke="#967aff"
                    strokeWidth="7"
                  />
                  <path
                    d="m560 52 7 20 21 5-20 8-5 22-8-21-22-4 21-9Z"
                    stroke="#67ddf5"
                    strokeWidth="3"
                  />
                  <path
                    d="m228 305 5 14 15 4-14 6-4 15-6-14-15-3 14-7Z"
                    stroke="#967aff"
                    strokeWidth="3"
                  />
                  <path
                    d="m680 75 17 15m-8-24 5 32M90 115l-13-10m25-3-3-18"
                    stroke="#51d6a1"
                    strokeWidth="4"
                  />
                </g>
                <g
                  stroke="#967aff"
                  strokeWidth="4"
                  strokeLinecap="round"
                  opacity=".6"
                >
                  <path d="M530 233v36M546 238v17M275 234v26" />
                </g>
              </svg>
            </div>
            <div className="kicker">
              {game.daily
                ? "DAILY CHALLENGE"
                : game.challenge
                  ? "TIMED CHALLENGE"
                  : `LEVEL ${String(game.level).padStart(2, "0")}`}{" "}
              /{" "}
              {screen === "loss"
                ? game.challenge && game.time >= game.timeLimit
                  ? "TIME’S UP"
                  : "OUT OF HEARTS"
                : "COMPLETE"}
            </div>
            <h1>
              {screen === "loss" ? (
                <>
                  A fresh
                  <br />
                  <em>perspective.</em>
                </>
              ) : (
                <>
                  Beautifully
                  <br />
                  <em>untangled.</em>
                </>
              )}
            </h1>
            <p className="subheading">
              {screen === "loss"
                ? game.challenge && game.time >= game.timeLimit
                  ? "The clock ran out. Find your rhythm and try again."
                  : "Three hearts spent. There’s another way through."
                : "A little patience. A little space. You found the way."}
            </p>
            <div className="daily-stats">
              <div>
                <strong>{fmt(game.time)}</strong>
                <span>YOUR TIME</span>
              </div>
              <div>
                <strong>{Math.max(0, 3 - game.mistakes)} / 3</strong>
                <span>HEARTS LEFT</span>
              </div>
              <div>
                <strong>
                  {screen === "loss" ? (
                    "—"
                  ) : (
                    <span className="rating-stars">
                      {Array.from(
                        {
                          length:
                            game.mistakes === 0 ? 3 : game.mistakes < 2 ? 2 : 1,
                        },
                        (_, i) => (
                          <Icon key={i} name="star" />
                        ),
                      )}
                    </span>
                  )}
                </strong>
                <span>YOUR FLOW</span>
              </div>
            </div>
            <button
              className="primary big"
              onClick={() =>
                screen === "loss"
                  ? start(game.level, game.daily, false, game.challenge)
                  : game.daily
                    ? setScreen("daily")
                    : start(game.level + 1, false, false, game.challenge)
              }
            >
              {screen === "loss"
                ? "Restart level"
                : game.daily
                  ? "Back to daily"
                  : "Find the next way out"}
              <Icon name="arrow" />
            </button>
            <div className="result-actions">
              {screen !== "loss" && (
                <button
                  onClick={() =>
                    start(game.level, game.daily, false, game.challenge)
                  }
                >
                  Play again
                </button>
              )}
              {screen === "loss" ? (
                <button
                  onClick={() =>
                    setScreen(game.challenge ? "challenge" : "levels")
                  }
                >
                  Back to levels
                </button>
              ) : (
                <button onClick={share}>
                  Share your escape <Icon name="arrow" />
                </button>
              )}
            </div>
            <p className="feedback" role="status">
              {message}
            </p>
          </section>
        ) : (
          <section className="settings-screen">
            <button
              className="settings-back"
              onClick={() => {
                setConfirm(false);
                setScreen(
                  screen === "pause"
                    ? "game"
                    : settingsOrigin.current === "settings"
                      ? "home"
                      : settingsOrigin.current,
                );
              }}
            >
              <Icon name="back" /> Back
            </button>
            <div className="kicker">YOUR OWN PACE</div>
            <h1>
              {screen === "pause"
                ? "A moment to pause."
                : "Make yourself comfortable."}
            </h1>
            {screen === "pause" && (
              <button className="primary" onClick={() => setScreen("game")}>
                Back to the flow <Icon name="play" />
              </button>
            )}
            {[
              ["sound", "Sound", "Subtle tones. A little satisfaction."],
              [
                "reduced",
                "Reduce motion",
                "A calmer experience with less movement.",
              ],
            ].map(([key, title, desc]) => (
              <div className="setting-row" key={key}>
                <div>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={store[key]}
                  aria-label={title}
                  className={`switch ${store[key] ? "on" : ""}`}
                  onClick={() => {
                    if (key === "sound" && !store.sound) {
                      try {
                        audio.current ??= new (
                          window.AudioContext || window.webkitAudioContext
                        )();
                        audio.current.resume();
                      } catch {}
                    }
                    setStore((s) => ({ ...s, [key]: !s[key] }));
                  }}
                >
                  <span />
                </button>
              </div>
            ))}
            <div className="setting-row">
              <div>
                <h3>A fresh start</h3>
                <p>Clear saved levels and daily results on this device.</p>
              </div>
              <button
                className="reset-button"
                onClick={() => {
                  if (confirm) {
                    setStore(initial);
                    setGame(null);
                    setConfirm(false);
                    setScreen("home");
                  } else setConfirm(true);
                }}
              >
                {confirm ? "Confirm reset" : "Reset progress"}
              </button>
            </div>
            {confirm && (
              <button className="text-button" onClick={() => setConfirm(false)}>
                Keep my progress
              </button>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
