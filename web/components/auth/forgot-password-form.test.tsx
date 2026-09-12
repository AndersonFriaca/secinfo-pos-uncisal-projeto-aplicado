import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FORGOT_PASSWORD_INVALID_ERROR,
  FORGOT_PASSWORD_RATE_LIMITED_ERROR,
  FORGOT_PASSWORD_SENT_MESSAGE,
  ForgotPasswordForm,
} from "./forgot-password-form";

describe("ForgotPasswordForm", () => {
  it("posts to /api/auth/forgot-password with method post", () => {
    const html = renderToStaticMarkup(
      <ForgotPasswordForm csrfToken="tok" sent={false} />,
    );
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/api/auth/forgot-password"');
  });

  it("carries the CSRF token in a hidden csrf_token input", () => {
    const html = renderToStaticMarkup(
      <ForgotPasswordForm csrfToken="the-token" sent={false} />,
    );
    expect(html).toContain('name="csrf_token"');
    expect(html).toContain('value="the-token"');
  });

  it("sent=1 shows the non-enumerating confirmation", () => {
    const html = renderToStaticMarkup(
      <ForgotPasswordForm csrfToken="tok" sent={true} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(FORGOT_PASSWORD_SENT_MESSAGE);
  });

  it("error=invalid shows the invalid-email alert", () => {
    const html = renderToStaticMarkup(
      <ForgotPasswordForm csrfToken="tok" sent={false} error="invalid" />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(FORGOT_PASSWORD_INVALID_ERROR);
  });

  it("error=rate_limited shows the rate-limit alert", () => {
    const html = renderToStaticMarkup(
      <ForgotPasswordForm csrfToken="tok" sent={false} error="rate_limited" />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(FORGOT_PASSWORD_RATE_LIMITED_ERROR);
  });

  it("renders no alert when neither sent nor error is given", () => {
    const html = renderToStaticMarkup(
      <ForgotPasswordForm csrfToken="tok" sent={false} />,
    );
    expect(html).not.toContain('role="alert"');
  });

  it("links the footer to /login", () => {
    const html = renderToStaticMarkup(
      <ForgotPasswordForm csrfToken="tok" sent={false} />,
    );
    expect(html).toContain('href="/login"');
  });
});
