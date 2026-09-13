import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";

function render(email: string, csrfToken: string) {
  return renderToStaticMarkup(
    <SidebarProvider>
      <AppSidebar email={email} csrfToken={csrfToken} />
    </SidebarProvider>,
  );
}

describe("AppSidebar", () => {
  it("renders the brand in the header", () => {
    const html = render("user@example.com", "tok");
    expect(html).toContain("Projeto Aplicado");
  });

  it("renders exactly one menu button, wrapping the active /dashboard link labelled Painel", () => {
    const html = render("user@example.com", "tok");
    const matches = html.match(/data-sidebar="menu-button"/g);
    expect(matches?.length).toBe(1);
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("Painel");
    expect(html).toContain('data-active="true"');
  });

  it("shows the given e-mail in the footer", () => {
    const html = render("user@example.com", "tok");
    expect(html).toContain("user@example.com");
  });

  it("renders a logout form posting to /api/auth/logout with the given CSRF token and a Sair button", () => {
    const html = render("user@example.com", "the-token");
    expect(html).toContain('action="/api/auth/logout"');
    expect(html).toContain('method="post"');
    expect(html).toContain('name="csrf_token"');
    expect(html).toContain('value="the-token"');
    expect(html).toContain("Sair");
  });

  it("renders with no style= attribute", () => {
    const html = render("user@example.com", "tok");
    expect(html).not.toContain("style=");
  });
});
