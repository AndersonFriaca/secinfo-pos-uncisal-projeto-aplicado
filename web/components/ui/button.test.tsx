import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Link from "next/link";
import { Button } from "./button";

// Harness smoke test (T1): proves the .tsx transform and next/link work
// under react-dom/server outside a Next router context, before any
// presentational component depends on that assumption.
describe("Button asChild + next/link (harness smoke test)", () => {
  it("renders an anchor with the link's href", () => {
    const html = renderToStaticMarkup(
      <Button asChild>
        <Link href="/login">Entrar</Link>
      </Button>,
    );

    expect(html).toMatch(/^<a /);
    expect(html).toContain('href="/login"');
    expect(html).toContain(">Entrar</a>");
  });
});
