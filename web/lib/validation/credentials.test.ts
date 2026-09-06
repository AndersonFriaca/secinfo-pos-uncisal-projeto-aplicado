import { describe, expect, it } from "vitest";
import { normalizeEmail, validatePassword } from "./credentials";

describe("normalizeEmail (AUTH-05)", () => {
  it("trims surrounding whitespace and lowercases", () => {
    expect(normalizeEmail("  User@Example.COM  ")).toBe("user@example.com");
  });

  it("returns a already-normal address unchanged", () => {
    expect(normalizeEmail("user@example.com")).toBe("user@example.com");
  });

  it("rejects an address with no @", () => {
    expect(normalizeEmail("userexample.com")).toBeNull();
  });

  it("rejects an address with no dot in the domain", () => {
    expect(normalizeEmail("user@example")).toBeNull();
  });

  it("rejects an address containing whitespace", () => {
    expect(normalizeEmail("us er@example.com")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(normalizeEmail("   ")).toBeNull();
  });

  it("accepts an address of exactly 254 characters", () => {
    const email = `${"a".repeat(242)}@example.com`;
    expect(email).toHaveLength(254);
    expect(normalizeEmail(email)).toBe(email);
  });

  it("rejects an address of 255 characters", () => {
    const email = `${"a".repeat(243)}@example.com`;
    expect(email).toHaveLength(255);
    expect(normalizeEmail(email)).toBeNull();
  });
});

describe("validatePassword (AUTH-02)", () => {
  it("accepts a password meeting every rule", () => {
    expect(validatePassword("Abcdef1!ghij")).toEqual({ ok: true });
  });

  it("reports 'length' for a password under 12 characters failing only length", () => {
    expect(validatePassword("Abc1!def")).toEqual({ ok: false, failed: "length" });
  });

  it("reports 'lowercase' when only the lowercase rule is unmet", () => {
    expect(validatePassword("ABCDEFG1234!")).toEqual({
      ok: false,
      failed: "lowercase",
    });
  });

  it("reports 'uppercase' when only the uppercase rule is unmet", () => {
    expect(validatePassword("abcdefg1234!")).toEqual({
      ok: false,
      failed: "uppercase",
    });
  });

  it("reports 'digit' when only the digit rule is unmet", () => {
    expect(validatePassword("Abcdefghij!!")).toEqual({
      ok: false,
      failed: "digit",
    });
  });

  it("reports 'symbol' when only the symbol rule is unmet", () => {
    expect(validatePassword("Abcdefghij12")).toEqual({
      ok: false,
      failed: "symbol",
    });
  });

  it("accepts a password of exactly 12 characters", () => {
    expect(validatePassword("Abcdefghi1!x")).toEqual({ ok: true });
  });
});
