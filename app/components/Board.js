"use client";
import { useRef, useEffect, useState } from "react";
import { arrowGeometry } from "../../lib/arrow-geometry";
export function FlowingArrow({
  route,
  length = 46,
  duration = 14000,
  delay = 0,
  escape = false,
  onMove,
}) {
  const body = useRef(null),
    head = useRef(null);
  useEffect(() => {
    let frame;
    const geometry = arrowGeometry(route),
      total = geometry.total;
    let origin;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const draw = (distance) => {
      const end = Math.min(total, distance),
        start = Math.max(0, distance - length);
      const segment = geometry.slice(start, end);
      body.current.setAttribute("d", segment.d);
      head.current.setAttribute(
        "transform",
        `translate(${segment.x} ${segment.y}) rotate(${segment.angle})`,
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
export function Board({
  paths,
  size,
  onMove,
  active,
  hint,
  decorative = false,
  onPreview,
}) {
  const touchStart = useRef(null),
    lastTouch = useRef(0),
    holdTimer = useRef(null);
  const [preview, setPreview] = useState(null);
  useEffect(() => () => clearTimeout(holdTimer.current), []);
  const endHold = () => {
    clearTimeout(holdTimer.current);
    setPreview(null);
  };
  const guidePath = paths.find((p) => p.id === preview);
  let guide = null;
  if (guidePath) {
    const [hx, hy] = guidePath.cells[0];
    const [dx, dy] = {
      right: [1, 0],
      left: [-1, 0],
      up: [0, -1],
      down: [0, 1],
    }[guidePath.d];
    const occupied = new Set(
      paths.flatMap((p) => p.cells.map(([x, y]) => `${x},${y}`)),
    );
    let x = hx + dx,
      y = hy + dy;
    while (
      x >= 0 &&
      y >= 0 &&
      x < size &&
      y < size &&
      !occupied.has(`${x},${y}`)
    ) {
      x += dx;
      y += dy;
    }
    guide = { hx, hy, x, y, blocked: x >= 0 && y >= 0 && x < size && y < size };
  }
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
      {guide && (
        <g
          className={`path-preview ${guide.blocked ? "preview-blocked" : ""}`}
          aria-hidden="true"
        >
          <line
            x1={offset + guide.hx * unit}
            y1={offset + guide.hy * unit}
            x2={offset + guide.x * unit}
            y2={offset + guide.y * unit}
          />
          <circle
            cx={offset + guide.x * unit}
            cy={offset + guide.y * unit}
            r="5"
          />
        </g>
      )}
      {paths.map((p) => {
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
            className={`puzzle-path tone-${p.id % 5} ${active?.id === p.id ? active.type : ""} ${hint === p.id ? "hinted" : ""}`}
            style={{
              "--tx":
                p.d === "right" ? "650px" : p.d === "left" ? "-650px" : "0px",
              "--ty":
                p.d === "down" ? "650px" : p.d === "up" ? "-650px" : "0px",
            }}
            tabIndex={decorative ? undefined : 0}
            role={decorative ? undefined : "button"}
            aria-label={`Path ${p.id + 1}, points ${p.d}. Activate to escape.`}
            onPointerDown={(e) => {
              if (decorative || active || e.button !== 0) return;
              lastTouch.current = 0;
              touchStart.current = {
                id: e.pointerId,
                x: e.clientX,
                y: e.clientY,
                held: false,
              };
              e.currentTarget.setPointerCapture?.(e.pointerId);
              clearTimeout(holdTimer.current);
              holdTimer.current = setTimeout(() => {
                if (!touchStart.current || onPreview?.(p) === false) return;
                touchStart.current.held = true;
                setPreview(p.id);
              }, 400);
            }}
            onPointerMove={(e) => {
              const start = touchStart.current;
              if (
                start &&
                Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10
              ) {
                start.cancelled = true;
                endHold();
              }
            }}
            onPointerCancel={() => {
              touchStart.current = null;
              lastTouch.current = Date.now();
              endHold();
            }}
            onPointerUp={(e) => {
              const start = touchStart.current;
              touchStart.current = null;
              endHold();
              if (decorative || start?.id !== e.pointerId) return;
              if (start.held || start.cancelled) {
                lastTouch.current = Date.now();
                e.preventDefault();
                return;
              }
              if (e.pointerType === "mouse") return;
              lastTouch.current = Date.now();
              e.preventDefault();
              onMove(p);
            }}
            onContextMenu={(e) => {
              if (!decorative) e.preventDefault();
            }}
            onClick={(e) => {
              if (
                !decorative &&
                (e.detail === 0 || Date.now() - lastTouch.current > 800)
              )
                onMove(p);
            }}
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
