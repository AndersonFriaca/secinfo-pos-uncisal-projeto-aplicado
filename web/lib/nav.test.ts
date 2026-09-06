import { describe, expect, it } from "vitest";
import { headerNavLink } from "./nav";

describe("headerNavLink (APP-01, APP-04)", () => {
  it("links an anonymous visitor to /login", () => {
    expect(headerNavLink(null)).toEqual({ href: "/login", label: "Log in" });
  });

  it("links an authenticated visitor to /dashboard", () => {
    expect(headerNavLink({ uid: "u1", email: "u1@example.com" })).toEqual({
      href: "/dashboard",
      label: "Go to dashboard",
    });
  });

  it("never exposes Firebase config or a NEXT_PUBLIC value in either branch (APP-04)", () => {
    const outputs = JSON.stringify([
      headerNavLink(null),
      headerNavLink({ uid: "u1", email: "u1@example.com" }),
    ]);
    expect(outputs).not.toMatch(/NEXT_PUBLIC|apiKey|firebase|projectId|authDomain/i);
  });
});
