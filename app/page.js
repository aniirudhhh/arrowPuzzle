"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  createPuzzle,
  isFree,
  createLevel,
  levelProfile,
  createDaily,
  createChallenge,
  challengeDefinition,
  CHALLENGE_VERSION,
} from "../paths";
import Icon from "./components/Icon";
import { Board } from "./components/Board";
import Multiplayer from "./components/Multiplayer";
import HomeAtmosphere from "./components/HomeAtmosphere";
import Link from "next/link";
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
  const challengeCompleted =
    store.challengeProgress?.[CHALLENGE_VERSION]?.completed || [];
  const nextChallenge = challengeCompleted.reduce(
    (n, v) => Math.max(n, v + 1),
    1,
  );
  const challengePreview = useMemo(
    () => (screen === "challenge" ? createChallenge(nextChallenge) : null),
    [screen, nextChallenge],
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
    const { size, paths, profile, timeLimit, version, seed } = challenge
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
            challengeVersion: challenge ? version : null,
            challengeSeed: challenge ? seed : null,
            hintsUsed: 0,
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
                challengeProgress: {
                  ...s.challengeProgress,
                  [game.challengeVersion]: {
                    completed: [
                      ...new Set([
                        ...(s.challengeProgress?.[game.challengeVersion]
                          ?.completed || []),
                        game.level,
                      ]),
                    ],
                    results: {
                      ...s.challengeProgress?.[game.challengeVersion]?.results,
                      [game.level]: [
                        ...(s.challengeProgress?.[game.challengeVersion]
                          ?.results?.[game.level] || []),
                        {
                          version: game.challengeVersion,
                          challenge: game.level,
                          seed: game.challengeSeed,
                          timeLimit: game.timeLimit,
                          completionTime: next.time,
                          heartsRemaining: 3 - next.mistakes,
                          hintsUsed: next.hintsUsed || 0,
                        },
                      ].slice(-10),
                    },
                  },
                },
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
      setGame((current) => ({
        ...current,
        hintsUsed: (current.hintsUsed || 0) + 1,
      }));
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
      {screen === "home" && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "VideoGame",
              name: "ArrowOut",
              alternateName: "ARROW//OUT",
              url: "https://arrowout.xyz/",
              description:
                "A free online arrow escape puzzle with endless levels, daily challenges, timed challenges, and two-player races.",
              genre: "Puzzle",
              gamePlatform: "Web browser",
              playMode: ["SinglePlayer", "MultiPlayer"],
              isAccessibleForFree: true,
              inLanguage: "en",
              image: "https://arrowout.xyz/opengraph-image",
            }),
          }}
        />
      )}
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
            Daily Challenge
          </button>
          <button onClick={() => setScreen("multiplayer")}>Friends</button>
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
                setScreen("multiplayer");
                setMenuOpen(false);
              }}
            >
              <Icon name="grid" />
              Play with friends
              <Icon name="arrow" />
            </button>
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
        {screen === "multiplayer" ? (
          <Multiplayer
            onSlide={slideSound}
            onImpact={impactSound}
            onWin={victorySound}
            reducedMotion={store.reduced}
            onUnlock={() => {
              if (!store.sound) return;
              try {
                audio.current ??= new (
                  window.AudioContext || window.webkitAudioContext
                )();
                audio.current.resume();
              } catch {}
            }}
          />
        ) : screen === "home" ? (
          <section className="title-screen">
            <HomeAtmosphere reduced={store.reduced} />
            <div className="title-content">
              <div className="title-kicker">
                <span /> A PUZZLE OF PATHS & POSSIBILITIES <span />
              </div>
              <h1 className="game-title">
                ARROW<span className="title-slashes">//</span>
                <span className="title-out">OUT</span>
              </h1>
              <p className="title-tagline">Think. Tap. Escape.</p>
              <p className="title-description">
                A free online arrow puzzle. Endless levels, daily challenges,
                and races with friends.
              </p>
              <Link className="how-to-link" href="/how-to-play">
                How to play
              </Link>
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
                  className="friend-cta"
                  onClick={() => setScreen("multiplayer")}
                >
                  Play with a friend <Icon name="arrow" />
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
                    onPreview={() => {
                      if (lock.current || screen !== "game") return false;
                      if (game.challenge)
                        setGame((current) => ({
                          ...current,
                          hintsUsed: (current.hintsUsed || 0) + 1,
                        }));
                      return true;
                    }}
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
              heart. Difficulty is mixed between rounds, with a fair timer for
              each board.
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
                  challengeCompleted.reduce((n, v) => Math.max(n, v + 1), 1),
                  false,
                  false,
                  true,
                )
              }
            >
              Start next challenge
              <Icon name="play" />
            </button>
            {challengePreview && (
              <p className="feedback">
                Next: {challengePreview.profile.difficulty} �{" "}
                {challengePreview.timeLimit} sec � 3 hearts
              </p>
            )}
            <div className="pack">
              <div className="level-grid">
                {Array.from({ length: 8 }, (_, i) => {
                  const n =
                    challengeCompleted.reduce(
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
                          {challengeDefinition(n).difficulty}
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
                    stroke="#778da9"
                    strokeWidth="55"
                    strokeLinecap="round"
                    opacity=".12"
                  />
                  <path
                    d="M150 265 325 150 560 240 675 145"
                    fill="none"
                    stroke="#e0e1dd"
                    strokeWidth="38"
                    strokeLinecap="round"
                    opacity=".16"
                  />
                </g>
                <g fill="#e0e1dd" opacity=".5">
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
                    stroke="#e0e1dd"
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
                    stroke="#778da9"
                    strokeWidth="7"
                  />
                  <path
                    d="m560 52 7 20 21 5-20 8-5 22-8-21-22-4 21-9Z"
                    stroke="#e0e1dd"
                    strokeWidth="3"
                  />
                  <path
                    d="m228 305 5 14 15 4-14 6-4 15-6-14-15-3 14-7Z"
                    stroke="#778da9"
                    strokeWidth="3"
                  />
                  <path
                    d="m680 75 17 15m-8-24 5 32M90 115l-13-10m25-3-3-18"
                    stroke="#51d6a1"
                    strokeWidth="4"
                  />
                </g>
                <g
                  stroke="#778da9"
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
