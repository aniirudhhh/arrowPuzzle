import { handleRaceAction } from "../../../lib/race-store.js";
export const runtime = "nodejs";
export async function POST(request) {
  try {
    const input = await request.json();
    if (
      ![
        "create",
        "join",
        "poll",
        "ready",
        "difficulty",
        "start",
        "move",
        "rematch",
        "accept-rematch",
        "decline-rematch",
        "leave",
      ].includes(input.action)
    )
      throw Error("Invalid action.");
    return Response.json(await handleRaceAction(input), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error.message, code: error.code },
      {
        status:
          error.code === "ROOM_NOT_FOUND"
            ? 404
            : error.code === "STORAGE_UNAVAILABLE"
              ? 503
              : 400,
      },
    );
  }
}
