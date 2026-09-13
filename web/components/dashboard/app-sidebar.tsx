import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/**
 * Project sidebar for the dashboard shell (UI-06, UI-08). One "Painel" menu
 * item and a footer with the user's e-mail (or `uid`) plus the logout form —
 * markup reused from the previous `app/dashboard/page.tsx`.
 */
export function AppSidebar({
  email,
  csrfToken,
}: {
  email: string;
  csrfToken: string;
}) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <span className="px-2 py-1 font-heading text-sm font-semibold">
          Projeto Aplicado
        </span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive>
                <Link href="/dashboard">
                  <LayoutDashboard />
                  <span>Painel</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <p className="truncate px-2 text-xs text-muted-foreground">{email}</p>
        <form method="post" action="/api/auth/logout">
          <input type="hidden" name="csrf_token" value={csrfToken} />
          <Button type="submit" variant="outline" size="sm" className="w-full">
            Sair
          </Button>
        </form>
      </SidebarFooter>
    </Sidebar>
  );
}
