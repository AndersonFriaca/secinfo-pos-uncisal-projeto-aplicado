import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LOGIN_GENERIC_ERROR, LoginForm } from "./login-form";

describe("LoginForm", () => {
  it("posts to /api/auth/login with method post", () => {
    const html = renderToStaticMarkup(
      <LoginForm csrfToken="tok" error={false} />,
    );
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/api/auth/login"');
  });

  it("carries the CSRF token in a hidden csrf_token input", () => {
    const html = renderToStaticMarkup(
      <LoginForm csrfToken="the-token" error={false} />,
    );
    expect(html).toContain('name="csrf_token"');
    expect(html).toContain('value="the-token"');
  });

  it("renders an empty hidden csrf_token value when the token is empty", () => {
    const html = renderToStaticMarkup(<LoginForm csrfToken="" error={false} />);
    expect(html).toMatch(/name="csrf_token" value=""/);
  });

  it("renders required, correctly-typed email and password fields", () => {
    const html = renderToStaticMarkup(
      <LoginForm csrfToken="tok" error={false} />,
    );
    expect(html).toContain('name="email"');
    expect(html).toContain('type="email"');
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain('name="password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html.match(/required=""/g)?.length).toBe(2);
  });

  it("shows the generic error alert when error is true", () => {
    const html = renderToStaticMarkup(
      <LoginForm csrfToken="tok" error={true} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(LOGIN_GENERIC_ERROR);
  });

  it("renders no alert when error is false", () => {
    const html = renderToStaticMarkup(
      <LoginForm csrfToken="tok" error={false} />,
    );
    expect(html).not.toContain('role="alert"');
  });

  it("links the footer to /signup and renders no card", () => {
    const html = renderToStaticMarkup(
      <LoginForm csrfToken="tok" error={false} />,
    );
    expect(html).toContain('href="/signup"');
    expect(html).not.toContain('data-slot="card"');
  });
});
