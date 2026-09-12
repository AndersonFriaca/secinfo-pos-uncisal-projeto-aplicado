import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";

/**
 * Dashboard application shell: sidebar + header (trigger, breadcrumb) + a
 * centered welcome message (UI-07, UI-09, UI-11).
 */
export function DashboardShell({
  email,
  csrfToken,
}: {
  email: string;
  csrfToken: string;
}) {
  return (
    <SidebarProvider>
      <AppSidebar email={email} csrfToken={csrfToken} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Painel</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Bem-vindo ao painel
          </h1>
          <p className="text-sm text-muted-foreground">
            Você está autenticado como {email}
          </p>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
