import { describe, expect, it } from "vitest";
import { dashboardRedirect } from "./dashboard-guard";

describe("dashboardRedirect (AUTH-06)", () => {
  it("sends an authenticated-but-unverified session to /verify-email", () => {
    expect(dashboardRedirect({ status: "unverified" })).toBe("/verify-email");
  });

  it("sends a missing or invalid session to /login", () => {
    expect(dashboardRedirect({ status: "unauthenticated" })).toBe("/login");
  });

  it("renders (null) for an authenticated session", () => {
    expect(
      dashboardRedirect({
        status: "authenticated",
        user: { uid: "u1", email: "u1@example.com" },
      }),
    ).toBeNull();
  });
});
