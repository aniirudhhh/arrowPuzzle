import { createHash } from "node:crypto";
import { databasePool, storageFailure } from "../../../../lib/race-store.js";
export const runtime = "nodejs";
export async function POST(request) {
  try {
    if (!process.env.DATABASE_URL)
      return Response.json(
        { error: "Realtime requires shared storage." },
        { status: 503 },
      );
    const input = await request.json();
    const jwt = request.headers.get("authorization");
    if (
      !jwt?.startsWith("Bearer ") ||
      !/^[A-F0-9]{6}$/.test(input.code ?? "") ||
      typeof input.token !== "string"
    )
      return Response.json({ error: "Invalid room session." }, { status: 401 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key)
      return Response.json(
        { error: "Realtime is not configured." },
        { status: 503 },
      );
    const verified = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: jwt },
      signal: AbortSignal.timeout(10000),
    });
    if (!verified.ok)
      return Response.json(
        { error: "Invalid realtime session." },
        { status: 401 },
      );
    const user = await verified.json();
    const topic = `race:${input.code}:${createHash("md5").update(input.token).digest("hex")}`;
    // Membership can only be claimed with both a verified Auth session and room token.
    const result = await databasePool().query(
      `INSERT INTO public.arrow_live_members (user_id, topic, expires_at)
      SELECT $1::uuid, $2, expires_at FROM public.arrow_rooms
      WHERE code = $3 AND expires_at > now() AND EXISTS
        (SELECT 1 FROM jsonb_array_elements(state->'players') p WHERE p->>'token' = $4)
      ON CONFLICT (user_id, topic) DO UPDATE SET expires_at = EXCLUDED.expires_at RETURNING topic`,
      [user.id, topic, input.code, input.token],
    );
    if (!result.rows.length)
      return Response.json(
        { error: "Room expired or invalid player." },
        { status: 403 },
      );
    return Response.json(
      { topic },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const safe = storageFailure(error);
    return Response.json({ error: safe.message }, { status: 503 });
  }
}
