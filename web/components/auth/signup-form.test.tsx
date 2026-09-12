import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SIGNUP_GENERIC_ERROR,
  SIGNUP_RATE_LIMITED_ERROR,
  SIGNUP_UNAVAILABLE_ERROR,
  SignupForm,
} from "./signup-form";

describe("SignupForm", () => {
  it("posts to /api/auth/signup with method post", () => {
    const html = renderToStaticMarkup(<SignupForm csrfToken="tok" />);
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/api/auth/signup"');
  });

  it("carries the CSRF token in a hidden csrf_token input", () => {
    const html = renderToStaticMarkup(
      <SignupForm csrfToken="the-token" />,
    );
    expect(html).toContain('name="csrf_token"');
    expect(html).toContain('value="the-token"');
  });

  it("enforces minLength=12 and new-password autocomplete on the password field", () => {
    const html = renderToStaticMarkup(<SignupForm csrfToken="tok" />);
    expect(html).toContain('minLength="12"');
    expect(html).toContain('autoComplete="new-password"');
  });

  it("error=invalid shows the generic error alert (AUTH-19)", () => {
    const html = renderToStaticMarkup(
      <SignupForm csrfToken="tok" error="invalid" />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(SIGNUP_GENERIC_ERROR);
  });

  it("error=rate_limited shows the rate-limit-specific alert", () => {
    const html = renderToStaticMarkup(
      <SignupForm csrfToken="tok" error="rate_limited" />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(SIGNUP_RATE_LIMITED_ERROR);
  });

  it("error=unavailable shows the unavailable-specific alert", () => {
    const html = renderToStaticMarkup(
      <SignupForm csrfToken="tok" error="unavailable" />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(SIGNUP_UNAVAILABLE_ERROR);
  });

  it("an unrecognized error code falls back to the generic message", () => {
    const html = renderToStaticMarkup(
      <SignupForm csrfToken="tok" error="something-else" />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(SIGNUP_GENERIC_ERROR);
  });

  it("renders no alert and no password-rule copy when no error is given", () => {
    const html = renderToStaticMarkup(<SignupForm csrfToken="tok" />);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("Pelo menos 12 caracteres");
    expect(html).not.toContain("Uma letra minúscula e uma maiúscula");
    expect(html).not.toContain("Um dígito");
    expect(html).not.toContain("Um símbolo");
  });

  it("links the footer to /login", () => {
    const html = renderToStaticMarkup(<SignupForm csrfToken="tok" />);
    expect(html).toContain('href="/login"');
  });
});
