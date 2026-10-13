import { ImageResponse } from "next/og";
export const alt =
  "ArrowOut - Free online arrow puzzle game. Think. Tap. Escape.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0d1b2a",
        color: "#f4f7fc",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 110,
          fontWeight: 700,
          letterSpacing: -6,
        }}
      >
        ARROW<span style={{ color: "#e0e1dd" }}>//</span>OUT
      </div>
      <div style={{ fontSize: 34, color: "#e0e1dd", marginTop: 24 }}>
        Think. Tap. Escape.
      </div>
      <div style={{ fontSize: 24, color: "#8793a8", marginTop: 40 }}>
        Free arrow puzzles - Daily challenges - Race a friend
      </div>
      <div style={{ fontSize: 22, color: "#8793a8", marginTop: 40 }}>
        arrowout.xyz
      </div>
    </div>,
    size,
  );
}
