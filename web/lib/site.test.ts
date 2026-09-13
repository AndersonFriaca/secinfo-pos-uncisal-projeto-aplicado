import { describe, expect, it } from "vitest";
import { SITE_DESCRIPTION, SITE_NAME } from "./site";

const FORBIDDEN_WORDS = ["seguro", "OWASP", "verificação", "login", "painel"];

describe("site constants", () => {
  it("SITE_DESCRIPTION is non-empty and contains none of the forbidden words, case-insensitively", () => {
    expect(SITE_NAME.length).toBeGreaterThan(0);
    expect(SITE_DESCRIPTION.length).toBeGreaterThan(0);
    const lowered = SITE_DESCRIPTION.toLowerCase();
    for (const word of FORBIDDEN_WORDS) {
      expect(lowered).not.toContain(word.toLowerCase());
    }
  });
});
