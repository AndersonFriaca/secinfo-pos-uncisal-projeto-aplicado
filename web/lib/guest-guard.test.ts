import { describe, expect, it } from "vitest";
import { guestRedirect } from "./guest-guard";

describe("guestRedirect", () => {
  it("sends an authenticated session to /dashboard", () => {
    expect(
      guestRedirect({
        status: "authenticated",
        user: { uid: "u1", email: "u1@example.com" },
      }),
    ).toBe("/dashboard");
  });

  it("sends an authenticated-but-unverified session to /verify-email", () => {
    expect(guestRedirect({ status: "unverified" })).toBe("/verify-email");
  });

  it("renders (null) for a missing or invalid session", () => {
    expect(guestRedirect({ status: "unauthenticated" })).toBeNull();
  });
});
