import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarTrigger,
} from "./sidebar";

// UI-09: the shadcn sidebar block ships three inline `style=` props that
// break under the nonce-only `style-src` CSP (headers.ts). T4 strips them;
// this test asserts the invariant holds for the whole rendered tree.
function renderTree() {
  return renderToStaticMarkup(
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>Brand</SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton>Item</SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuSkeleton showIcon />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>Footer</SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <SidebarTrigger />
        Content
      </SidebarInset>
    </SidebarProvider>,
  );
}

describe("sidebar primitives — CSP (UI-09)", () => {
  it("renders with no style= attribute anywhere in the tree", () => {
    const html = renderTree();
    expect(html).not.toContain("style=");
  });

  it("renders the desktop sidebar wrapper and sidebar slots", () => {
    const html = renderTree();
    expect(html).toContain('data-slot="sidebar-wrapper"');
    expect(html).toContain('data-slot="sidebar"');
  });
});
