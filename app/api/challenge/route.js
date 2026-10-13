import { challengeRequest, playerToken } from "../../../lib/challenge-store.js";
import { AttemptError } from "../../../lib/challenge-attempt.js";
export const runtime = "nodejs";
export async function POST(request) {
  try {
    if (!process.env.DATABASE_URL)
      return Response.json(
        { error: "Ranked challenges are not configured yet." },
        { status: 503 },
      );
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return Response.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    const token = playerToken(request);
    const body = await request.text();
    if (body.length > 12000)
      return Response.json({ error: "Request too large." }, { status: 413 });
    const result = await challengeRequest(JSON.parse(body), token);
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": `arrow-player=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${process.env.NETLIFY ? "; Secure" : ""}`,
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError)
      return Response.json({ error: "Invalid JSON request." }, { status: 400 });
    if (error instanceof AttemptError)
      return Response.json({ error: error.message }, { status: 400 });
    console.error("Leaderboard storage failure", {
      code: /^[A-Z0-9_]+$/.test(error.code || "") ? error.code : "UNKNOWN",
    });
    return Response.json(
      { error: "Leaderboard unavailable. Please try again shortly." },
      { status: 503 },
    );
  }
}
