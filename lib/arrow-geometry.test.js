import test from "node:test";
import assert from "node:assert/strict";
import { arrowGeometry } from "./arrow-geometry.js";
test("sliding geometry retains bends and exact endpoints without browser sampling", () => {
  const geometry = arrowGeometry("M0 0 L40 0 L40 40 L80 40");
  assert.equal(geometry.total, 120);
  assert.deepEqual(geometry.slice(20, 100), {
    d: "M20 0 L40 0 L40 40 L60 40",
    x: 60,
    y: 40,
    angle: 0,
  });
  assert.equal(geometry.slice(50, 70).angle, 90);
  assert.equal(geometry.slice(80, 120).d, "M40 40 L80 40");
});
