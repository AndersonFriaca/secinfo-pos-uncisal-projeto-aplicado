import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LandingContent } from "./landing-content";

describe("LandingContent", () => {
  it("renders the brand name, and links to /signup and /login", () => {
    const html = renderToStaticMarkup(
      <LandingContent navLink={{ href: "/login", label: "Entrar" }} />,
    );
    expect(html).toContain("Projeto Aplicado");
    expect(html).toContain('href="/signup"');
    expect(html).toContain('href="/login"');
  });

  it("renders the given navLink href and label in the header", () => {
    const html = renderToStaticMarkup(
      <LandingContent
        navLink={{ href: "/dashboard", label: "Ir para o painel" }}
      />,
    );
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("Ir para o painel");
  });

  it("contains none of the removed security-control copy", () => {
    const html = renderToStaticMarkup(
      <LandingContent navLink={{ href: "/login", label: "Entrar" }} />,
    );
    expect(html).not.toContain("O que esta demonstração cobre");
    expect(html).not.toContain("OWASP");
    expect(html).not.toContain("Firebase");
    expect(html).not.toContain("CSRF");
    expect(html).not.toContain("CSP");
    expect(html).not.toContain("headers");
    expect(html).not.toContain("força bruta");
  });

  it("renders no card", () => {
    const html = renderToStaticMarkup(
      <LandingContent navLink={{ href: "/login", label: "Entrar" }} />,
    );
    expect(html).not.toContain('data-slot="card"');
  });
});
