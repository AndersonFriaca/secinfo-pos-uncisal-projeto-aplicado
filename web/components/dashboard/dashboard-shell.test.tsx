import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardShell } from "./dashboard-shell";

describe("DashboardShell", () => {
  it("renders a sidebar trigger", () => {
    const html = renderToStaticMarkup(
      <DashboardShell email="user@example.com" csrfToken="tok" />,
    );
    expect(html).toContain('data-sidebar="trigger"');
  });

  it("renders the breadcrumb current page Painel", () => {
    const html = renderToStaticMarkup(
      <DashboardShell email="user@example.com" csrfToken="tok" />,
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Painel");
  });

  it("renders a welcome heading", () => {
    const html = renderToStaticMarkup(
      <DashboardShell email="user@example.com" csrfToken="tok" />,
    );
    expect(html).toContain("<h1");
    expect(html).toContain("Bem-vindo ao painel");
  });

  it("shows the e-mail at least twice (sidebar footer + main) and renders no style= attribute", () => {
    const html = renderToStaticMarkup(
      <DashboardShell email="user@example.com" csrfToken="tok" />,
    );
    const matches = html.match(/user@example\.com/g);
    expect(matches?.length).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain("style=");
  });

  it("shows the uid in place of e-mail when the user has no e-mail claim", () => {
    const html = renderToStaticMarkup(
      <DashboardShell email="uid-123" csrfToken="tok" />,
    );
    expect(html).toContain("uid-123");
  });
});
