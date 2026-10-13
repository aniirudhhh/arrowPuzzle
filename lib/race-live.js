import { createClient } from "@supabase/supabase-js";
let client;
export async function subscribeToRace(auth, onRoom, onStatus) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    onStatus(false);
    return () => {};
  }
  client ??= createClient(url, key);
  let {
    data: { session },
  } = await client.auth.getSession();
  if (!session) {
    const signed = await client.auth.signInAnonymously();
    if (signed.error) throw signed.error;
    session = signed.data.session;
  }
  const response = await fetch("/api/race/realtime", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(auth),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error("Realtime subscription unavailable.");
  const { topic } = await response.json();
  await client.realtime.setAuth(session.access_token);
  const channel = client
    .channel(topic, { config: { private: true } })
    .on("broadcast", { event: "room" }, ({ payload }) => onRoom(payload))
    .subscribe((status) => onStatus(status === "SUBSCRIBED"));
  return () => {
    client.removeChannel(channel);
  };
}
