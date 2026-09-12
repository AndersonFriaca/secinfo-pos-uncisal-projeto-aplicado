import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SIGNUP_GENERIC_ERROR, SignupForm } from "./signup-form";

describe("SignupForm", () => {
  it("posts to /api/auth/signup with method post", () => {
    const html = renderToStaticMarkup(
      <SignupForm csrfToken="tok" error={false} />,
    );
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/api/auth/signup"');
  });

  it("carries the CSRF token in a hidden csrf_token input", () => {
    const html = renderToStaticMarkup(
      <SignupForm csrfToken="the-token" error={false} />,
    );
    expect(html).toContain('name="csrf_token"');
    expect(html).toContain('value="the-token"');
  });

  it("enforces minLength=12 and new-password autocomplete on the password field", () => {
    const html = renderToStaticMarkup(
      <SignupForm csrfToken="tok" error={false} />,
    );
    expect(html).toContain('minLength="12"');
    expect(html).toContain('autoComplete="new-password"');
  });

  it("shows the generic error alert when error is true", () => {
    const html = renderToStaticMarkup(
      <SignupForm csrfToken="tok" error={true} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(SIGNUP_GENERIC_ERROR);
  });

  it("renders no alert and no password-rule copy when error is false", () => {
    const html = renderToStaticMarkup(
      <SignupForm csrfToken="tok" error={false} />,
    );
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("Pelo menos 12 caracteres");
    expect(html).not.toContain("Uma letra minúscula e uma maiúscula");
    expect(html).not.toContain("Um dígito");
    expect(html).not.toContain("Um símbolo");
  });

  it("links the footer to /login", () => {
    const html = renderToStaticMarkup(
      <SignupForm csrfToken="tok" error={false} />,
    );
    expect(html).toContain('href="/login"');
  });
});
