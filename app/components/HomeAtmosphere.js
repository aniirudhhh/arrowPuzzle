"use client";
import { useEffect, useRef } from "react";

export default function HomeAtmosphere({ reduced }) {
  const canvas = useRef(null),
    matrix = useRef(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element.getContext("2d");
    const dots = matrix.current.getContext("2d");
    if (!context || !dots) return;
    const cursor = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      strength: 0,
      active: false,
    };
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
      const still = reduced || preference.matches;
      cursor.x += (cursor.targetX - cursor.x) * 0.18;
      cursor.y += (cursor.targetY - cursor.y) * 0.18;
      cursor.strength +=
        ((cursor.active && !still ? 1 : 0) - cursor.strength) * 0.12;
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
      dots.clearRect(0, 0, width, height);
      const spacing = mobile ? 26 : 20;
      const radius = 145;
      for (let y = 10; y < height; y += spacing) {
        for (let x = 10; x < width; x += spacing) {
          const dx = x - cursor.x,
            dy = y - cursor.y;
          const distance = Math.hypot(dx, dy);
          const influence =
            Math.max(0, 1 - distance / radius) ** 2 * cursor.strength;
          const shift = influence * 10;
          const px = x + (dx / (distance || 1)) * shift;
          const py = y + (dy / (distance || 1)) * shift;
          dots.fillStyle = `rgba(119,141,169,${0.17 + influence * 0.7})`;
          dots.beginPath();
          dots.arc(px, py, 0.85 + influence * 1.1, 0, Math.PI * 2);
          dots.fill();
        }
      }
    };
    const point = (event) => {
      if (event.pointerType !== "mouse" || reduced || preference.matches)
        return;
      const bounds = element.getBoundingClientRect();
      cursor.targetX = event.clientX - bounds.left;
      cursor.targetY = event.clientY - bounds.top;
      cursor.active =
        cursor.targetX >= 0 &&
        cursor.targetX <= width &&
        cursor.targetY >= 0 &&
        cursor.targetY <= height;
    };
    const leave = () => {
      cursor.active = false;
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
      matrix.current.width = element.width;
      matrix.current.height = element.height;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      dots.setTransform(ratio, 0, 0, ratio, 0, 0);
      restart();
    });
    observer.observe(element);
    window.addEventListener("pointermove", point, { passive: true });
    document.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    document.addEventListener("visibilitychange", restart);
    preference.addEventListener("change", restart);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", point);
      document.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
      document.removeEventListener("visibilitychange", restart);
      preference.removeEventListener("change", restart);
    };
  }, [reduced]);
  return (
    <div className="home-atmosphere" aria-hidden="true">
      <canvas ref={canvas} />
      <canvas ref={matrix} className="home-dot-matrix" />
    </div>
  );
}
