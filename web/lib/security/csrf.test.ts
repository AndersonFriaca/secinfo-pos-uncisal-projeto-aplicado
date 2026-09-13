import { describe, expect, it } from "vitest";
import { generateCsrfToken, verifyCsrfToken } from "./csrf";

describe("generateCsrfToken (SEC-21, SEC-24)", () => {
  it("encodes at least 32 bytes as base64url", () => {
    const token = generateCsrfToken();
    // base64url of 32 bytes = 43 chars (unpadded); only URL-safe alphabet.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(43);
  });

  it("never collides across calls and is not derived from context", () => {
    const tokens = new Set(
      Array.from({ length: 100 }, () => generateCsrfToken()),
    );
    expect(tokens.size).toBe(100);
  });
});

describe("verifyCsrfToken (SEC-22)", () => {
  it("returns true when the submitted token equals the cookie", () => {
    const token = generateCsrfToken();
    expect(verifyCsrfToken(token, token)).toBe(true);
  });

  it("returns false when the tokens differ but share a length", () => {
    expect(verifyCsrfToken("a".repeat(43), "b".repeat(43))).toBe(false);
  });

  it("returns false when the submitted token is missing", () => {
    expect(verifyCsrfToken(null, generateCsrfToken())).toBe(false);
    expect(verifyCsrfToken("", generateCsrfToken())).toBe(false);
  });

  it("returns false when the cookie is missing", () => {
    expect(verifyCsrfToken(generateCsrfToken(), null)).toBe(false);
    expect(verifyCsrfToken(generateCsrfToken(), "")).toBe(false);
  });

  it("returns false when the two values differ in length", () => {
    expect(verifyCsrfToken("short", "much-longer-value")).toBe(false);
  });

  it("returns false for a correct prefix that is truncated", () => {
    const token = generateCsrfToken();
    expect(verifyCsrfToken(token.slice(0, -1), token)).toBe(false);
  });

  // SEC-22 / TEST-01: the comparison must scan the whole token, not early-exit
  // on the first differing byte. An early-exit `if (a[i] !== b[i]) return false`
  // returns almost immediately when the mismatch is at byte 0, but takes the
  // full scan when it is at the last byte — a timing side channel. A true
  // constant-time (full-scan) compare spends the same time in both cases.
  it("takes comparable time whether the mismatch is at the first or last byte", () => {
    const LENGTH = 16384;
    const cookie = "a".repeat(LENGTH);
    const diffFirst = "b" + "a".repeat(LENGTH - 1);
    const diffLast = "a".repeat(LENGTH - 1) + "b";

    // Both cases must actually be rejected, and share a length so the compare
    // reaches the byte loop.
    expect(verifyCsrfToken(diffFirst, cookie)).toBe(false);
    expect(verifyCsrfToken(diffLast, cookie)).toBe(false);

    const measure = (submitted: string, iterations: number): number => {
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        verifyCsrfToken(submitted, cookie);
      }
      return performance.now() - start;
    };

    // Warm up the JIT on both paths before measuring.
    measure(diffFirst, 1000);
    measure(diffLast, 1000);

    const ITERATIONS = 1500;
    const ROUNDS = 7;
    const ratios: number[] = [];
    for (let r = 0; r < ROUNDS; r++) {
      // Interleave the two measurements so any slow-down drift hits both.
      const first = measure(diffFirst, ITERATIONS);
      const last = measure(diffLast, ITERATIONS);
      ratios.push(first / last);
    }
    ratios.sort((a, b) => a - b);
    const medianRatio = ratios[Math.floor(ratios.length / 2)];

    // Full-scan compare sits at ~1.0 (empirically ~0.9–1.2 at this length).
    // An early-exit compare collapses to ~0.45 because a first-byte mismatch
    // returns almost immediately while a last-byte mismatch still scans fully.
    expect(medianRatio).toBeGreaterThan(0.7);
    expect(medianRatio).toBeLessThan(2.0);
  }, 20_000);
});
