"use client";
import { useRef, useState } from "react";
async function request(body) {
  const response = await fetch("/api/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Could not sync ranked challenge.");
  return data;
}
export default function useRankedChallenge() {
  const [state, setState] = useState({
    status: "idle",
    attempt: null,
    error: "",
  });
  const session = useRef(null),
    generation = useRef(0),
    sending = useRef(false);
  function reset() {
    generation.current++;
    session.current = null;
    setState({ status: "idle", attempt: null, error: "" });
  }
  async function begin(challenge, nickname) {
    reset();
    const version = generation.current;
    setState({ status: "starting", attempt: null, error: "" });
    try {
      const data = await request({ action: "start", challenge, nickname });
      if (version !== generation.current) return null;
      session.current = {
        id: data.attempt.id,
        sequence: 0,
        queue: [],
        version,
      };
      const delay = Math.max(0, data.attempt.startAt - data.attempt.serverNow);
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (version !== generation.current) return null;
      setState({ status: "playing", attempt: data.attempt, error: "" });
      return data.attempt;
    } catch (error) {
      if (version === generation.current)
        setState({ status: "error", attempt: null, error: error.message });
      return null;
    }
  }
  function event(type, id) {
    const current = session.current;
    if (!current) return;
    current.queue.push({ type, id, sequence: ++current.sequence });
    flush();
  }
  async function flush() {
    if (sending.current) return;
    sending.current = true;
    try {
      while (session.current?.queue.length) {
        const current = session.current,
          batch = current.queue.slice(0, 32);
        let data, failure;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            data = await request({
              action: "events",
              id: current.id,
              events: batch,
            });
            break;
          } catch (error) {
            failure = error;
            if (current.version !== generation.current) break;
            await new Promise((resolve) =>
              setTimeout(resolve, 500 * (attempt + 1)),
            );
          }
        }
        if (current.version !== generation.current) continue;
        if (!data) {
          session.current = null;
          setState((previous) => ({
            ...previous,
            status: "error",
            error: failure.message + " This run cannot be ranked.",
          }));
          break;
        }
        current.queue.splice(0, batch.length);
        setState({
          status: data.attempt.status,
          attempt: data.attempt,
          error: "",
        });
      }
    } finally {
      sending.current = false;
      if (session.current?.queue.length) flush();
    }
  }
  return { state, begin, event, reset };
}
