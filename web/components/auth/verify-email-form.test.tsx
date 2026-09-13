import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RESENT_MESSAGE, VerifyEmailForm } from "./verify-email-form";

describe("VerifyEmailForm", () => {
  it("posts to /api/auth/resend-verification with a hidden csrf_token", () => {
    const html = renderToStaticMarkup(
      <VerifyEmailForm csrfToken="the-token" resent={false} />,
    );
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/api/auth/resend-verification"');
    expect(html).toContain('name="csrf_token"');
    expect(html).toContain('value="the-token"');
  });

  it("renders email and password fields with current-password autocomplete", () => {
    const html = renderToStaticMarkup(
      <VerifyEmailForm csrfToken="tok" resent={false} />,
    );
    expect(html).toContain('name="email"');
    expect(html).toContain('type="email"');
    expect(html).toContain('name="password"');
    expect(html).toContain('autoComplete="current-password"');
  });

  it("shows the resend alert with RESENT_MESSAGE when resent is true", () => {
    const html = renderToStaticMarkup(
      <VerifyEmailForm csrfToken="tok" resent={true} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(RESENT_MESSAGE);
  });

  it("renders no alert when resent is false", () => {
    const html = renderToStaticMarkup(
      <VerifyEmailForm csrfToken="tok" resent={false} />,
    );
    expect(html).not.toContain('role="alert"');
  });

  it("links the footer to /login", () => {
    const html = renderToStaticMarkup(
      <VerifyEmailForm csrfToken="tok" resent={false} />,
    );
    expect(html).toContain('href="/login"');
  });
});
