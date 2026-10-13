// Routes are straight segments joined by M/L commands in Board.
export function arrowGeometry(route) {
  const numbers = route.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const points = [];
  for (let i = 0; i < numbers.length; i += 2)
    points.push([numbers[i], numbers[i + 1]]);
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(
      lengths.at(-1) +
        Math.hypot(
          points[i][0] - points[i - 1][0],
          points[i][1] - points[i - 1][1],
        ),
    );
  const total = lengths.at(-1);
  const at = (distance) => {
    const clamped = Math.max(0, Math.min(total, distance));
    let i = 1;
    while (i < lengths.length - 1 && lengths[i] < clamped) i++;
    const t = (clamped - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1);
    return [
      points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
      points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
    ];
  };
  return {
    total,
    slice(start, end) {
      const a = at(start),
        b = at(end),
        before = at(Math.max(start, end - 0.1));
      const visible = [
        a,
        ...points.filter((_, i) => lengths[i] > start && lengths[i] < end),
        b,
      ];
      return {
        d: visible.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" "),
        x: b[0],
        y: b[1],
        angle: (Math.atan2(b[1] - before[1], b[0] - before[0]) * 180) / Math.PI,
      };
    },
  };
}
