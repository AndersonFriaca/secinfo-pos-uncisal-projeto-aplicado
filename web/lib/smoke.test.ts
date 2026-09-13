import { describe, expect, it } from "vitest";

// Proves the Vitest runner is wired and picks up web/**/*.test.ts.
describe("test runner", () => {
  it("executes and evaluates assertions", () => {
    expect(1 + 1).toBe(2);
  });
});
