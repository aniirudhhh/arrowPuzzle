"use client";
import { useEffect, useState } from "react";
import { CHALLENGE_VERSION } from "../../paths";
const time = (ms) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
export default function ChallengeLeaderboard({
  challenge,
  onPlay,
  rankedState,
  results = false,
}) {
  const [selected, setSelected] = useState(challenge),
    [draft, setDraft] = useState(String(challenge)),
    [category, setCategory] = useState("unassisted"),
    [nickname, setNickname] = useState(""),
    [board, setBoard] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    try {
      setNickname(localStorage.getItem("arrow-nickname") || "");
    } catch {}
  }, []);
  useEffect(() => {
    setSelected(challenge);
    setDraft(String(challenge));
  }, [challenge]);
  useEffect(() => {
    if (results && rankedState?.attempt)
      setCategory(rankedState.attempt.hints ? "with-hints" : "unassisted");
  }, [results, rankedState?.attempt?.hints]);
  useEffect(() => {
    const controller = new AbortController();
    setBoard(null);
    setError("");
    fetch("/api/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "board", challenge: selected, category }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw Error(data.error);
        return data;
      })
      .then(setBoard)
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e.message || "Leaderboard unavailable.");
      });
    return () => controller.abort();
  }, [selected, category, rankedState?.status]);
  const own = board?.entries.find((entry) => entry.you);
  const busy = rankedState?.status === "starting";
  return (
    <section
      className="challenge-leaderboard"
      aria-label="Challenge leaderboard"
    >
      <div className="leaderboard-heading">
        <h2>{results ? "Your ranking" : "Challenge leaderboard"}</h2>
        <span>Rules v{CHALLENGE_VERSION}</span>
      </div>
      {!results && (
        <form
          className="leaderboard-filter"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(draft);
            if (Number.isSafeInteger(n) && n >= 1 && n <= 1000000)
              setSelected(n);
          }}
        >
          <label>
            Challenge
            <input
              type="number"
              min="1"
              max="1000000"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <button type="submit">View scores</button>
        </form>
      )}
      <div
        className="leaderboard-categories"
        role="group"
        aria-label="Assistance category"
      >
        {["unassisted", "with-hints"].map((value) => (
          <button
            key={value}
            aria-pressed={category === value}
            onClick={() => setCategory(value)}
          >
            {value === "unassisted" ? "Unassisted" : "With hints"}
          </button>
        ))}
      </div>
      {results && (
        <p role="status">
          {rankedState?.error ||
            (rankedState?.status === "completed"
              ? rankedState.attempt.eligible
                ? "Verified finish. Your best run is ranked."
                : "Practice finish � paused runs aren�t ranked."
              : "Verifying your finish�")}
        </p>
      )}
      {error ? (
        <p role="status">{error}</p>
      ) : !board ? (
        <p role="status">Loading scores�</p>
      ) : (
        <>
          <p className="leaderboard-own">
            {own
              ? `Your rank: #${own.rank} � ${time(own.duration_ms)} � ${own.hearts} hearts`
              : "No ranked result in this category yet."}
          </p>
          {board.entries.length === 0 ? (
            <p>Be the first to clear this challenge.</p>
          ) : (
            <ol className="leaderboard-list">
              {board.entries
                .filter((entry) => entry.position <= 10)
                .slice(0, 10)
                .map((entry, i) => (
                  <li
                    key={`${entry.nickname}-${i}`}
                    className={entry.you ? "is-you" : ""}
                  >
                    <span className="leaderboard-rank">#{entry.rank}</span>
                    <span className="leaderboard-name">
                      {entry.nickname}
                      {entry.you ? " (you)" : ""}
                    </span>
                    <span className="leaderboard-score">
                      {time(entry.duration_ms)}
                      <small>
                        {entry.hearts} hearts � {entry.hints} hints
                      </small>
                    </span>
                  </li>
                ))}
            </ol>
          )}
        </>
      )}
      {!results && (
        <div className="leaderboard-play">
          <label>
            Your nickname
            <input
              maxLength={24}
              minLength={2}
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                try {
                  localStorage.setItem("arrow-nickname", e.target.value);
                } catch {}
              }}
              placeholder="2�24 characters"
              autoComplete="nickname"
            />
          </label>
          <button
            className="primary"
            disabled={busy || nickname.trim().length < 2 || !!error || !board}
            onClick={() => onPlay(selected, nickname.trim())}
          >
            {busy ? "Preparing challenge�" : "Play ranked"}
          </button>
          <p>
            Anonymous profile saved in this browser. Pausing makes the run
            unranked.
          </p>
          {rankedState?.error && <p role="status">{rankedState.error}</p>}
        </div>
      )}
    </section>
  );
}
