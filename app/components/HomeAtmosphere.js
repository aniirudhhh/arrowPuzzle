"use client";
import { useEffect, useRef } from "react";

export default function HomeAtmosphere({ reduced }) {
  const canvas = useRef(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element.getContext("2d");
    if (!context) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0,
      height = 0,
      frame,
      lastFrame = 0;
    const render = (time = 0) => {
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#0d1b2a";
      context.fillRect(0, 0, width, height);
      const t = time / 1000;
      const mobile = width < 700;
      const amplitude = mobile ? 0.025 : 0.055;
      // Layered ribbons share a low centre to frame the headline and actions.
      for (let band = 0; band < 5; band++) {
        const top = [],
          bottom = [];
        for (let x = -40; x <= width + 40; x += 12) {
          const u = x / width;
          const bowl = 1 - (u * 2 - 1) ** 2;
          const wave =
            Math.sin(u * 7 + t * 0.28 + band * 0.4) * amplitude +
            Math.sin(u * 13 - t * 0.18 + band * 0.3) * amplitude * 0.35;
          const y =
            height *
            ((mobile ? 0.68 : 0.57) + bowl * 0.24 + wave + band * 0.022);
          const thickness =
            height *
            (0.025 + (0.035 * (1 + Math.sin(u * 8 + t * 0.22 + band))) / 2);
          top.push([x, y]);
          bottom.push([x, y + thickness]);
        }
        const glow = context.createLinearGradient(0, height * 0.5, 0, height);
        glow.addColorStop(0, "#778da900");
        glow.addColorStop(0.42, band % 2 ? "#778da966" : "#415a77aa");
        glow.addColorStop(1, "#1b263b00");
        context.beginPath();
        top.forEach(([x, y], i) =>
          i ? context.lineTo(x, y) : context.moveTo(x, y),
        );
        bottom.reverse().forEach(([x, y]) => context.lineTo(x, y));
        context.closePath();
        context.fillStyle = glow;
        context.shadowColor = "#778da9";
        context.shadowBlur = mobile ? 14 : 25;
        context.fill();
        context.shadowBlur = 0;
      }
    };
    const tick = (time) => {
      if (time - lastFrame > 1000 / 30) {
        render(time);
        lastFrame = time;
      }
      frame = requestAnimationFrame(tick);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      render(0);
      if (!reduced && !preference.matches && !document.hidden)
        frame = requestAnimationFrame(tick);
    };
    const observer = new ResizeObserver(() => {
      const bounds = element.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      restart();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", restart);
    preference.addEventListener("change", restart);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", restart);
      preference.removeEventListener("change", restart);
    };
  }, [reduced]);
  return (
    <div className="home-atmosphere" aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}
