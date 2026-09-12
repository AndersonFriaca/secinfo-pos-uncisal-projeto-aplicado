import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthShell } from "./auth-shell";

// UI-01, UI-02: one shared, card-less centered column for the auth screens.
describe("AuthShell", () => {
  const html = renderToStaticMarkup(
    <AuthShell
      title="Entrar"
      description="Informe seu e-mail e senha."
      footer={<span>Footer link</span>}
    >
      <div data-testid="form-body">Form body</div>
    </AuthShell>,
  );

  it("renders title, description, children, and footer in order", () => {
    const titleIndex = html.indexOf("Entrar");
    const descriptionIndex = html.indexOf("Informe seu e-mail e senha.");
    const childrenIndex = html.indexOf("Form body");
    const footerIndex = html.indexOf("Footer link");

    expect(titleIndex).toBeGreaterThan(-1);
    expect(descriptionIndex).toBeGreaterThan(titleIndex);
    expect(childrenIndex).toBeGreaterThan(descriptionIndex);
    expect(footerIndex).toBeGreaterThan(childrenIndex);
  });

  it("caps the column width at max-w-sm", () => {
    expect(html).toContain("max-w-sm");
  });

  it("renders no data-slot=\"card\" element", () => {
    expect(html).not.toContain('data-slot="card"');
  });
});
