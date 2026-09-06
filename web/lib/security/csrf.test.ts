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
});
