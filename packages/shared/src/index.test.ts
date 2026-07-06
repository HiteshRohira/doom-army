import { describe, expect, it } from "vitest";
import { sanitizeInput } from "./index";

describe("sanitizeInput", () => {
  it("clamps movement and normalizes aim", () => {
    const input = sanitizeInput({ moveX: 4, aimX: 3, aimY: 4, firing: true });
    expect(input.moveX).toBe(1);
    expect(input.aimX).toBeCloseTo(0.6);
    expect(input.aimY).toBeCloseTo(0.8);
    expect(input.firing).toBe(true);
  });

  it("rejects malformed numeric input", () => {
    const input = sanitizeInput({ moveX: Number.NaN, aimX: Number.POSITIVE_INFINITY, aimY: 0 });
    expect(input.moveX).toBe(0);
    expect(input.aimX).toBe(1);
    expect(input.aimY).toBe(0);
  });
});

